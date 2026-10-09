import type { MarketingProduct } from "./greatflowers.products.js";
import type { SavedCampaign } from "./campaign.store.js";
import type { RecommendationHistoryItem } from "./recommendation.store.js";
import { getActiveOccasions } from "./occasion.calendar.js";

export const CONTENT_THEMES = [
  "gifting-story", "home-styling", "flower-care", "product-spotlight",
  "seasonal-inspiration", "conversation-starter", "recipient-spotlight",
  "color-story", "hosting-tablescape", "workplace-appreciation",
  "self-care-ritual", "milestone-moment", "relationship-appreciation",
  "occasion-planning", "mood-expression", "design-details",
] as const;
export const VISUAL_TREATMENTS = [
  "bouquet-detail", "room-setting", "human-moment", "editorial-flatlay", "educational-layout",
] as const;
export type ContentTheme = typeof CONTENT_THEMES[number];
export type VisualTreatment = typeof VISUAL_TREATMENTS[number];
export type RotationEntry = {
  [K in keyof RecommendationHistoryItem]?: RecommendationHistoryItem[K] | undefined;
} & { source?: string };

const themes: Record<ContentTheme, { goal: string; priority: string; guidance: string; visuals: VisualTreatment[] }> = {
  "gifting-story": {
    goal: "Generate orders",
    priority: "Conversions",
    guidance: "A fresh, specific reason to give flowers. Vary relationships and situations, not just occasion labels.",
    visuals: ["human-moment", "room-setting", "editorial-flatlay"],
  },
  "home-styling": {
    goal: "Build brand awareness",
    priority: "Awareness",
    guidance: "Practical inspiration for a home or workspace using a real GreatFlowers arrangement. No forced gift story.",
    visuals: ["room-setting", "editorial-flatlay", "human-moment"],
  },
  "flower-care": {
    goal: "Encourage saves and shares",
    priority: "Engagement",
    guidance: "Useful general flower-care education connected naturally to GreatFlowers. Do not invent species, longevity guarantees or product-specific care facts; omit uncertain advice. Invite saves or shares.",
    visuals: ["educational-layout", "bouquet-detail", "editorial-flatlay"],
  },
  "product-spotlight": {
    goal: "Drive product discovery",
    priority: "Consideration",
    guidance: "Explore verified details of a real catalog bouquet, with a natural invitation to discover it. Do not invent flower varieties or craftsmanship claims.",
    visuals: ["bouquet-detail", "editorial-flatlay", "room-setting"],
  },
  "seasonal-inspiration": {
    goal: "Build brand awareness",
    priority: "Awareness",
    guidance: "Seasonal colors, styling or a relevant active holiday. Use the current US season; do not invent a holiday or imply seasonal demand is measured.",
    visuals: ["room-setting", "editorial-flatlay", "bouquet-detail"],
  },
  "conversation-starter": {
    goal: "Encourage comments and shares",
    priority: "Engagement",
    guidance: "An inviting flower preference question or everyday conversation tied to GreatFlowers. No fake polls, testimonials, giveaways or unsupported product comparisons.",
    visuals: ["educational-layout", "human-moment", "bouquet-detail"],
  },
  "recipient-spotlight": {
    goal: "Help customers choose confidently",
    priority: "Consideration",
    guidance: "Build a practical selection idea around one specific hypothetical recipient type, such as a mentor, host, close friend or new parent. Focus on their context and taste; do not claim demographic behavior or turn it into a generic occasion post.",
    visuals: ["human-moment", "bouquet-detail", "room-setting"],
  },
  "color-story": {
    goal: "Drive visual discovery",
    priority: "Awareness",
    guidance: "Center the campaign on the verified color palette visible in one real arrangement and the atmosphere those colors can create. Do not invent flower varieties, symbolism or color details not supported by the product image and catalog.",
    visuals: ["bouquet-detail", "editorial-flatlay", "room-setting"],
  },
  "hosting-tablescape": {
    goal: "Inspire occasion hosting",
    priority: "Consideration",
    guidance: "Show a concrete hosting or tablescape use for a real arrangement: dinner, brunch, welcome table or small gathering. Make the setting the story and avoid unsupported claims about size, fragrance or longevity.",
    visuals: ["room-setting", "editorial-flatlay", "bouquet-detail"],
  },
  "workplace-appreciation": {
    goal: "Expand professional gifting consideration",
    priority: "Consideration",
    guidance: "Create a specific professional appreciation or workplace moment for a colleague, mentor, team member or client. Keep it warm and appropriate; do not invent corporate services, bulk pricing or delivery guarantees.",
    visuals: ["human-moment", "room-setting", "editorial-flatlay"],
  },
  "self-care-ritual": {
    goal: "Build an everyday flower habit",
    priority: "Awareness",
    guidance: "Frame flowers as part of a grounded personal ritual, reset or small act of self-kindness. Avoid medical, therapeutic or guaranteed mood claims and do not convert it into a gifting story.",
    visuals: ["human-moment", "room-setting", "bouquet-detail"],
  },
  "milestone-moment": {
    goal: "Generate orders for life moments",
    priority: "Conversions",
    guidance: "Choose one specific achievement or transition—new job, graduation, new home, retirement or personal goal—and dramatize the recognition moment. Keep it distinct from birthdays and generic congratulations.",
    visuals: ["human-moment", "room-setting", "editorial-flatlay"],
  },
  "relationship-appreciation": {
    goal: "Create thoughtful gifting intent",
    priority: "Conversions",
    guidance: "Celebrate one clearly defined relationship and an everyday reason for appreciation without relying on a calendar holiday. Make the bond and message specific; do not use a testimonial or repeat a generic gift exchange.",
    visuals: ["human-moment", "editorial-flatlay", "room-setting"],
  },
  "occasion-planning": {
    goal: "Help customers plan ahead",
    priority: "Consideration",
    guidance: "Offer a concise planning angle for choosing flowers for one upcoming moment, covering decisions such as recipient, setting, palette or message. Do not claim delivery windows, availability or policies unless supplied by live evidence.",
    visuals: ["educational-layout", "editorial-flatlay", "bouquet-detail"],
  },
  "mood-expression": {
    goal: "Connect flowers with personal expression",
    priority: "Engagement",
    guidance: "Start with one non-medical emotional tone—joyful, calm, bold, warm or reflective—and use a verified arrangement as a way to express it. Avoid therapy claims, guaranteed emotional outcomes and unsupported symbolism.",
    visuals: ["bouquet-detail", "human-moment", "editorial-flatlay"],
  },
  "design-details": {
    goal: "Deepen product consideration",
    priority: "Consideration",
    guidance: "Invite a closer look at verified visible design elements such as palette, silhouette, contrast, texture or container. Use only catalog facts and visible image evidence; do not invent flower varieties, techniques or florist craftsmanship claims.",
    visuals: ["bouquet-detail", "editorial-flatlay", "educational-layout"],
  },
};

