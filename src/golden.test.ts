// Golden snapshots of every GreatFlowers-specific prompt, overlay, URL and payload.
//
// The fixtures in src/__golden__/greatflowers/ were generated from the code BEFORE the
// multi-project refactor. GreatFlowers output must stay byte-identical: if one of these
// tests fails after a refactor, GreatFlowers behavior changed. Regenerate the fixtures
// (UPDATE_GOLDEN=1 npm test) only for an intentional, reviewed GreatFlowers change.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { renderPoster } from "./creative.poster.js";

import { buildPrompt, generateMarketingStrategy, generateStoryCreativePlan, type CampaignInput } from "./hermes.js";
import { generateCampaignRecommendation } from "./campaign.recommender.js";
import { createRotationPlan } from "./campaign.rotation.js";
import { buildBlogPrompt, resolveLinks, type CatalogProduct } from "./blog.generator.js";
import { buildHeroOverlaySvg, buildHeroPrompt } from "./blog.image.js";
import { storefrontUrl } from "./blog.publisher.js";
import { buildWikiPrompt, resolveWikiLinks, WIKI_SUBJECTS } from "./wiki.generator.js";
import { buildWikiImagePrompt } from "./wiki.image.js";
import { buildWikiPublishPayload, wikiStorefrontUrl } from "./wiki.publisher.js";
import { buildArticlePrompt, resolveArticleLinks } from "./article.generator.js";
import { buildArticleImagePrompt } from "./article.image.js";
import { articleStorefrontUrl } from "./article.publisher.js";
import { buildCodexPrompt, buildLogoScrimSvg, buildWebsiteCta, type CreativeBrief, type CreativeVariant } from "./codex.creative.js";
import { greatflowers, storefrontBase } from "./projects/index.js";
import { generatedArticleJsonSchema, articleEditSchema } from "./article.schema.js";
import { GeneratedPostJsonSchema, blogEditSchema } from "./blog.schema.js";
import { GeneratedWikiJsonSchema } from "./wiki.schema.js";
import { buildStorySlidePrompt, buildStoryTextOverlay } from "./codex.story.js";
import { buildCreativeTextOverlay } from "./creative.text.js";
import { buildInstagramCaption, formatHashtags } from "./meta.publisher.js";
import { getCatalogProducts, type MarketingProduct } from "./catalog.products.js";
import { getWebsiteContext, type WebsitePageContext } from "./website.context.js";
import { contentAuthors, defaultContentAuthor } from "./content.authors.js";
import type { StoryCreativePlan } from "./strategy.schema.js";
import type { WikiDraft } from "./wiki.schema.js";

const GOLDEN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "__golden__", "greatflowers");
const UPDATE = process.env.UPDATE_GOLDEN === "1";
const NOW = new Date("2026-11-16T12:00:00.000Z");
const gf = greatflowers;

function golden(name: string, value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const file = path.join(GOLDEN_DIR, `${name}.txt`);
  if (UPDATE) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(file, text);
    return;
  }
  assert.ok(existsSync(file), `missing golden fixture ${name}.txt; run UPDATE_GOLDEN=1 on the pre-refactor code`);
  assert.equal(text, readFileSync(file, "utf8"), `GreatFlowers output changed: ${name}`);
}

// Frozen clock plus a seeded PRNG so every run renders the same text.
function deterministic(t: TestContext) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  let seed = 42;
  t.mock.method(Math, "random", () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  });
  for (const method of ["log", "warn", "error"] as const) t.mock.method(console, method, () => {});
}

function withEnv(t: TestContext, values: Record<string, string | undefined>) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

// Records every outgoing request body, then fails it so no real network call happens.
function captureFetch(t: TestContext, respond?: (url: string) => Response) {
  const calls: Array<{ url: string; headers: unknown; body: unknown }> = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit = {}) => {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), headers: init.headers ?? null, body });
    return respond ? respond(String(url)) : new Response("golden capture", { status: 500 });
  });
  return calls;
}

