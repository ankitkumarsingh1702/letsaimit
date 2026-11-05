import { asset } from "./assets.js";
import media from "../data/media-manifest.json";

/** Pick a single derivative for posters and other non-srcset consumers. */
export function imageSource(filename, targetWidth = 960) {
  const image = media.images[filename];
  if (!image) return asset(filename);
  const variant = image.variants.find((item) => item.width >= targetWidth)
    || image.variants.at(-1);
  return asset(variant.src);
}

/** Responsive image props; keep alt text and eager/lazy intent at the call site. */
export function mediaProps(filename, sizes = "100vw") {
  const image = media.images[filename];
  if (!image) return { src: asset(filename), decoding: "async" };
  return {
    src: imageSource(filename),
    srcSet: image.variants.map((item) => `${asset(item.src)} ${item.width}w`).join(", "),
    sizes,
    width: image.width,
    height: image.height,
    decoding: "async",
  };
}

export function thumbnailSource(filename) {
  const thumbnail = media.images[filename]?.thumbnail;
  return thumbnail ? asset(thumbnail.src) : imageSource(filename, 160);
}

export function videoSource(filename) {
  return asset(media.videos[filename]?.src || filename);
}
