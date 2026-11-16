import sharp from "sharp";
import crypto from "crypto";
import type { ProjectConfig } from "./projects/index.js";
import { uploadProjectImage } from "./projects/storage.js";

// Prepared images go to the project's own bucket under its campaign prefix, using the public
// URL structure Meta downloads from.

export async function prepareInstagramImage(
  project: ProjectConfig,
  imageUrl: string
): Promise<string> {
  // Download original product image
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to download product image: ${response.status}`
    );
  }

  const inputBuffer = Buffer.from(
    await response.arrayBuffer()
  );

  // Convert WebP/etc. → JPEG
  const jpegBuffer = await sharp(inputBuffer)
    .jpeg({
      quality: 90,
    })
    .toBuffer();

  const filename = `${crypto.randomUUID()}.jpg`;

  return uploadProjectImage(project, "campaign", filename, jpegBuffer, "image/jpeg");
}

export async function prepareFacebookImage(
  project: ProjectConfig,
  imageUrl: string
): Promise<string> {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to download product image: ${response.status}`
    );
  }

  const inputBuffer = Buffer.from(
    await response.arrayBuffer()
  );

  // Facebook link preview images display best at 1.91:1 (1200x630).
  // Pad square creatives so the whole image is visible.
  const targetWidth = 1200;
  const targetHeight = 630;

  const resizedBuffer = await sharp(inputBuffer)
    .resize(targetWidth, targetHeight, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  const filename = `${crypto.randomUUID()}.jpg`;

  return uploadProjectImage(project, "campaign", filename, resizedBuffer, "image/jpeg");
}

export async function prepareFacebookCarouselImage(
  project: ProjectConfig,
  imageUrl: string
): Promise<string> {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to download carousel image: ${response.status}`
    );
  }

  const inputBuffer = Buffer.from(
    await response.arrayBuffer()
  );

  // For Facebook multi-image posts, preserve the square 1:1 composition
  // that the AI creative was generated with. Do not resize to 1200x630.
  // Just convert to JPEG for Meta compatibility.
  const jpegBuffer = await sharp(inputBuffer)
    .jpeg({
      quality: 90,
    })
    .toBuffer();

  const filename = `${crypto.randomUUID()}.jpg`;

  return uploadProjectImage(project, "campaign", filename, jpegBuffer, "image/jpeg");
}