const catalog: CatalogProduct[] = [
  { id: 7, name: "Rose Garden Bouquet", slug: "rose-garden", price: 50, imageUrl: "https://example.test/rose.webp", description: "Red roses arranged with greenery." },
  { id: 8, name: "Sunshine Bouquet", slug: "sunshine", price: 45, imageUrl: "https://example.test/sun.webp", description: "Yellow sunflowers with seasonal greenery." },
  { id: 9, name: "Pink Rose Bouquet", slug: "pink-rose-bouquet", price: 59.97, imageUrl: "https://example.test/pink.webp", description: "Pink roses arranged in a vase." },
  { id: 10, name: "White Lily Bouquet", slug: "white-lily", price: null, imageUrl: "https://example.test/lily.webp", description: "" },
];

const marketingProducts: MarketingProduct[] = [
  { id: 1, name: "Catalog bouquet", description: "Verified catalog description", price: 40, salePrice: null, stockStatus: "in_stock", slug: "catalog-bouquet", url: "https://greatflowers.net/product/catalog-bouquet", image: "https://example.test/flower.jpg", categories: ["Flowers"], ordersCount: 3, featured: false, trending: true },
  { id: 2, name: "Second bouquet", description: "Another verified description", price: 55, salePrice: 49, stockStatus: "in_stock", slug: "second-bouquet", url: "https://greatflowers.net/product/second-bouquet", image: "https://example.test/second.jpg", categories: ["Birthday"], ordersCount: 0, featured: true, trending: false },
];

const campaignInputs: Record<string, CampaignInput> = {
  minimal: {
    campaignGoal: "Build consideration",
    product: "Petals of Grace",
    audience: "US flower shoppers",
    trafficSource: "Organic Social",
    platforms: ["Instagram", "Facebook"],
    priority: "medium",
  },
  full: {
    campaignGoal: "Generate orders",
    product: "Rose Garden Bouquet",
    occasion: "Birthday",
    creativeScenario: "A sister sends flowers to celebrate a new job and a birthday in the same week",
    contentTheme: "gifting-story",
    visualTreatment: "documentary-gifting",
    audience: "Gift buyers in the US",
    trafficSource: "Organic Social",
    platforms: ["Instagram", "Facebook", "Pinterest"],
    priority: "high",
    additionalContext: "Verified product URL: https://greatflowers.net/product/rose-garden",
  },
  care: {
    campaignGoal: "Build engagement",
    product: "Sunshine Bouquet",
    occasion: "Flower Care",
    contentTheme: "flower-care",
    visualTreatment: "flower-care-demonstration",
    audience: "Flower owners",
    trafficSource: "Organic Social",
    platforms: ["Instagram"],
    priority: "medium",
  },
};

const SCENES = [
  ["PRODUCT_STUDIO", "product", "hero"],
  ["HUMAN_GIFTING_MOMENT", "lifestyle", "supporting"],
  ["HUMAN_LIFESTYLE", "lifestyle", "supporting"],
  ["OCCASION_SCENE", "occasion", "optional"],
  ["EDITORIAL_CONTENT", "informational", "optional"],
  ["INFORMATIONAL_GRAPHIC", "informational", "none"],
  ["LOCATION_STORY", "location", "optional"],
  ["FEATURE_DEMO", "feature", "supporting"],
  ["BRAND_STORY", "brand-awareness", "optional"],
] as const;

const variant = (overrides: Partial<CreativeVariant> = {}): CreativeVariant => ({
  order: 1,
  creativeType: "lifestyle",
  sceneStrategy: "HUMAN_LIFESTYLE",
  concept: "A thoughtful birthday moment",
  headline: "Bring the Blooms to Their Birthday",
  subheadline: "A thoughtful surprise for their day.",
  cta: "Shop flowers",
  visualDirection: "A warm human birthday moment",
  productRole: "supporting",
  occasionContext: "Birthday",
  colorPalette: "Warm natural colors",
  compositionStyle: "Person right, negative space left",
  lightingStyle: "Golden natural light",
  sceneType: "Birthday gifting moment",
  artDirection: "documentary-gifting",
  copyLayout: "top-left-editorial",
  environment: "living-room-seating",
  lightingSetup: "golden-hour",
  ...overrides,
});

