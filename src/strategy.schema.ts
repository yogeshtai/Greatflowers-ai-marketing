import { z } from "zod";

export const creativeVariantSchema = z.object({
  order: z.number().int().min(1).max(4),
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
  brandRole: z.enum(["none", "subtle", "reveal"]).optional(),
  sceneChange: z.string().min(1).optional(),
  cameraDirection: z.string().min(1).optional(),
  storyRole: z.string().optional(),
  storyBeat: z.string().optional(),
});

const HUMAN_SCENE_STRATEGIES = new Set(["HUMAN_GIFTING_MOMENT", "HUMAN_LIFESTYLE"]);

export const storyCreativePlanSchema = z.object({
  carouselConcept: z.string().min(1),
  revealSlide: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  visualContinuity: z.object({
    characterContinuity: z.string().optional(),
    environmentContinuity: z.string().optional(),
    colorContinuity: z.string().optional(),
    stylingContinuity: z.string().optional(),
  }).optional(),
  slides: z.array(creativeVariantSchema.extend({
    cta: z.string(),
    storyRole: z.string().min(1),
    storyBeat: z.string().min(1),
    brandRole: z.enum(["none", "subtle", "reveal"]),
    sceneChange: z.string().min(1),
    cameraDirection: z.string().min(1),
  })).length(4),
}).superRefine((plan, ctx) => {
  if (new Set(plan.slides.map(s => s.order)).size !== 4) {
    ctx.addIssue({ code: "custom", path: ["slides"], message: "Require unique slide orders 1–4" });
  }
  plan.slides.forEach((slide, i) => {
    if (slide.order < plan.revealSlide &&
        (slide.productRole !== "none" || slide.brandRole !== "none" || slide.cta.trim())) {
      ctx.addIssue({ code: "custom", path: ["slides", i], message: "Before reveal, productRole and brandRole must be none and CTA empty" });
    }
    if (slide.brandRole === "none" && slide.cta.trim()) {
      ctx.addIssue({ code: "custom", path: ["slides", i, "cta"], message: "Unbranded slides cannot carry a CTA" });
    }
    if (slide.sceneStrategy === "PRODUCT_STUDIO") {
      ctx.addIssue({ code: "custom", path: ["slides", i, "sceneStrategy"], message: "PRODUCT_STUDIO is not allowed in story-carousel mode; keep the product inside the story environment" });
    }
    if (slide.order === 4) {
      if (!HUMAN_SCENE_STRATEGIES.has(slide.sceneStrategy)) {
        ctx.addIssue({ code: "custom", path: ["slides", i, "sceneStrategy"], message: "Final slide must be HUMAN_GIFTING_MOMENT or HUMAN_LIFESTYLE (emotional payoff with a visible person)" });
      }
      if (slide.productRole === "hero") {
        ctx.addIssue({ code: "custom", path: ["slides", i, "productRole"], message: "Final slide is a human payoff, not a product shot; use productRole supporting" });
      }
    }
  });
});
export type StoryCreativePlan = z.infer<typeof storyCreativePlanSchema>;
export type StoryCreativeSlide = StoryCreativePlan["slides"][number];

const creativeBriefSchema = z.object({
  creativeMode: z.enum(["independent", "story-carousel"]),
  headline: z.string().min(1),
  subheadline: z.string(),
  cta: z.string().min(1),
  mood: z.string().min(1),
  backgroundDirection: z.string().min(1),
  productTreatment: z.string().min(1),
  logoPlacement: z.string().min(1),
  textPlacement: z.string().min(1),
  creativeGoal: z.string().min(1),
  carouselConcept: z.string().optional(),
  revealSlide: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  visualContinuity: z.object({
    characterContinuity: z.string().optional(),
    environmentContinuity: z.string().optional(),
    colorContinuity: z.string().optional(),
    stylingContinuity: z.string().optional(),
  }).optional(),
  variants: z.array(creativeVariantSchema.extend({ cta: z.string() })).min(3).max(4).refine(
    (variants) => {
      const types = variants.map((v) => v.creativeType);
      return new Set(types).size >= 2;
    },
    {
      message: "Must have at least 2 different creative types among the variants",
    }
  ),
}).superRefine((brief, ctx) => {
  if (brief.creativeMode === "story-carousel") {
    const result = storyCreativePlanSchema.safeParse({ ...brief, slides: brief.variants });
    if (!result.success) for (const issue of result.error.issues) {
      ctx.addIssue({ code: "custom", path: issue.path.map(p => p === "slides" ? "variants" : p), message: issue.message });
    }
  } else {
    brief.variants.forEach((v, i) => {
      if (!v.cta.length) ctx.addIssue({ code: "custom", path: ["variants", i, "cta"], message: "CTA required" });
    });
  }
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
