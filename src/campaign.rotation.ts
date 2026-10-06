import type { MarketingProduct } from "./greatflowers.products.js";
import type { SavedCampaign } from "./campaign.store.js";
import type { RecommendationHistoryItem } from "./recommendation.store.js";
import { getActiveOccasions } from "./occasion.calendar.js";

export const CONTENT_THEMES = [
  "gifting-story", "home-styling", "flower-care", "product-spotlight",
  "seasonal-inspiration", "conversation-starter",
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
  const coolingThemes = new Set([...recent.slice(0, 2), ...published.slice(0, 2)].map(h => h.contentTheme));
  const availableThemes = CONTENT_THEMES.filter(t => !coolingThemes.has(t));
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
