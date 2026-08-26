import { z } from "zod";

export const campaignRecommendationSchema =
  z.object({
    selectedProductId: z.number(),

    selectedProductName: z.string(),

    occasion: z.string(),

    audience: z.string(),

    campaignGoal: z.string(),

    trafficSource: z.string(),

    platforms: z.array(z.string()).min(1),

    priority: z.string(),

    reasonForSelection: z.string(),

    customerIntent: z.string(),

    marketingAngle: z.string(),

    catalogEvidence: z.array(z.string()),

    assumptions: z.array(z.string()),

    additionalContext: z.string(),
  });

export type CampaignRecommendation =
  z.infer<typeof campaignRecommendationSchema>;