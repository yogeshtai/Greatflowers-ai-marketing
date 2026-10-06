import { z } from "zod";

export const campaignSchema = z.object({
  campaignGoal: z.string().min(1),
  product: z.string().min(1),

  occasion: z.string().optional(),
  creativeScenario: z.string().optional(),
  contentTheme: z.string().optional(),
  visualTreatment: z.string().optional(),

  audience: z.string().min(1),

  trafficSource: z.string().default("Organic Social"),

  platforms: z
    .array(z.string())
    .min(1),

  priority: z.string().default("Conversions"),

  additionalContext: z.string().optional(),
});
