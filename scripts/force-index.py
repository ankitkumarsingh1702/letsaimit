#!/usr/bin/env python3
"""Verify a deployed production site and notify supported indexing providers.

The default is a read-only dry run. --submit sends notifications after every live
gate passes. GOOGLE_ACCESS_TOKEN must have the webmasters OAuth scope. The
indexing scope is also required when a real JobPosting or live BroadcastEvent
page is eligible for Google's restricted Indexing API. --inspect additionally
reads Search Console's indexed-version diagnostics.

State is saved independently for each provider. Keep --state on durable storage
between deployments. IndexNow 202 remains pending and can be checked on retry.
Provider acknowledgment is a notification receipt, not proof of indexing.
"""

import argparse
import concurrent.futures
import datetime as dt
import email.utils
import fcntl
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from html.parser import HTMLParser


PRODUCTION_ORIGIN = "https://letsaimit.com"
INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
GOOGLE_INDEXING_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish"
SEARCH_CONSOLE_ENDPOINT = "https://www.googleapis.com/webmasters/v3/sites/"
INSPECTION_ENDPOINT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"
BOTS = (
    "Googlebot", "Bingbot", "OAI-SearchBot", "ChatGPT-User",
    "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User",
)
PRIVATE_PATHS = ("/admin", "/parent", "/coach-dashboard", "/sign-in", "/register", "/404", "/api")
SITEMAP_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
MAX_PAGE_BYTES = 2 * 1024 * 1024
MAX_SITEMAP_BYTES = 50 * 1024 * 1024


class IndexingError(Exception):
    """Bounded diagnostic code. Never includes provider bodies or credentials."""


@dataclass
class Response:
    status: int
    headers: dict
    body: bytes


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, new_url):
        return None


class HttpClient:
    def __init__(self):
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, url, method="GET", payload=None, token=None, limit=MAX_PAGE_BYTES):
        headers = {"User-Agent": "LetsAimIt-Indexing-Verification/1.0", "Accept": "*/*"}
        body = None
        if payload is not None:
            headers["Content-Type"] = "application/json; charset=utf-8"
            body = json.dumps(payload).encode("utf-8")
        if token:
            headers["Authorization"] = "Bearer " + token
        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            response = self.opener.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        except (OSError, urllib.error.URLError, ValueError):
            raise IndexingError("network_error") from None
        with response:
            data = response.read(limit + 1)
            if len(data) > limit:
                raise IndexingError("response_too_large")
            return Response(response.status, {key.lower(): value for key, value in response.headers.items()}, data)


def production_url(value, allow_resource=False):
    if not isinstance(value, str) or any(ord(char) < 33 for char in value):
        raise IndexingError("invalid_production_url")
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or parsed.netloc != "letsaimit.com" or parsed.query or parsed.fragment:
        raise IndexingError("invalid_production_url")
    path = urllib.parse.unquote(parsed.path)
    if not path.startswith("/") or "\\" in path or any(part in (".", "..") for part in path.split("/")):
        raise IndexingError("invalid_production_url")
    if not allow_resource and any(path.rstrip("/").lower() == prefix or path.lower().startswith(prefix + "/") for prefix in PRIVATE_PATHS):
        raise IndexingError("private_url_excluded")
    return value


