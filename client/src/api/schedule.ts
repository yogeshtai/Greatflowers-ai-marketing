import { API_BASE } from "../constants";

export async function scheduleCampaignPost(campaignId: string, payload: any) {
  const response = await fetch(
    `${API_BASE}/api/campaigns/${campaignId}/schedule`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Scheduling failed");
  }

  return data;
}

export async function rescheduleCampaignPost(campaignId: string, payload: any) {
  const response = await fetch(
    `${API_BASE}/api/campaigns/${campaignId}/schedule`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Rescheduling failed");
  }

  return data;
}

export async function cancelCampaignSchedule(campaignId: string) {
  const response = await fetch(
    `${API_BASE}/api/campaigns/${campaignId}/schedule/cancel`,
    {
      method: "POST",
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Cancel failed");
  }

  return data;
}
