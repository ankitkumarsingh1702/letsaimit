"""Provider notifications use mocked HTTP. No credentials or network required."""

import copy
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "force-index.py"
SPEC = importlib.util.spec_from_file_location("force_index", SCRIPT)
indexing = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = indexing
SPEC.loader.exec_module(indexing)
ORIGIN = indexing.PRODUCTION_ORIGIN
KEY = "a" * 32
DATE = "2026-11-19T00:00:00+00:00"


def response(body="", status=200, headers=None):
    return indexing.Response(status, {"content-type": "text/html; charset=utf-8", **(headers or {})}, body.encode() if isinstance(body, str) else body)


class FakeHttp:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def request(self, url, method="GET", payload=None, token=None, limit=None):
        self.calls.append({"url": url, "method": method, "payload": payload, "token": token})
        return self.responses.get((method, url), response(status=404))

    def notifications(self):
        return [call for call in self.calls if call["method"] != "GET" and call["url"] != indexing.INSPECTION_ENDPOINT]


class IndexingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.config = {"schemaVersion": 1, "productionOrigin": ORIGIN,
                       "searchConsoleProperty": "sc-domain:letsaimit.com",
                       "indexNow": {"key": KEY, "keyLocation": "/" + KEY + ".txt"}}
        self.manifest = {"schemaVersion": 1, "origin": ORIGIN, "productionOrigin": ORIGIN,
                         "sitemapUrl": ORIGIN + "/sitemap.xml", "pages": [
                             {"url": ORIGIN + path, "contentHash": hashlib.sha256(path.encode()).hexdigest(),
                              "lastmod": DATE, "indexable": True} for path in ("/", "/blogs/")]}
        self.sitemap_endpoint = (indexing.SEARCH_CONSOLE_ENDPOINT + "sc-domain%3Aletsaimit.com/sitemaps/"
                                 + "https%3A%2F%2Fletsaimit.com%2Fsitemap.xml")
        self.responses = {
            ("GET", ORIGIN + "/discovery-manifest.json"): response(json.dumps(self.manifest)),
            ("GET", ORIGIN + "/robots.txt"): response("User-agent: *\nAllow: /\nDisallow: /admin/\n"),
            ("GET", ORIGIN + "/sitemap.xml"): response(self.sitemap()),
            ("GET", ORIGIN + "/" + KEY + ".txt"): response(KEY),
            ("POST", indexing.INDEXNOW_ENDPOINT): response("{}"),
            ("PUT", self.sitemap_endpoint): response(status=204),
            ("POST", indexing.GOOGLE_INDEXING_ENDPOINT): response("{}"),
            ("POST", indexing.INSPECTION_ENDPOINT): response(json.dumps({"inspectionResult": {"indexStatusResult": {
                "verdict": "PASS", "coverageState": "Submitted and indexed"}}})),
        }
        for page in self.manifest["pages"]:
            self.responses[("GET", page["url"])] = response(self.html(page["url"]))

    def sitemap(self, pages=None):
        entries = "".join("<url><loc>" + page["url"] + "</loc><lastmod>" + DATE + "</lastmod></url>"
                          for page in pages or self.manifest["pages"])
        return '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + entries + "</urlset>"

    def html(self, url, schema=None, robots="index,follow"):
        schema = schema or {"@context": "https://schema.org", "@graph": [
            {"@type": "Organization", "@id": ORIGIN + "/#organization", "name": "LetsAimIt"},
            {"@type": "WebPage", "@id": url + "#webpage", "url": url}]}
        return ('<html><head><link rel="canonical" href="' + url + '"><meta name="robots" content="'
                + robots + '"><script type="application/ld+json">' + json.dumps(schema)
                + "</script></head><body><main><h1>LetsAimIt</h1></main></body></html>")

    def run_indexer(self, submit=False, token="mock-token", inspect=False):
        client = FakeHttp(self.responses)
        state = indexing.StateStore(self.directory / "state.json")
        try:
            if submit:
                state.acquire()
            report = indexing.Indexer(self.config, self.manifest, KEY, state, client, token).run(submit, inspect)
            return report, client, state
        finally:
            state.close()

    def codes(self, report):
        return {issue["code"] for issue in report["issues"]}

    def test_dry_run_verifies_without_notifications_or_state_writes(self):
        report, client, state = self.run_indexer()
        self.assertTrue(report["liveVerified"])
        self.assertEqual(report["issues"], [])
        self.assertEqual(report["providers"]["googleIndexing"]["eligible"], 0)
        self.assertEqual(client.notifications(), [])
        self.assertFalse(state.path.exists())

    def test_submit_notifies_only_verified_production_urls_then_skips_unchanged(self):
        report, client, state = self.run_indexer(submit=True)
        self.assertEqual(report["issues"], [])
        calls = client.notifications()
        self.assertEqual([(call["method"], call["url"]) for call in calls], [
            ("POST", indexing.INDEXNOW_ENDPOINT), ("PUT", self.sitemap_endpoint)])
        self.assertEqual(calls[0]["payload"]["urlList"], [page["url"] for page in self.manifest["pages"]])
        self.assertEqual(calls[0]["payload"]["keyLocation"], ORIGIN + "/" + KEY + ".txt")
        self.assertIsNone(calls[0]["token"])
        self.assertTrue(state.acknowledged("googleSitemap", ORIGIN + "/sitemap.xml", state.data["providers"]["googleSitemap"][ORIGIN + "/sitemap.xml"]["contentHash"]))
        repeated, second, _ = self.run_indexer(submit=True, token=None)
        self.assertEqual(repeated["issues"], [])
        self.assertEqual(repeated["providers"]["indexNow"]["changed"], 0)
        self.assertEqual(second.notifications(), [])

    def test_failed_google_does_not_lose_indexnow_receipts(self):
        self.responses[("PUT", self.sitemap_endpoint)] = response(status=500)
        report, _, state = self.run_indexer(submit=True)
        self.assertIn("notification_failed", self.codes(report))
        self.assertEqual(state.data["providers"]["googleSitemap"][ORIGIN + "/sitemap.xml"]["status"], 500)
        self.responses[("PUT", self.sitemap_endpoint)] = response(status=204)
        repeated, client, _ = self.run_indexer(submit=True)
        self.assertEqual(repeated["issues"], [])
        self.assertEqual([call["url"] for call in client.notifications()], [self.sitemap_endpoint])

    def test_indexnow_202_remains_pending_and_retryable(self):
        self.responses[("POST", indexing.INDEXNOW_ENDPOINT)] = response(status=202)
        report, _, _ = self.run_indexer(submit=True)
        self.assertEqual(report["providers"]["indexNow"]["pending"], 2)
        self.assertIn("key_validation_pending", self.codes(report))
        self.responses[("POST", indexing.INDEXNOW_ENDPOINT)] = response()
        repeated, client, _ = self.run_indexer(submit=True)
        self.assertEqual(repeated["providers"]["indexNow"]["accepted"], 2)
        self.assertEqual([call["url"] for call in client.notifications()], [indexing.INDEXNOW_ENDPOINT])

    def test_rate_limit_retry_after_persists_without_sleep_or_repeat(self):
        self.responses[("POST", indexing.INDEXNOW_ENDPOINT)] = response(status=429, headers={"retry-after": "120"})
        report, _, state = self.run_indexer(submit=True)
        self.assertIn("notification_failed", self.codes(report))
        self.assertGreater(state.wait_seconds("indexNow", ORIGIN + "/"), 100)
        repeated, client, _ = self.run_indexer(submit=True)
        self.assertIn("retry_wait", self.codes(repeated))
        self.assertEqual(repeated["providers"]["indexNow"]["pending"], 2)
        self.assertEqual(client.notifications(), [])

    def test_missing_google_credentials_is_explicit_and_keeps_indexnow_progress(self):
        report, client, _ = self.run_indexer(submit=True, token=None)
        self.assertIn("google_access_token_missing", self.codes(report))
        self.assertEqual([call["url"] for call in client.notifications()], [indexing.INDEXNOW_ENDPOINT])
        self.assertEqual(report["providers"]["indexNow"]["accepted"], 2)
        self.assertFalse(report["providers"]["googleSitemap"]["submitted"])

    def test_page_http_canonical_noindex_and_robots_failures_block_every_notification(self):
        url = self.manifest["pages"][1]["url"]
        cases = [
            (response(status=301), "page_http_status"),
            (response(status=404), "page_http_status"),
            (response(self.html(ORIGIN + "/")), "canonical_mismatch"),
            (response(self.html(url, robots="noindex,follow")), "page_noindex"),
            (response(self.html(url), headers={"x-robots-tag": "googlebot: noindex"}), "page_noindex"),
            (response(self.html(url), headers={"content-type": "text/plain"}), "page_content_type_invalid"),
        ]
        for page_response, code in cases:
            with self.subTest(code=code, status=page_response.status):
                self.responses[("GET", url)] = page_response
                report, client, _ = self.run_indexer(submit=True)
                self.assertFalse(report["liveVerified"])
                self.assertIn(code, self.codes(report))
                self.assertEqual(client.notifications(), [])
        self.responses[("GET", url)] = response(self.html(url))
        self.responses[("GET", ORIGIN + "/robots.txt")] = response("User-agent: OAI-SearchBot\nDisallow: /blogs/\nUser-agent: *\nAllow: /\n")
        report, client, _ = self.run_indexer(submit=True)
        self.assertIn("robots_disallowed", self.codes(report))
        self.assertEqual(client.notifications(), [])

    def test_undeployed_build_cannot_submit_even_when_old_pages_return_200(self):
        deployed = copy.deepcopy(self.manifest)
        deployed["pages"][0]["contentHash"] = "f" * 64
        self.responses[("GET", ORIGIN + "/discovery-manifest.json")] = response(json.dumps(deployed))
        report, client, _ = self.run_indexer(submit=True)
        self.assertIn("deployed_manifest_mismatch", self.codes(report))
        self.assertEqual(client.notifications(), [])

    def test_eligible_google_api_includes_only_real_jobposting(self):
        job = {"@type": "JobPosting", "title": "Coach", "description": "Coach students", "datePosted": DATE,
               "hiringOrganization": {"@type": "Organization", "name": "LetsAimIt"},
               "jobLocation": {"@type": "Place", "address": "Bengaluru"}}
        job_url = self.manifest["pages"][1]["url"]
        self.responses[("GET", job_url)] = response(self.html(job_url, schema=job))
        report, client, _ = self.run_indexer(submit=True)
        self.assertEqual(report["providers"]["googleIndexing"]["eligible"], 1)
        notifications = [call for call in client.notifications() if call["url"] == indexing.GOOGLE_INDEXING_ENDPOINT]
        self.assertEqual([call["payload"] for call in notifications], [{"url": job_url, "type": "URL_UPDATED"}])
        self.assertIsNone(indexing.google_eligibility({"@type": "Article", "headline": "Training"}))
        self.assertIsNone(indexing.google_eligibility({"@type": "Product", "name": "Coaching"}))
        self.assertIsNone(indexing.google_eligibility({"@type": "BroadcastEvent", "isLiveBroadcast": True, "startDate": DATE}))
        broadcast = {"@type": "VideoObject", "name": "Live coaching", "thumbnailUrl": ORIGIN + "/live.jpg",
                     "uploadDate": DATE, "publication": {"@type": "BroadcastEvent", "isLiveBroadcast": True,
                                                           "startDate": DATE}}
        self.assertEqual(indexing.google_eligibility(broadcast), "live_broadcast")
        del broadcast["uploadDate"]
        self.assertIsNone(indexing.google_eligibility(broadcast))

    def test_optional_inspection_is_read_only_diagnostic(self):
        report, client, state = self.run_indexer(inspect=True)
        self.assertEqual(client.notifications(), [])
        self.assertEqual(len(report["providers"]["googleInspection"]["results"]), 2)
        self.assertEqual(report["providers"]["googleInspection"]["results"][0]["verdict"], "PASS")
        self.assertFalse(state.path.exists())

    def test_manifest_rejects_uat_private_urls_and_unaware_dates(self):
        path = self.directory / "config.json"
        path.write_text(json.dumps(self.config))
        for change, expected in [
            ({"origin": "https://uat.letsaimit.com"}, "production_manifest_required"),
            ({"page": {"indexable": False}}, "manifest_page_not_indexable"),
            ({"page": {"url": ORIGIN + "/admin/students"}}, "private_url_excluded"),
            ({"page": {"url": ORIGIN + "/blogs/?preview=1"}}, "invalid_production_url"),
            ({"page": {"lastmod": "2026-11-19"}}, "manifest_lastmod_invalid"),
        ]:
            with self.subTest(expected=expected):
                manifest = copy.deepcopy(self.manifest)
                if "page" in change:
                    manifest["pages"][0].update(change["page"])
                else:
                    manifest.update(change)
                manifest_path = self.directory / "manifest.json"
                manifest_path.write_text(json.dumps(manifest))
                with patch.dict(os.environ, {}, clear=True), self.assertRaisesRegex(indexing.IndexingError, expected):
                    indexing.load_inputs(path, manifest_path)

    def test_gzip_sitemap_index_has_complete_unique_coverage(self):
        child = ORIGIN + "/pages.xml.gz"
        self.responses[("GET", ORIGIN + "/sitemap.xml")] = response(
            '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>'
            + child + "</loc></sitemap></sitemapindex>")
        self.responses[("GET", child)] = response(gzip.compress(self.sitemap().encode()))
        report, _, _ = self.run_indexer()
        self.assertTrue(report["liveVerified"])
        self.responses[("GET", child)] = response(gzip.compress(self.sitemap(self.manifest["pages"][:1]).encode()))
        failed, _, _ = self.run_indexer(submit=True)
        self.assertIn("sitemap_coverage_mismatch", self.codes(failed))

    def test_submission_lock_and_atomic_reload_preserve_previous_receipts(self):
        first = indexing.StateStore(self.directory / "state.json")
        second = indexing.StateStore(first.path)
        first.acquire()
        try:
            first.receipt("indexNow", ORIGIN + "/", "a" * 64, 200)
            with self.assertRaisesRegex(indexing.IndexingError, "submission_already_running"):
                second.acquire()
        finally:
            first.close()
        second.acquire()
        try:
            self.assertTrue(second.acknowledged("indexNow", ORIGIN + "/", "a" * 64))
        finally:
            second.close()


if __name__ == "__main__":
    unittest.main()