const brief = (creative: CreativeVariant): CreativeBrief => ({
  headline: creative.headline,
  subheadline: creative.subheadline,
  cta: creative.cta,
  mood: "Warm and premium",
  backgroundDirection: "A real, softly lit home",
  productTreatment: "Preserve the product",
  logoPlacement: "top-right",
  textPlacement: "top-left",
  creativeGoal: "Create birthday consideration",
  variants: [creative],
});

const storySlide = (order: 1 | 2 | 3 | 4, revealSlide: number) => ({
  ...variant({ order, sceneStrategy: order === 4 ? "HUMAN_GIFTING_MOMENT" : "HUMAN_LIFESTYLE" }),
  productRole: (order < revealSlide ? "none" : "supporting") as CreativeVariant["productRole"],
  cta: order === 4 ? "Shop flowers" : "",
  storyRole: `Role ${order}`,
  storyBeat: `Beat ${order}`,
  brandRole: (order < revealSlide ? "none" : order === 4 ? "reveal" : "subtle") as "none" | "subtle" | "reveal",
  sceneChange: `Scene change ${order}`,
  cameraDirection: `Camera ${order}`,
});

const storyPlan: StoryCreativePlan = {
  carouselConcept: "A quiet week turns into a celebration",
  revealSlide: 3,
  giftingRelationship: { sender: "Adult sister", recipient: "Younger sister", relationship: "sister to sister", reason: "To celebrate a new job", pointOfView: "recipient" },
  visualContinuity: { characterContinuity: "Same younger sister", environmentContinuity: "Same apartment", colorContinuity: "Warm neutrals", stylingContinuity: "Casual knitwear" },
  slides: [1, 2, 3, 4].map((order) => storySlide(order as 1 | 2 | 3 | 4, 3)),
};

test("golden: campaign strategy prompts", () => {
  for (const [name, input] of Object.entries(campaignInputs)) golden(`hermes.buildPrompt.${name}`, buildPrompt(gf, input));
});

test("golden: Hermes request for a marketing strategy", async (t) => {
  deterministic(t);
  withEnv(t, { HERMES_API_KEY: "golden-test", HERMES_API_URL: "http://hermes.test/v1/chat/completions" });
  const calls = captureFetch(t);
  await generateMarketingStrategy(gf, campaignInputs.full!).catch(() => undefined);
  golden("hermes.generateMarketingStrategy.request", calls[0]?.body);
});

test("golden: Hermes request for a story plan", async (t) => {
  deterministic(t);
  withEnv(t, { HERMES_API_KEY: "golden-test", HERMES_API_URL: "http://hermes.test/v1/chat/completions" });
  const calls = captureFetch(t);
  await generateStoryCreativePlan(gf, campaignInputs.full!, { id: 7, name: "Rose Garden Bouquet" }, { marketingAngle: "Celebrate the week" }).catch(() => undefined);
  golden("hermes.generateStoryCreativePlan.request", calls[0]?.body);
});

test("golden: rotation guidance and recommendation request", async (t) => {
  deterministic(t);
  withEnv(t, { HERMES_API_KEY: "golden-test", HERMES_API_URL: "http://hermes.test/v1/chat/completions" });
  const plans = [0.01, 0.18, 0.35, 0.52, 0.69, 0.86, 0.99].map((r) => {
    const { candidates, recent, published, ...plan } = createRotationPlan(gf, marketingProducts, [], [], new Date("2026-07-20T12:00:00Z"), () => r);
    return { r, ...plan, candidates: candidates.map((p) => p.id) };
  });
  golden("campaign.rotation.plans", plans);

  const rotation = createRotationPlan(gf, marketingProducts, [{ creativeScenario: "Already used scene" }], [{ marketingAngle: "Previously published angle" }], new Date("2026-11-16T12:00:00Z"), () => 0.3);
  const calls = captureFetch(t);
  const website: WebsitePageContext[] = [{ url: "https://greatflowers.net/", title: "GreatFlowers", text: "Verified website message" }];
  await generateCampaignRecommendation(gf, marketingProducts, website, ["Catalog bouquet — Birthday"], [{ itemId: "1", itemName: "Catalog bouquet", views: 3, addToCarts: 1, checkouts: 0, purchases: 0 }], undefined, rotation).catch(() => undefined);
  golden("campaign.recommender.request", calls[0]?.body);
});

