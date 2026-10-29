import { z } from "zod";
import { ART_DIRECTIONS, COPY_LAYOUTS } from "./creative.direction.js";

export const SCENE_STRATEGIES = [
  "PRODUCT_STUDIO",
  "HUMAN_GIFTING_MOMENT",
  "HUMAN_LIFESTYLE",
  "OCCASION_SCENE",
  "EDITORIAL_CONTENT",
  "INFORMATIONAL_GRAPHIC",
  "LOCATION_STORY",
  "FEATURE_DEMO",
  "BRAND_STORY",
] as const;

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
  sceneStrategy: z.enum(SCENE_STRATEGIES),
  concept: z.string().min(1),
  headline: z.string().min(1),
  subheadline: z.string(),
  contentPoints: z.array(z.string().trim().min(3).max(72)).min(2).max(4).optional(),
  cta: z.string().min(1),
  visualDirection: z.string().min(1),
  productRole: z.enum(["hero", "supporting", "optional", "none"]),
  locationContext: z.string().optional(),
  occasionContext: z.string().optional(),
  colorPalette: z.string().min(1),
  compositionStyle: z.string().min(1),
  lightingStyle: z.string().min(1),
  sceneType: z.string().min(1),
  artDirection: z.enum(ART_DIRECTIONS).optional(),
  copyLayout: z.enum(COPY_LAYOUTS).optional(),
  brandRole: z.enum(["none", "subtle", "reveal"]).optional(),
  sceneChange: z.string().min(1).optional(),
  cameraDirection: z.string().min(1).optional(),
  storyRole: z.string().optional(),
  storyBeat: z.string().optional(),
});

const HUMAN_SCENE_STRATEGIES = new Set(["HUMAN_GIFTING_MOMENT", "HUMAN_LIFESTYLE"]);
const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
const COMMERCIAL_CTA_PATTERN = /\b(?:shop|order|buy)\b|\bsend\s+(?:flowers?|a\s+bouquet|the\s+bouquet|this\s+bouquet|something\s+thoughtful|a\s+flower\s+gift)\b|\bexplore\s+(?:the\s+)?collection\b|\bview\s+(?:the\s+)?bouquet\b|\bchoose\s+(?:your|a)\s+bouquet\b|\bbuild\s+(?:your|a)\s+bouquet\b/i;

