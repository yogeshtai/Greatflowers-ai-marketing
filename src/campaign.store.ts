import { campaignAssetUrls, deleteCampaignAssets } from "./campaign.assets.js";
import type { StoryCreativePlan } from "./strategy.schema.js";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { CampaignInput } from "./hermes.js";
import type { MarketingStrategy } from "./strategy.schema.js";

export type CampaignStatus =
  | "draft"
  | "approved"
  | "rejected";

export interface SavedCampaign {
  id: string;
  assetUrls?: string[];

  input: CampaignInput;

  strategy: MarketingStrategy;

  status: CampaignStatus;

  scheduledAt?: string;

  scheduledTimezone?: string;

  scheduledPlatforms?: Array<
    "facebook" | "instagram"
  >;

  scheduleRecurrence?: "none" | "daily" | "weekly";

  publishStatus?:
  | "not_scheduled"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled";

  publishedAt?: string;

  publishError?: string;

  publishedPlatforms?: string[];

  publishAttempts?: number;

  maxPublishAttempts?: number;

  createdAt: string;
  updatedAt: string;
  selectedProduct?: {
    id: number;
    name: string;
    url: string;
    image: string | null;
  };
  creatives?: Array<{
    type: string;
    localPath: string;
    headline: string;
    subheadline: string;
    cta: string;
    success: boolean;
    error?: string;
  }>;
  selectedCreative?: {
    type: string;
    imageUrl: string;
    headline: string;
    subheadline: string;
    cta: string;
    isFallback: boolean;
  };
  selectedCreatives?: Array<{
    type: string;
    imageUrl: string;
    headline: string;
    subheadline: string;
    cta: string;
    isFallback: boolean;
    order: number;
  }>;

  // Story Creatives (Stage 3): separate workflow from normal creatives.
  storyPlan?: StoryCreativePlan | null;
  storyConcept?: string;

  storyVisualContinuity?: {
    characterContinuity?: string;
    environmentContinuity?: string;
    colorContinuity?: string;
    stylingContinuity?: string;
  };

  storyCreatives?: Array<{
    order: number;
    storyRole: string;
    storyBeat: string;
    imageUrl: string;
    headline: string;
    subheadline: string;
    cta: string;
    creativeType: string;
    sceneStrategy: string;
    productRole: string;
    success: boolean;
    error?: string;
  }>;

  // When true, the 4 storyCreatives (in order) are the selected publishing
  // unit instead of selectedCreatives/selectedCreative.
  selectedStoryCarousel?: boolean;
}

const DATA_DIR = path.join(process.cwd(), "data");

const DATA_FILE = path.join(
  DATA_DIR,
  "campaigns.json"
);

async function ensureDatabase() {
  await mkdir(DATA_DIR, {
    recursive: true,
  });

  try {
    await readFile(DATA_FILE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(
      DATA_FILE,
      JSON.stringify([], null, 2), { flag: "wx" }
    ).catch(error => { if (error.code !== "EEXIST") throw error; });
  }
}

async function readCampaigns(): Promise<SavedCampaign[]> {
  await ensureDatabase();

  const content = await readFile(
    DATA_FILE,
    "utf8"
  );

  return JSON.parse(content);
}

// Serialize read-modify-write operations, including deletion and scheduler claims.
let pendingWrite: Promise<unknown> = Promise.resolve();
function withCampaignLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingWrite.then(operation);
  pendingWrite = result.catch(() => undefined);
  return result;
}

