import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { unlink } from "node:fs/promises";
import path from "node:path";
import type { SavedCampaign } from "./campaign.store.js";

export function campaignAssetUrls(campaign: SavedCampaign): string[] {
  return [...new Set([
    ...(campaign.creatives ?? []).map(c => c.localPath),
    ...(campaign.selectedCreatives ?? []).map(c => c.imageUrl),
    campaign.selectedCreative?.imageUrl,
    ...(campaign.storyCreatives ?? []).map(c => c.imageUrl),
    ...(campaign.assetUrls ?? []),
  ].filter((url): url is string => Boolean(url)))];
}

export function ownedCampaignAsset(value: string): { key: string } | { localPath: string } | null {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION;
  const prefix = (process.env.AWS_S3_CREATIVE_PREFIX || "campaign").replace(/\/$/, "");
  const prefixes = [prefix, (process.env.AWS_S3_CAMPAIGN_PREFIX || "campaign").replace(/\/$/, "")];
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.host !== `${bucket}.s3.${region}.amazonaws.com`) return null;
    const key = decodeURIComponent(url.pathname.slice(1));
    if (!prefixes.some(p => key.startsWith(`${p}/`)) || !/^[\w/-]+\.(png|jpe?g|webp)$/i.test(key) || key.includes("..")) return null;
    return { key };
  } catch {
    const root = path.resolve("test-creatives");
    const localPath = value.startsWith("/test-creatives/") ? path.resolve(`.${value}`) : path.resolve(value);
    if (path.dirname(localPath) !== root || !/\.(png|jpe?g|webp)$/i.test(localPath)) return null;
    return { localPath };
  }
}

export async function deleteCampaignAssets(campaign: SavedCampaign, others: SavedCampaign[]) {
  const identity = (value: string) => JSON.stringify(ownedCampaignAsset(value));
  const protectedAssets = new Set([
    ...others.flatMap(campaignAssetUrls),
    ...[campaign, ...others].map(c => c.selectedProduct?.image).filter((v): v is string => Boolean(v)),
  ].map(identity));
  const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1",
    ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? { credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    } } : {}) });
  try {
    for (const url of campaignAssetUrls(campaign)) {
      const asset = ownedCampaignAsset(url);
      if (!asset || protectedAssets.has(identity(url))) continue;
      if ("key" in asset) {
        await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET!, Key: asset.key }));
      } else {
        await unlink(asset.localPath).catch(error => { if (error.code !== "ENOENT") throw error; });
      }
    }
  } finally { s3.destroy(); }
}