test("golden: blog prompt, links, hero prompt and overlay", (t) => {
  deterministic(t);
  withEnv(t, { GF_STOREFRONT_URL: undefined });
  golden("blog.storefrontBase.unset", storefrontBase(gf));
  golden("blog.storefrontUrl.unset", String(storefrontUrl(gf, "spring-flowers")));
  withEnv(t, { GF_STOREFRONT_URL: "https://store.example.test/" });
  golden("blog.storefrontBase.set", storefrontBase(gf));
  golden("blog.storefrontUrl.set", String(storefrontUrl(gf, "spring-flowers")));

  for (const requiredFormat of ["CURATED_LIST", "OCCASION_PLAYBOOK"] as const) {
    golden(`blog.buildBlogPrompt.${requiredFormat}`, buildBlogPrompt({
      project: gf,
      today: "2026-11-16",
      existingTitles: ["[blog] Thanksgiving Centerpiece Ideas", "[wiki] Roses"],
      existingSlugs: ["thanksgiving-centerpiece-ideas"],
      categories: [{ slug: "gift", name: "Gift" }, { slug: "birthday", name: "Birthday" }],
      products: catalog,
      related: [{ slug: "thanksgiving-centerpiece-ideas", title: "Thanksgiving Centerpiece Ideas" }],
      recentHeroConcepts: ["A host sets a long table at dusk"],
      requiredFormat,
      ...(requiredFormat === "OCCASION_PLAYBOOK" ? { requestedOccasion: "Friendsgiving" } : {}),
    }));
  }
  golden("blog.resolveLinks", resolveLinks('<p><a href="PRODUCT:7">Roses</a> <a href="BLOG:thanksgiving-centerpiece-ideas">ideas</a> <a href="HOME">Great Flowers</a></p>', {
    project: gf, productSlugs: new Map(catalog.map((p) => [p.id, p.slug])), blogSlugs: new Set(["thanksgiving-centerpiece-ideas"]), base: "https://greatflowers.net",
  }));
  for (const heroStrategy of ["HUMAN_GIFTING_MOMENT", "HUMAN_LIFESTYLE", "OCCASION_SCENE", "EDITORIAL_CONTENT"] as const) {
    golden(`blog.buildHeroPrompt.${heroStrategy}`, buildHeroPrompt({ title: "Thoughtful Thank You Flowers", topic: "thank you gifts", heroStrategy, heroConcept: "A neighbor hands over a bouquet at the door." }, "a fixed composition"));
  }
  golden("blog.buildHeroPrompt.sympathy", buildHeroPrompt({ title: "Sympathy Flowers Guide", topic: "sympathy" }, "a fixed composition"));
  golden("blog.buildHeroOverlaySvg", buildHeroOverlaySvg(gf, "Thoughtful Thank You Flowers for Every Kind of Helper").toString());
});

