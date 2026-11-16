import { BetaAnalyticsDataClient } from "@google-analytics/data";
import type { ProjectConfig } from "./projects/index.js";

// GreatFlowers uses Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS). Another project
// may point at its own service-account file; otherwise it shares the same service account, which then
// needs Viewer access on that project's GA4 property.
const clients = new Map<string, BetaAnalyticsDataClient>();
function analyticsClientFor(project: ProjectConfig) {
  let client = clients.get(project.id);
  if (!client) {
    const keyFilename = project.isDefault ? undefined : project.env("GOOGLE_APPLICATION_CREDENTIALS");
    client = keyFilename ? new BetaAnalyticsDataClient({ keyFilename }) : new BetaAnalyticsDataClient();
    clients.set(project.id, client);
  }
  return client;
}

export async function getProductAnalytics(
  project: ProjectConfig,
  startDate = "today",
  timeoutMs = 30_000,
) {
  const propertyId = project.env("GA4_PROPERTY_ID");
  if (!propertyId) {
    throw new Error(`${project.envName("GA4_PROPERTY_ID")} is missing`);
  }

  const [response] =
    await analyticsClientFor(project).runReport({
      property: `properties/${propertyId}`,

      dateRanges: [
        {
          startDate,
          endDate: "today",
        },
      ],

      dimensions: [
        {
          name: "itemId",
        },
        {
          name: "itemName",
        },
      ],

      metrics: [
        {
          name: "itemsViewed",
        },
        {
          name: "itemsAddedToCart",
        },
        {
          name: "itemsCheckedOut",
        },
        {
          name: "itemsPurchased",
        },
      ],
    }, { timeout: timeoutMs });

  return (
    response.rows?.map((row) => ({
      itemId:
        row.dimensionValues?.[0]?.value || "",

      itemName:
        row.dimensionValues?.[1]?.value || "",

      views: Number(
        row.metricValues?.[0]?.value || 0
      ),

      addToCarts: Number(
        row.metricValues?.[1]?.value || 0
      ),

      checkouts: Number(
        row.metricValues?.[2]?.value || 0
      ),

      purchases: Number(
        row.metricValues?.[3]?.value || 0
      ),
    })) || []
  );
}
