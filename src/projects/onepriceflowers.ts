import type { ProjectConfig } from "./types.js";

const BASE = "https://www.onepriceflowers.com";

// Verified on onepriceflowers.com (home, About Us, FAQ, Build Your Own Bouquet) on 2026-11-16.
// "One price" means each bouquet SIZE has one price that already includes standard delivery and
// applicable sales tax. It does not mean every bouquet costs the same; prices vary by bouquet and size.
const PRICING_RULES = `ONE PRICE FLOWERS PRICING AND CLAIM RULES (verified brand facts; these override generic rules
that forbid mentioning delivery charges or tax):
- "One price" means each bouquet size has one price that already includes the flowers, standard delivery
  and applicable sales tax. There are no service fees and nothing is added at checkout. Only optional
  extras the customer selects (add-ons, premium vases) cost more.
- Approved wording: "One price. No additional charges for delivery or tax." / "No hidden charges. One price
  for flowers, standard delivery & applicable tax." / "Every size has one price." / "Beautiful flowers.
  One clear price." / "One price. No surprises."
- NEVER say that every bouquet costs the same or quote one store-wide price. NEVER quote a price that is
  not in the supplied verified product data.
- NEVER write "free delivery", "free shipping", "free same-day delivery", "tax-free" or "no tax". Say
  "no additional charge for standard delivery" instead.
- NEVER claim there are no holiday, weekend or date-based price differences, and never imply optional
  extras are included.
- NEVER name a competitor or quote another company's fees. A general contrast with "fees added at
  checkout" is allowed.
- Same-day delivery: available for orders placed before the cutoff for the recipient's ZIP code, in
  eligible delivery areas. Never say guaranteed or everywhere.
- Every order includes a complimentary message card. Florists may substitute blooms of equal or greater
  value; never promise an exact match to the photo.`;

// One Price Flowers runs on the same storefront platform as GreatFlowers; only the brand differs.
// Its settings use the OPF_ prefix: GF_ADMIN_API_URL becomes OPF_ADMIN_API_URL, META_PAGE_ID becomes
// OPF_META_PAGE_ID, and so on. It stays off until OPF_ENABLED=true.
export const onepriceflowers: ProjectConfig = {
  id: "onepriceflowers",
  isDefault: false,
  enabled: () => process.env.OPF_ENABLED === "true",
  envName: (name) => (name.startsWith("GF_") ? `OPF_${name.slice(3)}` : `OPF_${name}`),
  env: (name) => process.env[name.startsWith("GF_") ? `OPF_${name.slice(3)}` : `OPF_${name}`],
  dataDir: "data/projects/onepriceflowers",
  adminApiMaxPageSize: 100,
  // Safe first launch: no timed drafts until OPF_BLOG/WIKI/ARTICLE_AUTOGENERATE=true.
  autogenerateByDefault: false,
  brand: {
    name: "One Price Flowers",
    displayName: "One Price Flowers",
    domain: "onepriceflowers.com",
    namePattern: /one\s*price\s*flowers/i,
    hashtag: "OnePriceFlowers",
    hermesSkill: "onepriceflowers-marketing-strategist",
    contentSkill: "onepriceflowers-content-entries",
    businessDescription: "a US online florist where each bouquet size has one clear price that already includes standard delivery and applicable tax, with same-day delivery in many areas",
    featureExamples: "Build Your Own Bouquet, same-day delivery in eligible areas, one clear price with no additional charges for standard delivery or tax",
    promptAddendum: PRICING_RULES,
    // Bylines already used on onepriceflowers.com wiki entries and articles (checked 2026-11-17). The
    // first is the stable byline for new content; the writers share their names with GreatFlowers'
    // storefront. "One Price Flowers" stays valid for the drafts written before this list existed.
    authors: [
      "One Price Flowers Editorial Team",
      "Mason Thomas",
      "Olivia Bennett",
      "Ethan Parker",
      "Grace Mitchell",
      "Noah Carter",
      "Ava Reynolds",
      "Lucas Hayes",
      "Chloe Morgan",
      "One Price Flowers",
    ],
    defaultAuthor: "One Price Flowers Editorial Team",
    journalLabel: "ONE PRICE FLOWERS JOURNAL",
    // The storefront's own wording; same-day delivery depends on the ZIP and cutoff.
    productCardBadge: "Same-Day in Most Areas",
  },
  storefront: {
    defaultBaseUrl: BASE,
    // The storefront serves the flower wiki at /guides/ and articles at /articles/.
    paths: { product: "product", blog: "blogs", wiki: "guides", article: "articles" },
    websiteContextPages: [`${BASE}/`, `${BASE}/build-your-bouquet/`, `${BASE}/about-us/`],
    ctaDisplayUrl: "www.onepriceflowers.com",
    userAgent: "OnePriceFlowers-AI-Marketing/1.0",
  },
  catalog: {
    productApiUrl: "https://api.onepriceflowers.com/api/product",
  },
  s3: {
    // oneflowers-prod is the live storefront bucket (product images live under public/).
    // Marketing images must stay in their own prefix so campaign deletion can never reach them.
    defaultPrefix: "marketing/campaign",
  },
  visual: {
    logoUrl: `${BASE}/assets/brand/logo-green.svg`,
    // The wordmark is a single dark green (--brand-primary).
    logoColours: ["#154233"],
    logoAppearance: "a solid dark forest green",
    textPrimary: "#154233",
    ctaFill: "#154233",
    websiteCtaFill: "#154233",
    // Site tokens: --brand-primary #154233, --brand-secondary #e5aeaa (its -ink shade #95716e),
    // --brand-accent #f2b84b, --brand-text #1e1e1c, --brand-bg #fbf8f3.
    darkTextPalettes: [
      { primary: "#154233", accent: "#154233", secondary: "#1e1e1c" },
      { primary: "#154233", accent: "#95716e", secondary: "#1e1e1c" },
    ],
    lightTextPalettes: [
      { primary: "#ffffff", accent: "#e5aeaa", secondary: "#fbf8f3" },
      { primary: "#ffffff", accent: "#f2b84b", secondary: "#fbf8f3" },
    ],
    journalBar: "#f2b84b",
    journalLabel: "#e5aeaa",
    // Brand green (#154233) reads as deep forest green; warm white for dark scenes.
    letteringColours: "deep forest green or warm white",
  },
  schedule: {
    timezone: "Asia/Kolkata",
    // Kept entirely before GreatFlowers' 18:00-23:30 IST window: both brands share one Codex
    // image generator, and a job that finds it busy falls back to the product photo.
    blogDraftCron: "0 14 * * 1,3,5",
    wikiDraftCron: "30 14 * * 2,4,6",
    wikiRecoveryCrons: ["0,30 15-17 * * 2,4,6"],
    articleDraftCron: "0 14 * * 0",
    articleRecoveryCron: "30 14,15,16,17 * * 0",
  },
};