test("golden: wiki prompt, links, image prompt and payload", (t) => {
  deterministic(t);
  withEnv(t, { GF_STOREFRONT_URL: undefined });
  golden("wiki.storefrontUrl.unset", String(wikiStorefrontUrl(gf, "roses")));
  const subject = WIKI_SUBJECTS[0]!;
  golden("wiki.buildWikiPrompt.defaultAuthor", buildWikiPrompt(gf, subject, catalog, ["Lilies", "Tulips"]));
  golden("wiki.buildWikiPrompt.namedAuthor", buildWikiPrompt(gf, subject, catalog, [], "Mason Thomas"));
  golden("wiki.resolveWikiLinks", resolveWikiLinks(gf, '<p><a href="PRODUCT:7">Roses</a> <a href="HOME">Great Flowers</a></p>', catalog, "https://greatflowers.net"));
  golden("wiki.buildWikiImagePrompt", buildWikiImagePrompt(gf, { title: "Roses", botanicalName: "Rosa", imageConcept: "A garden rose bloom beside an opening bud on linen." }));
  const draft = {
    id: "1f769b3f-21f6-4aa0-95b6-0c818b09c585", title: "Roses", slug: "roses", botanicalName: "Rosa", authorName: "Mason Thomas",
    description: "Roses are layered flowering plants.", metaTitle: "Roses: Meanings, Varieties and Care", metaDescription: "Learn about roses.",
    productIds: [7, 9], heroProductId: 7, imageConcept: "A rose.", html: '<h2>Overview</h2><p>Roses.</p><p><a href="https://greatflowers.net/product/rose-garden/">Rose Garden Bouquet</a></p><div class="blog-product-embed" data-product-id="7"></div>',
    status: "approved", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), attempts: 0, environment: "example.test",
  } as unknown as WikiDraft;
  golden("wiki.buildWikiPublishPayload.defaultBase", buildWikiPublishPayload(gf, draft, 42, 1, [catalog[0]!, catalog[2]!]));
  withEnv(t, { GF_STOREFRONT_URL: "https://store.example.test/" });
  golden("wiki.storefrontUrl.set", String(wikiStorefrontUrl(gf, "roses")));
  golden("wiki.buildWikiPublishPayload.envBase", buildWikiPublishPayload(gf, draft, 42, 0, [catalog[0]!]));
});

test("golden: article prompt, links and image prompt", (t) => {
  deterministic(t);
  withEnv(t, { GF_STOREFRONT_URL: undefined });
  golden("article.storefrontUrl.unset", String(articleStorefrontUrl(gf, "care-guide")));
  withEnv(t, { GF_STOREFRONT_URL: "https://store.example.test/" });
  golden("article.storefrontUrl.set", String(articleStorefrontUrl(gf, "care-guide")));
  golden("article.buildArticlePrompt", buildArticlePrompt({
    project: gf, topic: "Floral Design", direction: "texture and movement", format: "STYLE_PLAYBOOK", authorName: "Great Flowers Editorial Team",
    existingTitles: ["[article] How to Keep Cut Flowers Fresh"], products: catalog, related: [{ slug: "care-guide", title: "Care Guide" }],
  }));
  golden("article.resolveArticleLinks", resolveArticleLinks(gf, '<p><a href="PRODUCT:7">Roses</a> <a href="ARTICLE:care-guide">care</a> <a href="HOME">Great Flowers</a></p>', catalog, new Set(["care-guide"]), "https://greatflowers.net"));
  golden("article.buildArticleImagePrompt", buildArticleImagePrompt(gf, { title: "Styling Flowers With Texture", topic: "Floral Design", imageConcept: "A designer turns a vase toward window light." }));
});

test("golden: creative prompts and overlays", () => {
  for (const [sceneStrategy, creativeType, productRole] of SCENES) {
    const creative = variant({
      sceneStrategy, creativeType, productRole,
      ...(creativeType === "location" ? { locationContext: "Brooklyn brownstones" } : {}),
      ...(creativeType === "informational" ? { contentPoints: ["Trim stems at an angle", "Change water daily", "Keep away from heat"] } : {}),
    });
    golden(`codex.buildCodexPrompt.${sceneStrategy}`, buildCodexPrompt(gf, creative, brief(creative)));
  }
  golden("codex.buildWebsiteCta", buildWebsiteCta(gf, 1024, 1024).input.toString());
  golden("codex.buildLogoScrimSvg", buildLogoScrimSvg(418, 274, 0.45));
  for (const [side, vertical, tone, hue] of [["left", "top", "dark", null], ["right", "lower", "light", 280], ["left", "lower", "dark", 20]] as const) {
    golden(`creativeText.overlay.${side}-${vertical}-${tone}-${hue}`, buildCreativeTextOverlay(gf.visual, variant(), side, 1024, 1024, vertical, tone, hue).toString());
  }
  golden("creativeText.overlay.contentPoints", buildCreativeTextOverlay(gf.visual, variant({ creativeType: "informational", sceneStrategy: "INFORMATIONAL_GRAPHIC", contentPoints: ["Trim stems", "Fresh water", "Cool spot"] }), "left").toString());
  for (const order of [1, 2, 3, 4] as const) {
    const slide = storyPlan.slides[order - 1]!;
    golden(`story.buildStorySlidePrompt.${order}`, buildStorySlidePrompt(gf, slide as never, brief(variant()), storyPlan, []));
  }
  golden("story.buildStoryTextOverlay", buildStoryTextOverlay("A week worth celebrating", "Flowers for the new job").toString());
});

