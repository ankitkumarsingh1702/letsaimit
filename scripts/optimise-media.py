#!/usr/bin/env python3
"""Build responsive, metadata-free media from the bundled source originals.

Requires Pillow with WebP support and ffmpeg. The checked-in outputs are ready
to use; this script is only needed when source photographs or the film change.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "assets"
OUTPUT = ASSETS / "optimised"
MANIFEST = ROOT / "src" / "data" / "media-manifest.json"
PHOTO_WIDTHS = (320, 640, 960, 1440)
KEEP_AS_IS = {
    "football-footer-scene.png",  # Superseded artwork, retained as a source asset.
    "safe-soccer-cert.webp",
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_webp(image: Image.Image, target: Path, width: int, *, logo=False, thumb=False):
    height = max(1, round(image.height * width / image.width))
    resized = image.resize((width, height), Image.Resampling.LANCZOS)
    options = {"format": "WEBP", "method": 6, "quality": 68 if thumb else 76}
    if logo:
        options.update(lossless=True, quality=100, exact=True)
    elif image.mode == "RGBA":
        options.update(quality=84, alpha_quality=100, exact=True)
    resized.save(target, **options)
    return {
        "src": str(target.relative_to(ASSETS)),
        "width": width,
        "height": height,
        "bytes": target.stat().st_size,
        "sha256": digest(target),
    }


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    images = {}
    for source in sorted(ASSETS.iterdir()):
        if source.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        if (
            source.name in KEEP_AS_IS
            or source.name.startswith("cert-")
            or source.name.startswith("multisport-footer-")
        ):
            continue
        source_hash = digest(source)
        slug = re.sub(r"[^a-z0-9]+", "-", source.stem.lower()).strip("-")
        prefix = f"{slug}-{source_hash[:8]}"
        with Image.open(source) as raw:
            image = ImageOps.exif_transpose(raw)
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            is_logo = source.name == "logo.png"
            requested = (160, 320, 554) if is_logo else PHOTO_WIDTHS
            maximum = min(image.width, max(requested))
            widths = sorted({min(width, maximum) for width in requested})
            variants = [
                save_webp(image, OUTPUT / f"{prefix}-{width}.webp", width, logo=is_logo)
                for width in widths
            ]
            thumbnail = save_webp(
                image, OUTPUT / f"{prefix}-thumb.webp", min(160, image.width),
                logo=is_logo, thumb=True,
            )
            images[source.name] = {
                "source_sha256": source_hash,
                "original_bytes": source.stat().st_size,
                "width": image.width,
                "height": image.height,
                "variants": variants,
                "thumbnail": thumbnail,
            }
        print(f"{source.name}: {len(variants)} responsive sizes + thumbnail", flush=True)

    original_video = ASSETS / "football-film.mp4"
    source_hash = digest(original_video)
    video = OUTPUT / f"football-film-{source_hash[:8]}-720p.mp4"
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(original_video), "-an", "-map_metadata", "-1",
            "-c:v", "libx264", "-preset", "slow", "-crf", "30",
            "-vf", "scale=1280:-2", "-pix_fmt", "yuv420p",
            "-maxrate", "1100k", "-bufsize", "2200k", "-movflags", "+faststart",
            str(video),
        ],
        check=True,
    )
    if video.stat().st_size >= 2_000_000:
        raise RuntimeError("The optimised film exceeds the 2 MB media budget.")
    manifest = {
        "schema_version": 1,
        "description": "Responsive derivatives; bundled source originals are unchanged.",
        "images": images,
        "videos": {
            original_video.name: {
                "src": str(video.relative_to(ASSETS)),
                "source_sha256": source_hash,
                "original_bytes": original_video.stat().st_size,
                "bytes": video.stat().st_size,
                "sha256": digest(video),
                "width": 1280,
                "height": 720,
            }
        },
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Film: {video.stat().st_size:,} bytes; {len(images)} images optimised.")


if __name__ == "__main__":
    main()
