import type { ProjectConfig } from "./types.js";

// GreatFlowers is the original project. Every value below was copied unchanged from the
// pre-multi-project code; the golden tests (src/golden.test.ts) prove the output is identical.
// It keeps the original, unprefixed environment variable names and the original data folder.
export const greatflowers: ProjectConfig = {
  id: "greatflowers",
  isDefault: true,
  enabled: () => true,
  envName: (name) => name,
  env: (name) => process.env[name],
  dataDir: "data",
  brand: {
    name: "GreatFlowers",
    displayName: "Great Flowers",
    domain: "greatflowers.net",
    namePattern: /great\s*flowers/i,
    hashtag: "GreatFlowers",
    hermesSkill: "greatflowers-marketing-strategist",
    businessDescription: "a US online florist with same-day flower delivery",
    featureExamples: "Build Your Bouquet, same-day delivery, subscription",
    // The first name is the stable byline for new content. The others remain valid so legacy
    // drafts can still be edited and published unchanged.
    authors: [
      "Great Flowers Editorial Team",
      "Mason Thomas",
      "Olivia Bennett",
      "Ethan Parker",
      "Grace Mitchell",
      "Noah Carter",
      "Ava Reynolds",
      "Lucas Hayes",
      "Chloe Morgan",
    ],
    defaultAuthor: "Great Flowers Editorial Team",
    journalLabel: "GREAT FLOWERS JOURNAL",
    productCardBadge: "Same Day Delivery",
  },
  storefront: {
    defaultBaseUrl: "https://greatflowers.net",
    paths: { product: "product", blog: "blogs", wiki: "greatflowers-wiki", article: "greatflowers-articles" },
    websiteContextPages: [
      "https://greatflowers.net/",
      "https://greatflowers.net/build-your-bouquet/",
    ],
    ctaDisplayUrl: "www.greatflowers.net",
    userAgent: "GreatFlowers-AI-Marketing/1.0",
  },
  catalog: {
    productApiUrl: "https://api.greatflowers.net/api/product",
  },
  s3: {
    defaultPrefix: "campaign",
  },
  visual: {
    logoUrl: "https://greatflowers.net/assets/svg/greatflowers-logo.svg",
    // The wordmark gradient runs from deep indigo to magenta.
    logoColours: ["#351E6A", "#701888", "#A52E7F", "#B32C7E", "#DB2173"],
    // The site's own deep brand purple, used for headline copy. The near-miss values this replaced
    // (#32105f, #d61572) were close enough to look right in isolation and wrong beside the real site.
    textPrimary: "#261943",
    // --gf-primary: the fill on every button on greatflowers.net.
    ctaFill: "#701888",
    websiteCtaFill: "#261943",
    // Only brand hues are available as accents (--gf-primary and --gf-secondary). The photograph
    // decides which of them is used: purple for violet and lilac flowers, magenta otherwise.
    darkTextPalettes: [
      { primary: "#261943", accent: "#701888", secondary: "#3f3a44" },
      { primary: "#261943", accent: "#db2173", secondary: "#3f3a44" },
    ],
    // White copy sits on dark photographs, where the brand colours themselves are too dark to read,
    // so these are the same two hues lifted into tints rather than different colours.
    lightTextPalettes: [
      { primary: "#ffffff", accent: "#bf97c9", secondary: "#f7f1f5" },
      { primary: "#ffffff", accent: "#ff7fbd", secondary: "#f7f1f5" },
    ],
    journalBar: "#e7b85d",
    journalLabel: "#f0d08d",
    letteringColours: "dark plum or warm white",
  },
  schedule: {
    timezone: "Asia/Kolkata",
    blogDraftCron: "0 18 * * 1,3,5",
    // Wiki drafts are generated at 7 PM IST on alternate days from blogs, so the two Codex jobs
    // do not compete. A transient Hermes failure is retried every 30 minutes until 11:30 PM IST.
    wikiDraftCron: "0 19 * * 2,4,6",
    wikiRecoveryCrons: ["30 19 * * 2,4,6", "0,30 20-23 * * 2,4,6"],
    articleDraftCron: "30 18 * * 0",
    articleRecoveryCron: "0,30 19-23 * * 0",
  },
};