async function writeCampaigns(campaigns: SavedCampaign[]) {
  const temporary = `${DATA_FILE}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(campaigns, null, 2));
  await rename(temporary, DATA_FILE);
}

export async function saveCampaign(
  input: CampaignInput,
  strategy: MarketingStrategy,
  selectedProduct?: {
    id: number;
    name: string;
    url: string;
    image: string | null;
  },
  creatives?: Array<{
    type: string;
    localPath: string;
    headline: string;
    subheadline: string;
    cta: string;
    success: boolean;
    error?: string;
  }>,
  selectedCreative?: {
    type: string;
    imageUrl: string;
    headline: string;
    subheadline: string;
    cta: string;
    isFallback: boolean;
  },
  selectedCreatives?: Array<{
    type: string;
    imageUrl: string;
    headline: string;
    subheadline: string;
    cta: string;
    isFallback: boolean;
    order: number;
  }>,
  storyData?: {
    storyPlan?: StoryCreativePlan | null;
    storyConcept?: string;
    storyVisualContinuity?: {
      characterContinuity?: string;
      environmentContinuity?: string;
      colorContinuity?: string;
      stylingContinuity?: string;
    };
    storyCreatives?: Array<{
      order: number;
      storyRole: string;
      storyBeat: string;
      imageUrl: string;
      headline: string;
      subheadline: string;
      cta: string;
      creativeType: string;
      sceneStrategy: string;
      productRole: string;
      success: boolean;
      error?: string;
    }>;
    selectedStoryCarousel?: boolean;
  }
) {
  return withCampaignLock(async () => {
    const campaigns = await readCampaigns();

    const now = new Date().toISOString();

    const campaign: SavedCampaign = {
      id: randomUUID(),

      input,
      strategy,

      ...(selectedProduct
        ? { selectedProduct }
        : {}),

      ...(creatives && creatives.length > 0
        ? { creatives }
        : {}),

      ...(selectedCreative
        ? { selectedCreative }
        : {}),

      ...(selectedCreatives && selectedCreatives.length > 0
        ? { selectedCreatives }
        : {}),

      ...(storyData?.storyPlan ? { storyPlan: storyData.storyPlan } : {}),
      ...(storyData?.storyConcept
        ? { storyConcept: storyData.storyConcept }
        : {}),

      ...(storyData?.storyVisualContinuity
        ? { storyVisualContinuity: storyData.storyVisualContinuity }
        : {}),

      ...(storyData?.storyCreatives && storyData.storyCreatives.length > 0
        ? { storyCreatives: storyData.storyCreatives }
        : {}),

      ...(storyData?.selectedStoryCarousel !== undefined
        ? { selectedStoryCarousel: storyData.selectedStoryCarousel }
        : {}),

      status: "draft",

      createdAt: now,
      updatedAt: now,
    };

    campaigns.unshift(campaign);

    await writeCampaigns(campaigns);

    return campaign;
  });
}

export async function getCampaigns() {
  return readCampaigns();
}

export async function getCampaignById(
  id: string
) {
  const campaigns = await readCampaigns();

  return (
    campaigns.find(
      (campaign) => campaign.id === id
    ) || null
  );
}

export async function updateCampaignStatus(
  id: string,
  status: CampaignStatus
) {
  return withCampaignLock(async () => {
    const campaigns = await readCampaigns();

    const campaign = campaigns.find(
      (item) => item.id === id
    );

    if (!campaign) {
      return null;
    }

    campaign.status = status;
    campaign.updatedAt = new Date().toISOString();

    await writeCampaigns(campaigns);

    return campaign;
  });
}

export async function updateCampaign(
  id: string,
  updates: Partial<SavedCampaign>
) {
  return withCampaignLock(async () => {
    const campaigns =
      await readCampaigns();

    const index =
      campaigns.findIndex(
        (campaign) =>
          campaign.id === id
      );

    if (index === -1) {
      return null;
    }

    const currentCampaign =
      campaigns[index];

    if (!currentCampaign) {
      return null;
    }

    if (updates.publishStatus === "publishing" && currentCampaign.publishStatus !== "scheduled") return null;

    const updatedCampaign: SavedCampaign = {
      ...currentCampaign,
      ...updates,
      updatedAt:
        new Date().toISOString(),
    };

    updatedCampaign.assetUrls = [...new Set([...campaignAssetUrls(currentCampaign), ...campaignAssetUrls(updatedCampaign)])];

    campaigns[index] =
      updatedCampaign;

    await writeCampaigns(campaigns);

    return updatedCampaign;
  });
}

export async function deleteCampaign(id: string) {
  return withCampaignLock(async () => {
    const campaigns = await readCampaigns();
    const campaign = campaigns.find(c => c.id === id);
    if (!campaign) return false;
    if (campaign.publishStatus === "publishing") throw new Error("Campaign is publishing. Try deleting it after publishing finishes.");
    // Persist cancellation before cleanup. If S3 fails, retain the record for retry.
    campaign.publishStatus = "cancelled";
    delete campaign.scheduledAt;
    campaign.scheduleRecurrence = "none";
    await writeCampaigns(campaigns);
    await deleteCampaignAssets(campaign, campaigns.filter(c => c.id !== id));
    await writeCampaigns(campaigns.filter(c => c.id !== id));
    return true;
  });
}

export async function withCampaignPublishing<T>(id: string, publish: (campaign: SavedCampaign) => Promise<T>) {
  return withCampaignLock(async () => {
    const campaign = (await readCampaigns()).find(c => c.id === id);
    if (!campaign) throw new Error("Campaign not found");
    return publish(campaign);
  });
}