const CONTENT_PROMISE_PATTERN = /\b(?:steps|checks|tips|ways|routine|checklist|cheat\s*sheet)\b|\b(?:a|the|your|our|quick|simple|complete|essential|care|flower|buying|selection)\s+guide\b|\bguide\s+(?:to|for)\b/i;
const PROMISED_COUNT_PATTERN = /\b(2|two|3|three|4|four)\b(?:[\s-]+[a-z][a-z'-]*){0,3}[\s-]+(?:steps?|checks?|tips?|ways?|points?|items?)\b/i;
const CONTENT_COUNT: Record<string, number> = { "2": 2, two: 2, "3": 3, three: 3, "4": 4, four: 4 };
const PROP_AS_PERSON_PATTERN = /\b(?:(?:name|thank|celebrate|honor|appreciate|recognize)\s+(?:the|a|an|this|that|your)\s+(?:red\s+|spare\s+)?(?:pen|key|desk|mug|tool|card)|(?:the|a|an|this|that|your)\s+(?:red\s+|spare\s+)?(?:pen|key|desk|mug|tool|card)\s+(?:(?:that|which)\s+)?(?:is|isn't|was|wasn't|deserves|needs|says|speaks|remembers|made|started))\b/i;

function promisedContentCount(copy: string): number | undefined {
  const match = copy.match(PROMISED_COUNT_PATTERN);
  return match ? CONTENT_COUNT[match[1]!.toLowerCase()] : undefined;
}

// Who is giving flowers to whom. Every story must answer this before any image is made.
export const giftingRelationshipSchema = z.object({
  sender: z.string().min(1).describe("Who buys/sends the flowers (the customer). Age, look, clothing."),
  recipient: z.string().min(1).describe("Who receives them. Age, look, clothing. Use the same description as sender only for an explicit self-gift."),
  relationship: z.string().min(1).describe("How they relate, e.g. 'husband to wife', 'daughter to mother', 'friend to friend', 'self-gift'."),
  reason: z.string().min(1).describe("Why flowers are being given in this story, in one sentence."),
  pointOfView: z.enum(["sender", "recipient", "both"]).describe("Whose experience the slides follow."),
});
export type GiftingRelationship = z.infer<typeof giftingRelationshipSchema>;

export const storyCreativePlanSchema = z.object({
  carouselConcept: z.string().min(1),
  revealSlide: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  giftingRelationship: giftingRelationshipSchema,
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

export const creativeBriefSchema = z.object({
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
  creativeScenario: z.string().optional().describe("Specific human situation justifying the flowers, e.g., 'grandmother turning 80, wants to feel celebrated after a quiet year'"),
  carouselConcept: z.string().optional(),
  revealSlide: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  giftingRelationship: giftingRelationshipSchema.optional(),
  visualContinuity: z.object({
    characterContinuity: z.string().optional(),
    environmentContinuity: z.string().optional(),
    colorContinuity: z.string().optional(),
    stylingContinuity: z.string().optional(),
  }).optional(),
  variants: z.array(creativeVariantSchema.extend({ cta: z.string() })).length(4),
}).superRefine((brief, ctx) => {
  if (brief.creativeMode === "story-carousel") {
    const result = storyCreativePlanSchema.safeParse({ ...brief, slides: brief.variants });
    if (!result.success) for (const issue of result.error.issues) {
      ctx.addIssue({ code: "custom", path: issue.path.map(p => p === "slides" ? "variants" : p), message: issue.message });
    }
  } else {
    const normalized = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
    const uniqueCount = (values: string[]) => new Set(values.map(normalized)).size;
    const types = brief.variants.map((variant) => variant.creativeType);
    if (new Set(types).size < 3) {
      ctx.addIssue({
        code: "custom",
        path: ["variants"],
        message: "Independent creatives require at least 3 different creative types",
      });
    }

    if (new Set(brief.variants.map(v => v.order)).size !== 4) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Independent creatives require unique orders 1–4" });
    }
    if (new Set(brief.variants.map(v => v.sceneStrategy)).size < 3) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Independent creatives require at least 3 different scene strategies" });
    }
    if (uniqueCount(brief.variants.map(v => v.concept)) !== 4 || uniqueCount(brief.variants.map(v => v.headline)) !== 4) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Every independent creative requires a distinct concept and headline" });
    }
    if (uniqueCount(brief.variants.map(v => v.compositionStyle)) < 3 || uniqueCount(brief.variants.map(v => v.sceneType)) < 3) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Independent creatives require at least 3 different compositions and scene types" });
    }
    if (brief.variants.some(v => !v.artDirection) || uniqueCount(brief.variants.map(v => v.artDirection || "")) !== 4) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Independent creatives require four explicit, different artDirection values" });
    }
    if (brief.variants.some(v => !v.copyLayout) || uniqueCount(brief.variants.map(v => v.copyLayout || "")) < 3) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Independent creatives require explicit copyLayout values with at least three different layouts" });
    }
    if (brief.variants.filter(v => v.productRole === "hero").length > 1) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Only one independent creative may use the catalog product as the hero" });
    }
    const catalogProductCount = brief.variants.filter(v => v.productRole === "hero" || v.productRole === "supporting").length;
    if (catalogProductCount !== 2) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Exactly two independent creatives must use the catalog product; the other two must use visible, concept-relevant flowers without copying it" });
    }
    if (brief.variants.some(v => v.productRole === "none")) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Independent GreatFlowers creatives must always show flowers; use productRole optional when the catalog product is not referenced" });
    }
    if (brief.variants.filter(v => v.creativeType === "informational").length > 1) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Only one independent creative may be informational" });
    }
    if (!brief.variants.some(v => HUMAN_SCENE_STRATEGIES.has(v.sceneStrategy))) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Independent creatives require at least one human lifestyle or gifting scene" });
    }
    if (!brief.variants.some(v => COMMERCIAL_CTA_PATTERN.test(v.cta))) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "At least one independent creative requires a gentle shopping or flower-sending CTA" });
    }

    brief.variants.forEach((v, i) => {
      if (v.contentPoints?.length && v.copyLayout?.startsWith("lower-")) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "copyLayout"], message: "Informational content points require a top or full-bleed copy layout" });
      }
      if (!v.cta.length) ctx.addIssue({ code: "custom", path: ["variants", i, "cta"], message: "CTA required" });
      if (wordCount(v.headline) > 6) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "headline"], message: "Independent creative headlines must be no more than 6 words" });
      }
      if (wordCount(v.subheadline) > 10) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "subheadline"], message: "Independent creative subheadlines must be no more than 10 words" });
      }
      const copy = `${v.headline} ${v.subheadline}`;
      if (PROP_AS_PERSON_PATTERN.test(copy)) {
        ctx.addIssue({
          code: "custom",
          path: ["variants", i, "headline"],
          message: "Copy must address the person or benefit directly; a prop cannot replace or impersonate the recipient",
        });
      }
      const promisesContent = CONTENT_PROMISE_PATTERN.test(copy) || PROMISED_COUNT_PATTERN.test(copy);
      const points = v.contentPoints || [];
      if (promisesContent && points.length < 2) {
        ctx.addIssue({
          code: "custom",
          path: ["variants", i, "contentPoints"],
          message: "Copy that promises steps, a routine, checklist, cheat sheet or guide must include the actual content points",
        });
      }
      const promisedCount = promisesContent ? promisedContentCount(copy) : undefined;
      if (promisedCount && points.length !== promisedCount) {
        ctx.addIssue({
          code: "custom",
          path: ["variants", i, "contentPoints"],
          message: `Copy promises ${promisedCount} items, so exactly ${promisedCount} content points are required`,
        });
      }
      if (points.length && new Set(points.map(normalized)).size !== points.length) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "contentPoints"], message: "Content points must be distinct" });
      }
      points.forEach((point, pointIndex) => {
        if (/^(?:(?:step|tip|item|point|check)\s*\d*|\d+|one|two|three|four|first|second|third|fourth)[:.]?$/i.test(point.trim())) {
          ctx.addIssue({
            code: "custom",
            path: ["variants", i, "contentPoints", pointIndex],
            message: "Content points must be meaningful actions, not empty labels",
          });
        }
      });
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
        caption: z.string().min(40).refine(
          (caption) => caption.trim().split(/\s+/).filter(Boolean).length <= 120,
          "Instagram caption must be no more than 120 words",
        ).refine((caption) => !/#[\p{L}\p{N}_]+/u.test(caption), "Instagram caption must not contain hashtags"),
        hashtags: z.array(z.string()).min(6).max(10).refine(
          (tags) => new Set(tags.map((tag) => tag.toLowerCase())).size === tags.length,
          "Instagram hashtags must be unique",
        ),
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
