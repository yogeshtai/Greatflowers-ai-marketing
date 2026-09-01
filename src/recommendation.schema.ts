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

    catalogEvidence: z
      .array(z.string().min(1))
      .min(1),

    assumptions: z
      .array(z.string().min(1))
      .min(1),

    additionalContext: z.string(),

    decisionSummary: z.string().min(10),

    websiteEvidence: z
      .array(z.string().min(1))
      .min(1),

    analyticsEvidence: z
      .array(z.string().min(1))
      .min(1),

    rotationEvidence: z
      .array(z.string().min(1))
      .min(1),
  });

export type CampaignRecommendation =
  z.infer<typeof campaignRecommendationSchema>;