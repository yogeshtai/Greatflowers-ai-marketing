import { campaignAssetUrls, deleteCampaignAssets } from "./campaign.assets.js";
import type { StoryCreativePlan } from "./strategy.schema.js";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { withFileLock } from "./json.file.js";
import { projectDataPath, type ProjectConfig } from "./projects/index.js";

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

  // Successful platforms for the current scheduled occurrence. This prevents
  // a partial retry from reposting to a platform that already succeeded.
  publishCyclePlatforms?: string[];

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
    variantOrder?: number;
    type: string;
    localPath: string;
    headline: string;
    subheadline: string;
    cta: string;
    artDirection?: string;
    copyLayout?: string;
    environment?: string;
    lightingSetup?: string;
    success: boolean;
    error?: string;
  }>;
  selectedCreative?: {
    variantOrder?: number;
    type: string;
    imageUrl: string;
    headline: string;
    subheadline: string;
    cta: string;
    isFallback: boolean;
  };
  selectedCreatives?: Array<{
    variantOrder?: number;
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

// Each project has its own campaigns.json; GreatFlowers still uses data/campaigns.json.
const dataFile = (project: ProjectConfig) => projectDataPath(project, "campaigns.json");

async function ensureDatabase(project: ProjectConfig) {
  const file = dataFile(project);
  await mkdir(path.dirname(file), {
    recursive: true,
  });

  try {
    await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(
      file,
      JSON.stringify([], null, 2), { flag: "wx" }
    ).catch(error => { if (error.code !== "EEXIST") throw error; });
  }
}

async function readCampaigns(project: ProjectConfig): Promise<SavedCampaign[]> {
  await ensureDatabase(project);

  const content = await readFile(
    dataFile(project),
    "utf8"
  );

  return JSON.parse(content);
}

// Serialize read-modify-write operations, including deletion and scheduler claims (per project file).
function withCampaignLock<T>(project: ProjectConfig, operation: () => Promise<T>): Promise<T> {
  return withFileLock(dataFile(project), operation);
}

async function writeCampaigns(project: ProjectConfig, campaigns: SavedCampaign[]) {
  const file = dataFile(project);
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(campaigns, null, 2));
  await rename(temporary, file);
}

export async function saveCampaign(
  project: ProjectConfig,
  input: CampaignInput,
  strategy: MarketingStrategy,
  selectedProduct?: {
    id: number;
    name: string;
    url: string;
    image: string | null;
  },
  creatives?: Array<{
    variantOrder?: number;
    type: string;
    localPath: string;
    headline: string;
    subheadline: string;
    cta: string;
    success: boolean;
    error?: string;
  }>,
  selectedCreative?: {
    variantOrder?: number;
    type: string;
    imageUrl: string;
    headline: string;
    subheadline: string;
    cta: string;
    isFallback: boolean;
  },
  selectedCreatives?: Array<{
    variantOrder?: number;
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
  return withCampaignLock(project, async () => {
    const campaigns = await readCampaigns(project);

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

    await writeCampaigns(project, campaigns);

    return campaign;
  });
}

export async function getCampaigns(project: ProjectConfig) {
  return readCampaigns(project);
}

export async function getCampaignById(
  project: ProjectConfig,
  id: string
) {
  const campaigns = await readCampaigns(project);

  return (
    campaigns.find(
      (campaign) => campaign.id === id
    ) || null
  );
}

export async function updateCampaignStatus(
  project: ProjectConfig,
  id: string,
  status: CampaignStatus
) {
  return withCampaignLock(project, async () => {
    const campaigns = await readCampaigns(project);

    const campaign = campaigns.find(
      (item) => item.id === id
    );

    if (!campaign) {
      return null;
    }

    campaign.status = status;
    campaign.updatedAt = new Date().toISOString();

    await writeCampaigns(project, campaigns);

    return campaign;
  });
}

export async function updateCampaign(
  project: ProjectConfig,
  id: string,
  updates: Partial<SavedCampaign>
) {
  return withCampaignLock(project, async () => {
    const campaigns =
      await readCampaigns(project);

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

    await writeCampaigns(project, campaigns);

    return updatedCampaign;
  });
}

export async function deleteCampaign(project: ProjectConfig, id: string) {
  return withCampaignLock(project, async () => {
    const campaigns = await readCampaigns(project);
    const campaign = campaigns.find(c => c.id === id);
    if (!campaign) return false;
    if (campaign.publishStatus === "publishing") throw new Error("Campaign is publishing. Try deleting it after publishing finishes.");
    // Persist cancellation before cleanup. If S3 fails, retain the record for retry.
    campaign.publishStatus = "cancelled";
    delete campaign.scheduledAt;
    campaign.scheduleRecurrence = "none";
    await writeCampaigns(project, campaigns);
    await deleteCampaignAssets(project, campaign, campaigns.filter(c => c.id !== id));
    await writeCampaigns(project, campaigns.filter(c => c.id !== id));
    return true;
  });
}

export async function withCampaignPublishing<T>(
  project: ProjectConfig,
  id: string,
  publish: (campaign: SavedCampaign) => Promise<T>,
  platform: "facebook" | "instagram",
) {
  return withCampaignLock(project, async () => {
    const campaigns = await readCampaigns(project);
    const campaign = campaigns.find(c => c.id === id);
    if (!campaign) throw new Error("Campaign not found");
    const result = await publish(campaign);
    // Record each successful platform immediately, including manual and partial publishes.
    // Scheduling state stays intact; the scheduler owns recurrence and retry transitions.
    campaign.publishedAt = new Date().toISOString();
    campaign.updatedAt = campaign.publishedAt;
    campaign.publishedPlatforms = [...new Set([...(campaign.publishedPlatforms ?? []), platform])];
    campaign.publishCyclePlatforms = [...new Set([...(campaign.publishCyclePlatforms ?? []), platform])];
    await writeCampaigns(project, campaigns);
    return result;
  });
}
