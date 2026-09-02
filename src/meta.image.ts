import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import crypto from "crypto";

const REGION = process.env.AWS_REGION!;
const BUCKET = process.env.AWS_S3_BUCKET!;
const PREFIX = process.env.AWS_S3_CAMPAIGN_PREFIX || "campaign";

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function prepareInstagramImage(
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

  const key = `${PREFIX}/${filename}`;

  // Upload to S3
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: jpegBuffer,
      ContentType: "image/jpeg",
    })
  );

  // Existing GreatFlowers bucket already uses this public URL structure
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

export async function prepareFacebookImage(
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
  const key = `${PREFIX}/${filename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: resizedBuffer,
      ContentType: "image/jpeg",
    })
  );

  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}