// Callers supply newest-first histories. Legacy records without creative metadata remain useful.
export function publishedRotationHistory(campaigns: SavedCampaign[]): RotationEntry[] {
  return campaigns.filter(c => c.publishedAt || c.publishStatus === "published" || c.publishedPlatforms?.length)
    .sort((a, b) => (b.publishedAt || b.updatedAt).localeCompare(a.publishedAt || a.updatedAt))
    .slice(0, 20).map(c => ({
      source: "published", productId: c.selectedProduct?.id,
      productName: c.selectedProduct?.name || c.input.product,
      occasion: c.input.occasion, contentTheme: c.input.contentTheme,
      visualTreatment: c.input.visualTreatment,
      creativeScenario: c.input.creativeScenario || c.strategy.creativeBrief?.creativeScenario,
      marketingAngle: c.strategy.marketingAngle,
      visualDirection: c.strategy.creativeBrief?.backgroundDirection,
    }));
}

function weightedPick<T>(items: T[], weight: (item: T) => number, random: () => number): T {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let cursor = random() * total;
  for (const item of items) {
    cursor -= weight(item);
    if (cursor < 0) return item;
  }
  return items[items.length - 1]!;
}

export function createRotationPlan(
  products: MarketingProduct[],
  recent: RotationEntry[],
  published: RotationEntry[],
  today = new Date(),
  random = Math.random,
) {
  const history = [...recent, ...published];
  const seasonal = getActiveOccasions(today).seasonal;
  const importantSeason = seasonal.some(o => o.priority === "critical" || o.priority === "high");
  // Complete a full content-theme cycle before repeating one. Recommendation history
  // is first because it reflects each click; published history fills gaps for a
  // fresh/legacy recommendation store. Old entries without theme metadata are ignored.
  const themeCycleHistory = [...recent, ...published]
    .map(entry => entry.contentTheme)
    .filter((theme): theme is ContentTheme => !!theme && CONTENT_THEMES.includes(theme as ContentTheme));
  const usedInCurrentCycle = new Set(themeCycleHistory.slice(0, CONTENT_THEMES.length - 1));
  const availableThemes = CONTENT_THEMES.filter(theme => !usedInCurrentCycle.has(theme));
  const contentTheme = weightedPick(availableThemes, t => {
    const seasonalWeight = importantSeason && (t === "seasonal-inspiration" || t === "gifting-story") ? 3 : 1;
    return seasonalWeight / (1 + history.filter(h => h.contentTheme === t).length);
  }, random);
  const theme = themes[contentTheme];
  const coolingVisuals = new Set([recent[0]?.visualTreatment, published[0]?.visualTreatment]);
  const availableVisuals = theme.visuals.filter(v => !coolingVisuals.has(v));
  const visualTreatment = weightedPick(availableVisuals, v => 1 / (1 + history.filter(h => h.visualTreatment === v).length), random);
  const eligible = products.filter(p => p.stockStatus === "in_stock" && p.image);
  if (!eligible.length) throw new Error("No in-stock products with images are available for a recommendation");
  const coolingProducts = new Set([...recent.slice(0, 3), ...published.slice(0, 3)].map(h => h.productId));
  const freshProducts = eligible.filter(p => !coolingProducts.has(p.id));
  // Preserve seasonal product fit and gracefully handle small catalogs.
  const candidates = !importantSeason && freshProducts.length ? freshProducts : eligible;
  return {
    contentTheme, visualTreatment, campaignGoal: theme.goal, priority: theme.priority,
    guidance: theme.guidance, candidates,
    productCooldownRelaxed: candidates === eligible && eligible.some(p => coolingProducts.has(p.id)),
    recent, published,
  };
}
export type RotationPlan = ReturnType<typeof createRotationPlan>;