def load_inputs(config_path, manifest_path):
    try:
        config = json.loads(Path(config_path).read_text(encoding="utf-8"))
        manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        raise IndexingError("configuration_unavailable") from None
    if config.get("schemaVersion") != 1 or config.get("productionOrigin") != PRODUCTION_ORIGIN:
        raise IndexingError("production_configuration_mismatch")
    if manifest.get("schemaVersion") != 1 or manifest.get("origin") != PRODUCTION_ORIGIN or manifest.get("productionOrigin") != PRODUCTION_ORIGIN:
        raise IndexingError("production_manifest_required")
    if manifest.get("sitemapUrl") != PRODUCTION_ORIGIN + "/sitemap.xml":
        raise IndexingError("sitemap_origin_mismatch")
    if config.get("searchConsoleProperty") not in ("sc-domain:letsaimit.com", PRODUCTION_ORIGIN + "/"):
        raise IndexingError("search_console_property_mismatch")
    indexnow = config.get("indexNow", {})
    key = os.environ.get("INDEXNOW_KEY") or indexnow.get("key", "")
    if not re.fullmatch(r"[a-fA-F0-9]{32}", key):
        raise IndexingError("indexnow_key_invalid")
    location = indexnow.get("keyLocation", "")
    if not isinstance(location, str) or not location.startswith("/") or location.startswith("//"):
        raise IndexingError("indexnow_key_location_invalid")
    production_url(PRODUCTION_ORIGIN + location, allow_resource=True)
    pages = manifest.get("pages")
    if not isinstance(pages, list) or not pages:
        raise IndexingError("public_manifest_empty")
    seen = set()
    for page in pages:
        if not isinstance(page, dict) or page.get("indexable") is not True:
            raise IndexingError("manifest_page_not_indexable")
        url = production_url(page.get("url"))
        if url in seen or not re.fullmatch(r"[a-f0-9]{64}", page.get("contentHash", "")):
            raise IndexingError("manifest_page_invalid")
        seen.add(url)
        try:
            modified = dt.datetime.fromisoformat(page["lastmod"].replace("Z", "+00:00"))
            if modified.tzinfo is None:
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            raise IndexingError("manifest_lastmod_invalid") from None
    return config, manifest, key