test("golden: Instagram caption and hashtags", () => {
  golden("meta.buildInstagramCaption", buildInstagramCaption("A bright bouquet for a bright week. #flowers", ["GreatFlowers", "BirthdayFlowers", "#Roses"]));
  golden("meta.formatHashtags", formatHashtags(["GreatFlowers", "Birthday Flowers", "roses"]));
});

test("golden: catalog products and website context requests", async (t) => {
  deterministic(t);
  const productCalls = captureFetch(t, () => new Response(JSON.stringify({
    current_page: 1, last_page: 1, total: 1,
    data: [{ id: 5, name: "Golden Bouquet", short_description: " Sunflowers ", price: "45.5", sale_price: null, stock_status: "in_stock", slug: "golden-bouquet", orders_count: 2, is_featured: 1, is_trending: 0, product_thumbnail: { asset_url: "https://example.test/golden.webp" }, categories: [{ id: 1, name: "Birthday", slug: "birthday" }] }],
  }), { status: 200 }));
  golden("catalog.products", { urls: productCalls.map((c) => c.url), products: await getCatalogProducts(gf) });
});

test("golden: website context requests", async (t) => {
  deterministic(t);
  const calls = captureFetch(t, () => new Response("<html><head><title>Great Flowers Home</title></head><body><p>Fresh&nbsp;flowers</p></body></html>", { status: 200 }));
  golden("website.context", { requests: calls.map((c) => ({ url: c.url, headers: c.headers })), pages: await getWebsiteContext(gf) });
});

test("golden: poster renders (PNG checksums)", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "golden-posters-"));
  try {
    const photo = await sharp({ create: { width: 1536, height: 1536, channels: 3, background: "#a389ad" } }).png().toBuffer();
    const logo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="190" height="76"><rect width="190" height="76" fill="#351E6A"/></svg>');
    const sums: Record<string, string> = {};
    for (const order of [1, 2, 3, 4]) {
      const output = path.join(directory, `${order}.png`);
      await renderPoster(photo, logo, { order, headline: "A Beautiful Way to Say Thanks", subheadline: "A thoughtful surprise for someone special.", contentPoints: order === 3 ? ["Choose their favorite colors.", "Add a personal message.", "Make an ordinary day special."] : [] }, output);
      sums[`poster-${order}`] = createHash("sha256").update(readFileSync(output)).digest("hex");
    }
    golden("poster.renders", sums);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("golden: authors and cron schedules", () => {
  golden("content.authors", { CONTENT_AUTHORS: contentAuthors(gf), DEFAULT_CONTENT_AUTHOR: defaultContentAuthor(gf) });
  const schedule = gf.schedule;
  golden("schedules", { WIKI_DRAFT_CRON: schedule.wikiDraftCron, WIKI_RECOVERY_CRONS: schedule.wikiRecoveryCrons, ARTICLE_DRAFT_CRON: schedule.articleDraftCron, ARTICLE_RECOVERY_CRON: schedule.articleRecoveryCron });
});

// Fixtures generated from pristine main (c5ead20): the JSON contracts sent to Hermes and the
// author lists accepted by draft edits.
test("golden: Hermes JSON contracts and edit authors", () => {
  golden("schemas.GeneratedPostJsonSchema", GeneratedPostJsonSchema);
  golden("schemas.GeneratedArticleJsonSchema", generatedArticleJsonSchema(gf));
  golden("schemas.GeneratedWikiJsonSchema", GeneratedWikiJsonSchema);
  const authors = ["Great Flowers Editorial Team", "Chloe Morgan", "One Price Flowers", "Unknown Writer"];
  golden("schemas.editAuthors", {
    blog: authors.map((authorName) => blogEditSchema(gf).safeParse({ authorName }).success),
    article: authors.map((authorName) => articleEditSchema(gf).safeParse({ authorName }).success),
  });
});
