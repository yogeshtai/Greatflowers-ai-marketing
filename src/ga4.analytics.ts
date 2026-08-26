import { BetaAnalyticsDataClient } from "@google-analytics/data";

const propertyId = process.env.GA4_PROPERTY_ID;

if (!propertyId) {
  throw new Error("GA4_PROPERTY_ID is missing");
}

const analyticsClient =
  new BetaAnalyticsDataClient();

export async function getProductAnalytics(
  startDate = "today"
) {
  const [response] =
    await analyticsClient.runReport({
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
    });

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