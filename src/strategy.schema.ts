import { z } from "zod";

export const marketingStrategySchema = z.object({
  campaignObjective: z.string(),

  targetCustomer: z.string(),

  customerIntent: z.array(z.string()),

  customerProblemOrDesire: z.string(),

  emotionalTriggers: z.array(z.string()),

  marketingAngle: z.string(),

  valueProposition: z.string(),

  cta: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
    destinationUrl: z.string().url().optional(),
  }),

  whyThisCouldWork: z.string(),

  platformContent: z.object({
    instagram: z
      .object({
        visualConcept: z.string(),
        caption: z.string(),
        hashtags: z.array(z.string()),
      })
      .optional(),

    facebook: z
      .object({
        post: z.string(),
        cta: z.string().optional(),
      })
      .optional(),

    pinterest: z
      .object({
        titles: z.array(z.string()),
        description: z.string(),
        keywords: z.array(z.string()),
        destinationUrl: z.string().url().optional(),
      })
      .optional(),

    x: z
      .object({
        post: z.string(),
      })
      .optional(),

    youtubeShorts: z
      .object({
        hook: z.string(),
        scenes: z.array(z.string()),
        voiceoverOrText: z.string(),
        cta: z.string(),
        length: z.string().optional(),
      })
      .optional(),
  }),

  abTests: z.array(
    z.object({
      name: z.string(),
      angle: z.string(),
      focus: z.string(),
      measure: z.array(z.string()),
    })
  ),

  assumptions: z.array(z.string()),

  needsVerification: z.array(z.string()),
});

export type MarketingStrategy = z.infer<
  typeof marketingStrategySchema
>;