class PageHead(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_head = False
        self.canonicals = []
        self.robots = []
        self.schema = []
        self.json_parts = None

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "head":
            self.in_head = True
        if self.in_head and tag == "link" and "canonical" in attrs.get("rel", "").lower().split():
            self.canonicals.append(attrs.get("href"))
        if tag == "meta" and attrs.get("name", "").lower() in ("robots", *[bot.lower() for bot in BOTS]):
            self.robots.append(attrs.get("content", ""))
        if tag == "script" and attrs.get("type", "").lower() == "application/ld+json":
            self.json_parts = []

    def handle_endtag(self, tag):
        if tag == "head":
            self.in_head = False
        if tag == "script" and self.json_parts is not None:
            try:
                self.schema.append(json.loads("".join(self.json_parts)))
            except json.JSONDecodeError:
                pass
            self.json_parts = None

    def handle_data(self, data):
        if self.json_parts is not None:
            self.json_parts.append(data)


def schema_nodes(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from schema_nodes(child)
    elif isinstance(value, list):
        for child in value:
            yield from schema_nodes(child)


def google_eligibility(schema):
    def valid_date(value):
        if not isinstance(value, str):
            return False
        try:
            dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
            return True
        except ValueError:
            return False

    for node in schema_nodes(schema):
        types = node.get("@type", [])
        types = [types] if isinstance(types, str) else types if isinstance(types, list) else []
        if "JobPosting" in types and all(node.get(field) for field in ("title", "description", "hiringOrganization")) and valid_date(node.get("datePosted")):
            if node.get("jobLocation") or node.get("jobLocationType") == "TELECOMMUTE":
                return "job_posting"
        if "VideoObject" in types and all(node.get(field) for field in ("name", "thumbnailUrl")) and valid_date(node.get("uploadDate")):
            publications = node.get("publication", [])
            publications = [publications] if isinstance(publications, dict) else publications
            for event in publications if isinstance(publications, list) else []:
                if isinstance(event, dict) and event.get("@type") == "BroadcastEvent" and event.get("isLiveBroadcast") is True and valid_date(event.get("startDate")) and (not event.get("endDate") or valid_date(event["endDate"])):
                    return "live_broadcast"
    return None


def provider_retry_after(response):
    value = response.headers.get("retry-after", "")
    if value.isdigit() and int(value) <= 31536000:
        return int(value)
    if value:
        try:
            until = email.utils.parsedate_to_datetime(value)
            return max(0, int((until - dt.datetime.now(dt.timezone.utc)).total_seconds()))
        except (TypeError, ValueError, OverflowError):
            pass
    return 60 if response.status == 429 else None


def fetch_sitemap(client, url, expected_urls, visited=None):
    visited = set() if visited is None else visited
    production_url(url, allow_resource=True)
    if url in visited or len(visited) >= 100:
        raise IndexingError("sitemap_recursion_invalid")
    visited.add(url)
    response = client.request(url, limit=MAX_SITEMAP_BYTES)
    if response.status != 200:
        raise IndexingError("sitemap_http_status")
    body = response.body
    if url.endswith(".gz") or body.startswith(b"\x1f\x8b"):
        try:
            body = gzip.GzipFile(fileobj=io.BytesIO(body)).read(MAX_SITEMAP_BYTES + 1)
        except (OSError, EOFError):
            raise IndexingError("sitemap_gzip_invalid") from None
    if len(body) > MAX_SITEMAP_BYTES:
        raise IndexingError("sitemap_too_large")
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        raise IndexingError("sitemap_xml_invalid") from None
    found = set()
    fingerprint = hashlib.sha256(body)
    if root.tag == SITEMAP_NS + "sitemapindex":
        children = root.findall(SITEMAP_NS + "sitemap")
        if not children:
            raise IndexingError("sitemap_empty")
        for child in children:
            location = child.findtext(SITEMAP_NS + "loc")
            if not location:
                raise IndexingError("sitemap_url_invalid")
            urls, child_hash = fetch_sitemap(client, location.strip(), expected_urls, visited)
            if found.intersection(urls):
                raise IndexingError("sitemap_duplicate_url")
            found.update(urls)
            fingerprint.update(child_hash.encode("ascii"))
    elif root.tag == SITEMAP_NS + "urlset":
        entries = root.findall(SITEMAP_NS + "url")
        if len(entries) > 50000:
            raise IndexingError("sitemap_url_limit")
        for entry in entries:
            location = entry.findtext(SITEMAP_NS + "loc")
            url = production_url(location.strip() if location else None)
            if url in found or url not in expected_urls:
                raise IndexingError("sitemap_coverage_mismatch")
            try:
                modified = dt.datetime.fromisoformat(entry.findtext(SITEMAP_NS + "lastmod", "").replace("Z", "+00:00"))
                if modified.tzinfo is None:
                    raise ValueError()
            except ValueError:
                raise IndexingError("sitemap_lastmod_invalid") from None
            found.add(url)
    else:
        raise IndexingError("sitemap_namespace_invalid")
    return found, fingerprint.hexdigest()


class StateStore:
    def __init__(self, path):
        self.path = Path(path)
        self.lock = None
        self.data = {"schemaVersion": 1, "origin": PRODUCTION_ORIGIN, "providers": {}}
        self.refresh()

    def refresh(self):
        if self.path.exists():
            try:
                self.data = json.loads(self.path.read_text(encoding="utf-8"))
            except (OSError, UnicodeError, json.JSONDecodeError):
                raise IndexingError("submission_state_invalid") from None
            if self.data.get("schemaVersion") != 1 or self.data.get("origin") != PRODUCTION_ORIGIN or not isinstance(self.data.get("providers"), dict):
                raise IndexingError("submission_state_invalid")
            for provider in self.data["providers"].values():
                if not isinstance(provider, dict) or any(not isinstance(receipt, dict) for receipt in provider.values()):
                    raise IndexingError("submission_state_invalid")

    def acquire(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = self.path.with_suffix(self.path.suffix + ".lock").open("a", encoding="utf-8")
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock.close()
            self.lock = None
            raise IndexingError("submission_already_running") from None
        self.refresh()

    def close(self):
        if self.lock:
            self.lock.close()

    def acknowledged(self, provider, url, content_hash):
        saved = self.data["providers"].get(provider, {}).get(url, {})
        return saved.get("status") in (200, 204) and saved.get("contentHash") == content_hash

    def wait_seconds(self, provider, url):
        retry_at = self.data["providers"].get(provider, {}).get(url, {}).get("retryAt")
        if not retry_at:
            return 0
        try:
            remaining = dt.datetime.fromisoformat(retry_at) - dt.datetime.now(dt.timezone.utc)
            return max(0, int(remaining.total_seconds()) + 1)
        except (ValueError, TypeError):
            raise IndexingError("submission_state_invalid") from None

    def receipt(self, provider, url, content_hash, status, code=None, retry_after=None):
        entries = self.data["providers"].setdefault(provider, {})
        entries[url] = {"contentHash": content_hash, "status": status, "notifiedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}
        if code:
            entries[url]["failureCode"] = code
        if retry_after is not None:
            entries[url]["retryAt"] = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=retry_after)).isoformat(timespec="seconds")
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.path.parent, delete=False) as file:
                temporary = file.name
                json.dump(self.data, file, indent=2, sort_keys=True)
                file.write("\n")
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, self.path)
        except OSError:
            if temporary:
                Path(temporary).unlink(missing_ok=True)
            raise IndexingError("submission_state_write_failed") from None


