import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  } catch {
    await writeFile(
      DATA_FILE,
      JSON.stringify([], null, 2)
    );
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

async function writeCampaigns(
  campaigns: SavedCampaign[]
) {
  await writeFile(
    DATA_FILE,
    JSON.stringify(campaigns, null, 2)
  );
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
  }
) {
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

    status: "draft",

    createdAt: now,
    updatedAt: now,
  };

  campaigns.unshift(campaign);

  await writeCampaigns(campaigns);

  return campaign;
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
}

export async function updateCampaign(
  id: string,
  updates: Partial<SavedCampaign>
) {
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

  const updatedCampaign: SavedCampaign = {
    ...currentCampaign,
    ...updates,
    updatedAt:
      new Date().toISOString(),
  };

  campaigns[index] =
    updatedCampaign;

  await writeCampaigns(campaigns);

  return updatedCampaign;
}
