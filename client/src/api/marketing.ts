import axios from "axios";

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
    "http://localhost:3000/api/strategies/generate",
    campaign
  );

  return response.data;
}

export async function saveCampaign(
  input: CampaignInput,
  strategy: unknown,
  selectedProduct?: unknown
) {
  const response = await axios.post(
    "http://localhost:3000/api/campaigns",
    {
      input,
      strategy,
      selectedProduct,
    }
  );

  return response.data;
}

export async function getCampaigns() {
  const response = await axios.get(
    "http://localhost:3000/api/campaigns"
  );

  return response.data;
}

export async function updateCampaignStatus(
  id: string,
  status: "draft" | "approved" | "rejected"
) {
  const response = await axios.patch(
    `http://localhost:3000/api/campaigns/${id}/status`,
    {
      status,
    }
  );

  return response.data;
}

export async function recommendCampaign() {
  const response = await axios.post(
    "http://localhost:3000/api/recommendations/generate"
  );

  return response.data;
}