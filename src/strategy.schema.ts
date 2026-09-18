import { z } from "zod";

const creativeVariantSchema = z.object({
  creativeType: z.enum([
    "product",
    "lifestyle",
    "occasion",
    "location",
    "feature",
    "informational",
    "brand-awareness",
  ]),
  sceneStrategy: z.enum([
    "PRODUCT_STUDIO",
    "HUMAN_GIFTING_MOMENT",
    "HUMAN_LIFESTYLE",
    "OCCASION_SCENE",
    "EDITORIAL_CONTENT",
    "INFORMATIONAL_GRAPHIC",
    "LOCATION_STORY",
    "FEATURE_DEMO",
    "BRAND_STORY",
  ]),
  concept: z.string().min(1),
  headline: z.string().min(1),
  subheadline: z.string(),
  cta: z.string().min(1),
  visualDirection: z.string().min(1),
  productRole: z.enum(["hero", "supporting", "optional", "none"]),
  locationContext: z.string().optional(),
  occasionContext: z.string().optional(),
  colorPalette: z.string().min(1),
  compositionStyle: z.string().min(1),
  lightingStyle: z.string().min(1),
  sceneType: z.string().min(1),
});

const creativeBriefSchema = z.object({
  headline: z.string().min(1),
  subheadline: z.string(),
  cta: z.string().min(1),
  mood: z.string().min(1),
  backgroundDirection: z.string().min(1),
  productTreatment: z.string().min(1),
  logoPlacement: z.string().min(1),
  textPlacement: z.string().min(1),
  creativeGoal: z.string().min(1),
  variants: z.array(creativeVariantSchema).length(3).refine(
    (variants) => {
      const types = variants.map((v) => v.creativeType);
      return new Set(types).size >= 2;
    },
    {
      message: "Must have at least 2 different creative types among the 3 variants",
    }
  ),
});

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

  creativeBrief: creativeBriefSchema.optional(),
});

export type MarketingStrategy = z.infer<
  typeof marketingStrategySchema
>;
