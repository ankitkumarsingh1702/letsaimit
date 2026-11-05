#!/usr/bin/env python3
"""Export small brand assets from the approved logo and self-hosted typeface.

This script composes code-native artwork. It does not create, replace or
retouch photographs. Pillow is only needed when deliberately regenerating
these checked-in PNG/SVG assets; the normal website build has no Python step.
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "assets"
FONT = ASSETS / "fonts" / "plus-jakarta-sans-variable.woff2"
FOREST = "#143e35"
LIME = "#c5f66b"
SAGE = "#e5ecd9"
ORANGE = "#f88916"


def font(size: int, weight: int = 500) -> ImageFont.FreeTypeFont:
    face = ImageFont.truetype(str(FONT), size)
    face.set_variation_by_axes([weight])
    return face


def outline_paths(mask: Image.Image) -> list[list[tuple[int, int]]]:
    """Trace the existing mark into a self-contained vector favicon."""
    width, height = mask.size
    data = mask.load()
    edges: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    for y in range(height):
        for x in range(width):
            if not data[x, y]:
                continue
            if y == 0 or not data[x, y - 1]:
                edges[(x, y)].append((x + 1, y))
            if x == width - 1 or not data[x + 1, y]:
                edges[(x + 1, y)].append((x + 1, y + 1))
            if y == height - 1 or not data[x, y + 1]:
                edges[(x + 1, y + 1)].append((x, y + 1))
            if x == 0 or not data[x - 1, y]:
                edges[(x, y + 1)].append((x, y))
    paths = []
    while edges:
        start = next(iter(edges))
        point = start
        points = [point]
        for _ in range(width * height * 4):
            choices = edges.get(point)
            if not choices:
                break
            next_point = choices.pop()
            if not choices:
                del edges[point]
            point = next_point
            points.append(point)
            if point == start:
                break
        if len(points) < 4:
            continue
        # Remove redundant points on straight pixel edges without changing shape.
        compact = []
        for i, point in enumerate(points[:-1]):
            before = points[i - 1] if i else points[-2]
            after = points[(i + 1) % (len(points) - 1)]
            if (point[0] - before[0]) * (after[1] - point[1]) != (point[1] - before[1]) * (after[0] - point[0]):
                compact.append(point)
        if len(compact) > 2:
            paths.append(simplify_path(compact + [compact[0]], 0.55)[:-1])
    return paths


def simplify_path(points: list[tuple[int, int]], tolerance: float) -> list[tuple[int, int]]:
    """Remove subpixel stair steps while preserving the approved outline."""
    if len(points) <= 2:
        return points
    start, end = points[0], points[-1]
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dy)
    distances = [
        abs(dy * (point[0] - start[0]) - dx * (point[1] - start[1])) / length
        if length else math.hypot(point[0] - start[0], point[1] - start[1])
        for point in points[1:-1]
    ]
    furthest = max(range(len(distances)), key=distances.__getitem__)
    if distances[furthest] <= tolerance:
        return [start, end]
    split = furthest + 1
    return simplify_path(points[:split + 1], tolerance)[:-1] + simplify_path(points[split:], tolerance)


def make_favicons(logo: Image.Image) -> None:
    # The running figure is the existing brand mark above the wordmark.
    top = logo.crop((0, 0, logo.width, round(logo.height * 0.73)))
    mask = Image.new("1", top.size)
    mask.putdata([
        bool(a > 110 and r > 180 and g > 70 and r > g * 1.12 and b < 150)
        for r, g, b, a in top.get_flattened_data()
    ])
    box = mask.getbbox()
    if not box:
        raise RuntimeError("The approved running mark was not found in logo.png")
    mark = top.crop(box)
    mask = mask.crop(box)
    for size in (32, 180):
        output = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        if size == 32:
            output = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            ImageDraw.Draw(output).rounded_rectangle((0, 0, size - 1, size - 1), radius=6, fill="white")
        fit = mark.copy()
        fit.thumbnail((round(size * 0.84), round(size * 0.84)), Image.Resampling.LANCZOS)
        output.alpha_composite(fit, ((size - fit.width) // 2, (size - fit.height) // 2))
        output.save(ASSETS / f"favicon-{size}.png", optimize=True)
    paths = outline_paths(mask)
    scale = 420 / max(mask.size)
    offset_x = (512 - mask.width * scale) / 2
    offset_y = (512 - mask.height * scale) / 2
    path_data = " ".join(
        "M" + " L".join(f"{x},{y}" for x, y in path) + " Z"
        for path in paths
    )
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n'
        '  <title>LetsAimIt</title>\n'
        '  <rect width="512" height="512" rx="100" fill="#fff"/>\n'
        f'  <path fill="{ORANGE}" fill-rule="evenodd" transform="translate({offset_x:.3f} {offset_y:.3f}) scale({scale:.6f})" d="{path_data}"/>\n'
        '</svg>\n'
    )
    (ASSETS / "favicon.svg").write_text(svg, encoding="utf-8")


def football(draw: ImageDraw.ImageDraw, center: tuple[int, int], radius: int) -> None:
    cx, cy = center
    width = 5
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=LIME, width=width)
    points = [
        (cx + math.cos(math.radians(-90 + index * 72)) * radius * 0.43,
         cy + math.sin(math.radians(-90 + index * 72)) * radius * 0.43)
        for index in range(5)
    ]
    draw.line(points + [points[0]], fill=LIME, width=width, joint="curve")
    for index, point in enumerate(points):
        angle = math.radians(-90 + index * 72)
        edge = (cx + math.cos(angle) * radius, cy + math.sin(angle) * radius)
        draw.line([point, edge], fill=LIME, width=width)


def basketball(draw: ImageDraw.ImageDraw, center: tuple[int, int], radius: int) -> None:
    cx, cy = center
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=LIME, outline=FOREST, width=5)
    draw.line((cx - radius + 5, cy, cx + radius - 5, cy), fill=FOREST, width=4)
    draw.line((cx, cy - radius + 5, cx, cy + radius - 5), fill=FOREST, width=4)
    draw.arc((cx - radius * 1.65, cy - radius, cx + radius * 0.22, cy + radius), -77, 77, fill=FOREST, width=4)
    draw.arc((cx - radius * 0.22, cy - radius, cx + radius * 1.65, cy + radius), 103, 257, fill=FOREST, width=4)


def make_share_image(logo: Image.Image) -> None:
    image = Image.new("RGB", (1200, 630), FOREST)
    draw = ImageDraw.Draw(image)
    # Quiet linework reflects the existing multisport design language.
    draw.rounded_rectangle((850, 76, 1136, 498), radius=48, outline="#31594c", width=2)
    draw.line((850, 287, 1136, 287), fill="#31594c", width=2)
    draw.ellipse((932, 228, 1054, 350), outline="#31594c", width=2)
    draw.rounded_rectangle((64, 44, 244, 174), radius=23, fill="#fbfcf7")
    stamp = logo.copy()
    stamp.thumbnail((148, 108), Image.Resampling.LANCZOS)
    image.paste(stamp, (64 + (180 - stamp.width) // 2, 44 + (130 - stamp.height) // 2), stamp)
    draw.text((1136, 52), "BENGALURU", anchor="ra", fill=SAGE, font=font(18, 600))
    draw.text((60, 208), "Sport, close", fill="white", font=font(78, 700))
    draw.text((60, 298), "to home.", fill="white", font=font(78, 700))
    draw.text((64, 424), "Football · Basketball · Fitness", fill=SAGE, font=font(27, 500))
    football(draw, (961, 248), 89)
    basketball(draw, (1026, 406), 72)
    draw.rounded_rectangle((64, 520, 346, 580), radius=30, fill=LIME)
    draw.text((91, 533), "First session free", fill=FOREST, font=font(22, 650))
    draw.line((308, 549, 325, 549), fill=FOREST, width=2)
    draw.line((319, 543, 325, 549, 319, 555), fill=FOREST, width=2)
    draw.text((1136, 541), "Nambiar Ellegenza · Nambiar Bellezea", anchor="ra", fill=SAGE, font=font(18, 500))
    image.save(ASSETS / "share-letsaimit-1200x630.png", optimize=True)


def main() -> None:
    logo = Image.open(ASSETS / "logo.png").convert("RGBA")
    make_favicons(logo)
    make_share_image(logo)
    for name in ["favicon.svg", "favicon-32.png", "favicon-180.png", "share-letsaimit-1200x630.png"]:
        path = ASSETS / name
        print(f"{name}: {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
