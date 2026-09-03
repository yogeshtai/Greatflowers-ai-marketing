import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3005";

export interface CampaignInput {
  campaignGoal: string;
  product: string;
  occasion?: string;
  audience: string;
  trafficSource: string;
  platforms: string[];
  priority: string;
  additionalContext?: string;
}

export async function generateStrategy(
  campaign: CampaignInput
) {
  const response = await axios.post(
    `${API_URL}/api/strategies/generate`,
    campaign
  );

  return response.data;
}

export async function saveCampaign(
  input: CampaignInput,
  strategy: unknown,
  selectedProduct?: unknown,
  creatives?: unknown,
  selectedCreative?: unknown
) {
  const response = await axios.post(
    `${API_URL}/api/campaigns`,
    {
      input,
      strategy,
      selectedProduct,
      creatives,
      selectedCreative,
    }
  );

  return response.data;
}

export async function updateCampaign(
  id: string,
  input: CampaignInput,
  strategy: unknown,
  selectedProduct?: unknown,
  creatives?: unknown,
  selectedCreative?: unknown
) {
  const response = await axios.put(
    `${API_URL}/api/campaigns/${id}`,
    {
      input,
      strategy,
      selectedProduct,
      creatives,
      selectedCreative,
    }
  );

  return response.data;
}

export async function getCampaigns() {
  const response = await axios.get(
    `${API_URL}/api/campaigns`
  );

  return response.data;
}

export async function updateCampaignStatus(
  id: string,
  status: "draft" | "approved" | "rejected"
) {
  const response = await axios.patch(
    `${API_URL}/api/campaigns/${id}/status`,
    {
      status,
    }
  );

  return response.data;
}

export async function recommendCampaign() {
  const response = await axios.post(
    `${API_URL}/api/recommendations/generate`
  );

  return response.data;
}

export async function generateCreatives(
  productImageUrl: string,
  creativeBrief: unknown
) {
  const response = await axios.post(
    `${API_URL}/api/creatives/generate`,
    {
      productImageUrl,
      creativeBrief,
    }
  );

  return response.data;
}

export async function regenerateCreativeVariant(
  productImageUrl: string,
  creativeBrief: unknown,
  variantType: string
) {
  const response = await axios.post(
    `${API_URL}/api/creatives/generate/variant`,
    {
      productImageUrl,
      creativeBrief,
      variantType,
    }
  );

  return response.data;
}