class Indexer:
    def __init__(self, config, manifest, key, state, client=None, token=None):
        self.config = config
        self.manifest = manifest
        self.key = key
        self.state = state
        self.client = client or HttpClient()
        self.token = token
        self.report = {"mode": "dry_run", "origin": PRODUCTION_ORIGIN, "urlCount": len(manifest["pages"]), "liveVerified": False,
                       "issues": [], "providers": {}, "meaning": "Provider receipts acknowledge notifications. Search engines determine indexing."}

    def issue(self, stage, code, url=None, status=None, retry_after=None):
        value = {"stage": stage, "code": code}
        if url:
            value["url"] = url
        if status is not None:
            value["httpStatus"] = status
        if retry_after is not None:
            value["retryAfterSeconds"] = retry_after
        self.report["issues"].append(value)

    def verify_page(self, page, robots):
        url = page["url"]
        try:
            if any(not robots.can_fetch(bot, url) for bot in BOTS):
                raise IndexingError("robots_disallowed")
            response = self.client.request(url)
            if response.status != 200:
                return url, None, {"code": "page_http_status", "httpStatus": response.status}
            if response.headers.get("content-type", "").split(";", 1)[0].strip().lower() not in ("text/html", "application/xhtml+xml"):
                raise IndexingError("page_content_type_invalid")
            head = PageHead()
            head.feed(response.body.decode("utf-8", errors="strict"))
            if head.canonicals != [url]:
                raise IndexingError("canonical_mismatch")
            directives = head.robots + [response.headers.get("x-robots-tag", "")]
            if any(re.search(r"\b(?:noindex|none)\b", value, re.I) for value in directives):
                raise IndexingError("page_noindex")
            return url, google_eligibility(head.schema), None
        except (IndexingError, UnicodeError) as error:
            return url, None, {"code": str(error) if isinstance(error, IndexingError) else "page_encoding_invalid"}

    def verify(self):
        urls = {page["url"] for page in self.manifest["pages"]}
        try:
            response = self.client.request(PRODUCTION_ORIGIN + "/discovery-manifest.json", limit=MAX_SITEMAP_BYTES)
            if response.status != 200:
                raise IndexingError("deployed_manifest_unavailable")
            deployed = json.loads(response.body)
            expected = {(page["url"], page["contentHash"], page["lastmod"], True) for page in self.manifest["pages"]}
            actual = {(page["url"], page["contentHash"], page["lastmod"], page["indexable"]) for page in deployed.get("pages", [])}
            if deployed.get("origin") != PRODUCTION_ORIGIN or deployed.get("productionOrigin") != PRODUCTION_ORIGIN or actual != expected or len(deployed["pages"]) != len(expected):
                raise IndexingError("deployed_manifest_mismatch")
        except (IndexingError, ValueError, KeyError, TypeError, AttributeError) as error:
            self.issue("deployment", str(error) if isinstance(error, IndexingError) else "deployed_manifest_invalid")
        robots = urllib.robotparser.RobotFileParser()
        robots.allow_all = True
        try:
            response = self.client.request(PRODUCTION_ORIGIN + "/robots.txt", limit=256 * 1024)
            if response.status != 200 or b"<html" in response.body.lower():
                raise IndexingError("robots_unavailable")
            robots.allow_all = False
            robots.parse(response.body.decode("utf-8", errors="strict").splitlines())
        except (IndexingError, UnicodeError) as error:
            self.issue("robots", str(error) if isinstance(error, IndexingError) else "robots_encoding_invalid")
        sitemap_hash = None
        try:
            listed, sitemap_hash = fetch_sitemap(self.client, self.manifest["sitemapUrl"], urls)
            if listed != urls:
                raise IndexingError("sitemap_coverage_mismatch")
        except IndexingError as error:
            self.issue("sitemap", str(error))
        try:
            response = self.client.request(PRODUCTION_ORIGIN + self.config["indexNow"]["keyLocation"], limit=1024)
            if response.status != 200 or response.body.decode("utf-8", errors="strict").strip() != self.key:
                raise IndexingError("indexnow_key_verification_failed")
        except (IndexingError, UnicodeError) as error:
            self.issue("key_verification", str(error) if isinstance(error, IndexingError) else "key_encoding_invalid")
        eligibility = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            for url, kind, failure in pool.map(lambda page: self.verify_page(page, robots), self.manifest["pages"]):
                if failure:
                    self.issue("page", failure["code"], url, failure.get("httpStatus"))
                elif kind:
                    eligibility[url] = kind
        self.report["liveVerified"] = not self.report["issues"]
        return sitemap_hash, eligibility

    def notify(self, provider, url, content_hash, endpoint, payload=None, method="POST", token=None):
        try:
            remaining = self.state.wait_seconds(provider, url)
            if remaining:
                self.issue(provider, "retry_wait", url, retry_after=remaining)
                return False
            response = self.client.request(endpoint, method=method, payload=payload, token=token)
            accepted = (200, 204) if provider == "googleSitemap" else (200,)
            if response.status not in accepted:
                retry_after = provider_retry_after(response)
                self.state.receipt(provider, url, content_hash, response.status, "notification_failed", retry_after)
                self.issue(provider, "notification_failed", url, response.status, retry_after)
                return False
            self.state.receipt(provider, url, content_hash, response.status)
            return True
        except IndexingError as error:
            self.issue(provider, str(error), url)
            return False

    def run(self, submit=False, inspect=False):
        self.report["mode"] = "submit" if submit else "dry_run"
        sitemap_hash, eligibility = self.verify()
        indexnow_pages = [page for page in self.manifest["pages"] if not self.state.acknowledged("indexNow", page["url"], page["contentHash"])]
        google_pages = [page for page in self.manifest["pages"] if page["url"] in eligibility and not self.state.acknowledged("googleIndexing", page["url"], page["contentHash"])]
        self.report["providers"] = {
            "indexNow": {"changed": len(indexnow_pages), "unchanged": len(self.manifest["pages"]) - len(indexnow_pages), "accepted": 0, "pending": 0},
            "googleIndexing": {"eligible": len(eligibility), "ineligible": len(self.manifest["pages"]) - len(eligibility), "changed": len(google_pages), "accepted": 0,
                               "eligibility": "JobPosting or live BroadcastEvent embedded in VideoObject"},
            "googleSitemap": {"submitted": False, "unchanged": bool(sitemap_hash and self.state.acknowledged("googleSitemap", self.manifest["sitemapUrl"], sitemap_hash))},
        }
        google_needed = not self.report["providers"]["googleSitemap"]["unchanged"] or bool(google_pages) or inspect
        if google_needed and not self.token:
            self.issue("google", "google_access_token_missing")
        if not self.report["liveVerified"]:
            return self.report
        if not submit:
            if inspect and self.token:
                self.inspect_pages()
            return self.report
        ready_pages = []
        for page in indexnow_pages:
            remaining = self.state.wait_seconds("indexNow", page["url"])
            if remaining:
                self.report["providers"]["indexNow"]["pending"] += 1
                self.issue("indexNow", "retry_wait", page["url"], retry_after=remaining)
            else:
                ready_pages.append(page)
        indexnow_pages = ready_pages
        for offset in range(0, len(indexnow_pages), 10000):
            batch = indexnow_pages[offset:offset + 10000]
            payload = {"host": "letsaimit.com", "key": self.key, "keyLocation": PRODUCTION_ORIGIN + self.config["indexNow"]["keyLocation"], "urlList": [page["url"] for page in batch]}
            try:
                response = self.client.request(INDEXNOW_ENDPOINT, method="POST", payload=payload)
                if response.status not in (200, 202):
                    retry_after = provider_retry_after(response)
                    for page in batch:
                        self.state.receipt("indexNow", page["url"], page["contentHash"], response.status, "notification_failed", retry_after)
                    self.issue("indexNow", "notification_failed", status=response.status, retry_after=retry_after)
                    continue
                for page in batch:
                    self.state.receipt("indexNow", page["url"], page["contentHash"], response.status)
                bucket = "accepted" if response.status == 200 else "pending"
                self.report["providers"]["indexNow"][bucket] += len(batch)
                if response.status == 202:
                    self.issue("indexNow", "key_validation_pending", status=202)
            except IndexingError as error:
                self.issue("indexNow", str(error))
        if not self.token:
            return self.report
        if not self.report["providers"]["googleSitemap"]["unchanged"]:
            endpoint = SEARCH_CONSOLE_ENDPOINT + urllib.parse.quote(self.config["searchConsoleProperty"], safe="") + "/sitemaps/" + urllib.parse.quote(self.manifest["sitemapUrl"], safe="")
            self.report["providers"]["googleSitemap"]["submitted"] = self.notify("googleSitemap", self.manifest["sitemapUrl"], sitemap_hash, endpoint, method="PUT", token=self.token)
        for page in google_pages:
            accepted = self.notify("googleIndexing", page["url"], page["contentHash"], GOOGLE_INDEXING_ENDPOINT,
                                   {"url": page["url"], "type": "URL_UPDATED"}, token=self.token)
            self.report["providers"]["googleIndexing"]["accepted"] += int(accepted)
        if inspect:
            self.inspect_pages()
        return self.report

    def inspect_pages(self):
        inspected = []
        for page in self.manifest["pages"]:
            try:
                response = self.client.request(INSPECTION_ENDPOINT, method="POST", payload={"inspectionUrl": page["url"], "siteUrl": self.config["searchConsoleProperty"]}, token=self.token)
                if response.status != 200:
                    self.issue("googleInspection", "inspection_failed", page["url"], response.status)
                    continue
                result = json.loads(response.body).get("inspectionResult", {}).get("indexStatusResult", {})
                if not isinstance(result, dict):
                    raise ValueError()
                inspected.append({"url": page["url"], "verdict": str(result.get("verdict", ""))[:40], "coverageState": str(result.get("coverageState", ""))[:200]})
            except (IndexingError, ValueError, AttributeError):
                self.issue("googleInspection", "inspection_failed", page["url"])
        self.report["providers"]["googleInspection"] = {"results": inspected}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Verify live GETs and report the plan without notifying providers (default).")
    mode.add_argument("--submit", action="store_true", help="Notify providers after production verification passes.")
    parser.add_argument("--manifest", default="dist/discovery-manifest.json")
    parser.add_argument("--config", default="deployment/indexing.json")
    parser.add_argument("--state", default=".cache/indexing-state.json")
    parser.add_argument("--inspect", action="store_true", help="Read indexed-version diagnostics from Search Console after live verification.")
    args = parser.parse_args()
    state = None
    try:
        config, manifest, key = load_inputs(args.config, args.manifest)
        state = StateStore(args.state)
        if args.submit:
            state.acquire()
        report = Indexer(config, manifest, key, state, token=os.environ.get("GOOGLE_ACCESS_TOKEN")).run(args.submit, args.inspect)
        print(json.dumps(report, indent=2))
        return 2 if report["issues"] else 0
    except (IndexingError, OSError) as error:
        code = str(error) if isinstance(error, IndexingError) else "local_state_unavailable"
        print(json.dumps({"mode": "submit" if args.submit else "dry_run", "liveVerified": False, "issues": [{"stage": "setup", "code": code}]}))
        return 2
    finally:
        if state:
            state.close()


if __name__ == "__main__":
    raise SystemExit(main())
