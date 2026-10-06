import { z } from "zod";
import { CONTENT_THEMES, VISUAL_TREATMENTS } from "./campaign.rotation.js";

export const campaignRecommendationSchema =
  z.object({
    contentTheme: z.enum(CONTENT_THEMES),
    visualTreatment: z.enum(VISUAL_TREATMENTS),
    selectedProductId: z.number(),

    selectedProductName: z.string(),

    occasion: z.string(),

    creativeScenario: z.string().min(1).describe("A specific human situation, useful care topic, styling idea or conversation matching the assigned content theme."),

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