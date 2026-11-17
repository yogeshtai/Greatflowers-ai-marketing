import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { unlink } from "node:fs/promises";
import path from "node:path";
import type { SavedCampaign } from "./campaign.store.js";
import type { ProjectConfig } from "./projects/index.js";
import { createProjectS3Client, s3Settings } from "./projects/storage.js";

export function campaignAssetUrls(campaign: SavedCampaign): string[] {
  return [...new Set([
    ...(campaign.creatives ?? []).map(c => c.localPath),
    ...(campaign.selectedCreatives ?? []).map(c => c.imageUrl),
    campaign.selectedCreative?.imageUrl,
    ...(campaign.storyCreatives ?? []).map(c => c.imageUrl),
    ...(campaign.assetUrls ?? []),
  ].filter((url): url is string => Boolean(url)))];
}

// Only images this project's marketing pipeline created are owned: its bucket AND one of its
// marketing prefixes. A storefront product photo in the same bucket is never owned.
export function ownedCampaignAsset(project: ProjectConfig, value: string): { key: string } | { localPath: string } | null {
  const settings = s3Settings(project);
  const bucket = settings.bucket;
  const region = settings.region;
  const prefix = settings.creativePrefix.replace(/\/$/, "");
  const prefixes = [prefix, settings.campaignPrefix.replace(/\/$/, "")];
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

export async function deleteCampaignAssets(project: ProjectConfig, campaign: SavedCampaign, others: SavedCampaign[]) {
  const identity = (value: string) => JSON.stringify(ownedCampaignAsset(project, value));
  const protectedAssets = new Set([
    ...others.flatMap(campaignAssetUrls),
    ...[campaign, ...others].map(c => c.selectedProduct?.image).filter((v): v is string => Boolean(v)),
  ].map(identity));
  const settings = s3Settings(project);
  const s3 = createProjectS3Client(settings, "us-east-1");
  try {
    for (const url of campaignAssetUrls(campaign)) {
      const asset = ownedCampaignAsset(project, url);
      if (!asset || protectedAssets.has(identity(url))) continue;
      if ("key" in asset) {
        await s3.send(new DeleteObjectCommand({ Bucket: settings.bucket!, Key: asset.key }));
      } else {
        await unlink(asset.localPath).catch(error => { if (error.code !== "ENOENT") throw error; });
      }
    }
  } finally { s3.destroy(); }
}
