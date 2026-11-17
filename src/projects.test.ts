// Multi-project safety tests: another brand's output must never contain GreatFlowers branding,
// brands must not share data, locks or storefront media, and requests must resolve the right brand.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import express from "express";

import { greatflowers, onepriceflowers, getProject, defaultProject, enabledProjects, liveContentUrl, storefrontBase, projectLockKey, type ProjectConfig } from "./projects/index.js";
import { projectContext, projectOf, PROJECT_HEADER } from "./projects/http.js";
import { s3Settings } from "./projects/storage.js";
import { autogenerateEnabled, isSafeMode } from "./projects/automation.js";
import { missingSettings } from "./projects/readiness.js";
import { draftSchedule } from "./projects/schedule.js";
import { ownedCampaignAsset } from "./campaign.assets.js";
import { buildPrompt, generateMarketingStrategy, generateStoryCreativePlan, type CampaignInput } from "./hermes.js";
import { generateCampaignRecommendation } from "./campaign.recommender.js";
import { createRotationPlan } from "./campaign.rotation.js";
import { buildBlogPrompt, resolveLinks, type CatalogProduct } from "./blog.generator.js";
import { buildHeroOverlaySvg } from "./blog.image.js";
import { buildWikiPrompt, resolveWikiLinks, WIKI_SUBJECTS } from "./wiki.generator.js";
import { buildWikiImagePrompt } from "./wiki.image.js";
import { buildWikiPublishPayload } from "./wiki.publisher.js";
import { buildArticlePrompt, resolveArticleLinks } from "./article.generator.js";
import { buildArticleImagePrompt } from "./article.image.js";
import { generatedArticleJsonSchema } from "./article.schema.js";
import { buildCodexPrompt, buildWebsiteCta, type CreativeBrief, type CreativeVariant } from "./codex.creative.js";
import { buildStorySlidePrompt } from "./codex.story.js";
import { buildCreativeTextOverlay } from "./creative.text.js";
import { posterPhotographyBrief } from "./creative.poster.js";
import { getCatalogProducts, type MarketingProduct } from "./catalog.products.js";
import { getWebsiteContext } from "./website.context.js";
import { tryAcquire } from "./ai.limits.js";
import { createGfClient } from "./gf.admin.client.js";
import type { StoryCreativePlan } from "./strategy.schema.js";
import type { WikiDraft } from "./wiki.schema.js";
import { marketingStrategySchema } from "./strategy.schema.js";
import { z } from "zod";

const opf = onepriceflowers;
// Brand names, palette hex codes and the description of the GreatFlowers wordmark.
const GREATFLOWERS_TEXT = /great\s*flowers|greatflowers|#701888|#db2173|#261943|indigo-to-magenta|dark plum/i;

function assertNoGreatFlowers(label: string, text: string) {
  const match = text.match(GREATFLOWERS_TEXT);
  assert.equal(match, null, `${label} leaks GreatFlowers branding: "${match?.[0]}" near "${match ? text.slice(Math.max(0, match.index! - 60), match.index! + 60) : ""}"`);
}

function captureFetch(t: TestContext, respond?: (url: string) => Response) {
  const calls: Array<{ url: string; body: string }> = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit = {}) => {
    calls.push({ url: String(url), body: typeof init.body === "string" ? init.body : "" });
    return respond ? respond(String(url)) : new Response("capture", { status: 500 });
  });
  for (const method of ["log", "warn", "error"] as const) t.mock.method(console, method, () => {});
  return calls;
}

function withEnv(t: TestContext, values: Record<string, string | undefined>) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) value === undefined ? delete process.env[key] : (process.env[key] = value);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : (process.env[key] = value);
  });
}

const catalog: CatalogProduct[] = [
  { id: 7, name: "Warm & Meaningful", slug: "warm-meaningful", price: 94.99, imageUrl: "https://oneflowers-prod.s3.us-east-1.amazonaws.com/public/1579/warm-meaningful.webp", description: "Warm roses with greenery." },
  { id: 8, name: "Lavender Medley", slug: "lavender-medley", price: 89.99, imageUrl: "https://example.test/l.webp", description: "Lavender blooms in a vase." },
  { id: 9, name: "Field Study", slug: "field-study", price: 74.99, imageUrl: "https://example.test/f.webp", description: "Mixed seasonal stems." },
  { id: 10, name: "Pink Poem", slug: "pink-poem", price: null, imageUrl: "https://example.test/p.webp", description: "" },
];
const products: MarketingProduct[] = [
  { id: 7, name: "Warm & Meaningful", description: "Warm roses", price: 94.99, salePrice: null, stockStatus: "in_stock", slug: "warm-meaningful", url: "https://www.onepriceflowers.com/product/warm-meaningful", image: "https://example.test/w.webp", categories: ["Birthday"], ordersCount: 1, featured: false, trending: false },
  { id: 8, name: "Lavender Medley", description: "Lavender", price: 89.99, salePrice: null, stockStatus: "in_stock", slug: "lavender-medley", url: "https://www.onepriceflowers.com/product/lavender-medley", image: "https://example.test/l.webp", categories: ["Gift"], ordersCount: 0, featured: true, trending: false },
];
const input: CampaignInput = {
  campaignGoal: "Generate orders", product: "Warm & Meaningful", occasion: "Birthday", contentTheme: "gifting-story",
  visualTreatment: "documentary-gifting", audience: "US gift buyers", trafficSource: "Organic Social", platforms: ["Instagram", "Facebook"], priority: "high",
};
const variant = (overrides: Partial<CreativeVariant> = {}): CreativeVariant => ({
  order: 1, creativeType: "lifestyle", sceneStrategy: "HUMAN_LIFESTYLE", concept: "A birthday moment", headline: "Bring the Blooms",
  subheadline: "A thoughtful surprise.", cta: "Shop flowers", visualDirection: "Warm", productRole: "supporting", occasionContext: "Birthday",
  colorPalette: "Warm", compositionStyle: "Off-center", lightingStyle: "Golden", sceneType: "Gifting", artDirection: "documentary-gifting",
  copyLayout: "top-left-editorial", environment: "living-room-seating", lightingSetup: "golden-hour", ...overrides,
});
const brief = (creative: CreativeVariant): CreativeBrief => ({
  headline: creative.headline, subheadline: creative.subheadline, cta: creative.cta, mood: "Warm", backgroundDirection: "Home",
  productTreatment: "Preserve", logoPlacement: "top-right", textPlacement: "top-left", creativeGoal: "Consideration", variants: [creative],
});

test("registry: GreatFlowers is the only default and One Price Flowers stays off until enabled", (t) => {
  assert.equal(defaultProject().id, "greatflowers");
  assert.equal(getProject("onepriceflowers"), opf);
  assert.equal(getProject("nope"), undefined);
  withEnv(t, { OPF_ENABLED: undefined });
  assert.deepEqual(enabledProjects().map((p) => p.id), ["greatflowers"]);
  process.env.OPF_ENABLED = "true";
  assert.deepEqual(enabledProjects().map((p) => p.id), ["greatflowers", "onepriceflowers"]);
});

test("env mapping: GreatFlowers keeps its names, One Price Flowers uses OPF_", () => {
  assert.equal(greatflowers.envName("GF_ADMIN_API_URL"), "GF_ADMIN_API_URL");
  assert.equal(greatflowers.envName("META_PAGE_ID"), "META_PAGE_ID");
  assert.equal(opf.envName("GF_ADMIN_API_URL"), "OPF_ADMIN_API_URL");
  assert.equal(opf.envName("GF_STOREFRONT_URL"), "OPF_STOREFRONT_URL");
  assert.equal(opf.envName("META_PAGE_ID"), "OPF_META_PAGE_ID");
  assert.equal(opf.envName("BLOG_PUBLISH_LIVE"), "OPF_BLOG_PUBLISH_LIVE");
  assert.equal(opf.envName("AWS_S3_BUCKET"), "OPF_AWS_S3_BUCKET");
});

test("storefront URLs use each brand's own paths", (t) => {
  withEnv(t, { OPF_STOREFRONT_URL: undefined, GF_STOREFRONT_URL: "https://greatflowers.net" });
  assert.equal(storefrontBase(opf), "https://www.onepriceflowers.com");
  assert.equal(liveContentUrl(opf, "wiki", "roses"), undefined, "no live URL until the OPF storefront URL is configured");
  process.env.OPF_STOREFRONT_URL = "https://www.onepriceflowers.com/";
  assert.equal(liveContentUrl(opf, "wiki", "roses"), "https://www.onepriceflowers.com/guides/roses/");
  assert.equal(liveContentUrl(opf, "article", "care"), "https://www.onepriceflowers.com/articles/care/");
  assert.equal(liveContentUrl(opf, "blog", "gifts"), "https://www.onepriceflowers.com/blogs/gifts/");
  assert.equal(liveContentUrl(greatflowers, "wiki", "roses"), "https://greatflowers.net/greatflowers-wiki/roses/");
});

test("brand leak: no One Price Flowers prompt, overlay or payload contains GreatFlowers branding", async (t) => {
  const outputs: Record<string, string> = {};
  outputs.strategyPrompt = buildPrompt(opf, input);
  outputs.blogPrompt = buildBlogPrompt({ project: opf, today: "2026-11-16", existingTitles: [], existingSlugs: [], categories: [{ slug: "gift", name: "Gift" }], products: catalog, related: [], recentHeroConcepts: [], requiredFormat: "CURATED_LIST" });
  outputs.blogLinks = resolveLinks('<a href="PRODUCT:7">x</a><a href="BLOG:gifts">y</a><a href="HOME">z</a>', { project: opf, productSlugs: new Map([[7, "warm-meaningful"]]), blogSlugs: new Set(["gifts"]), base: storefrontBase(opf) });
  outputs.heroOverlay = buildHeroOverlaySvg(opf, "Birthday Flowers With One Clear Price").toString();
  outputs.wikiPrompt = buildWikiPrompt(opf, WIKI_SUBJECTS[0]!, catalog, []);
  outputs.wikiLinks = resolveWikiLinks(opf, '<a href="PRODUCT:7">x</a><a href="HOME">y</a>', catalog, storefrontBase(opf));
  outputs.wikiImage = buildWikiImagePrompt(opf, { title: "Roses", botanicalName: "Rosa", imageConcept: "A rose." });
  const draft = { id: "1", title: "Roses", slug: "roses", botanicalName: "Rosa", authorName: "One Price Flowers Editorial Team", description: "d", metaTitle: "m", metaDescription: "m", productIds: [7], heroProductId: 7, imageConcept: "c", html: "<p>Roses</p>", status: "approved", createdAt: "", updatedAt: "", attempts: 0, environment: "x" } as unknown as WikiDraft;
  outputs.wikiPayload = JSON.stringify(buildWikiPublishPayload(opf, draft, 1, 1, [catalog[0]!]));
  outputs.articlePrompt = buildArticlePrompt({ project: opf, topic: "Flower Care", direction: "routines", format: "HOW_TO", authorName: "One Price Flowers Editorial Team", existingTitles: [], products: catalog, related: [] });
  outputs.articleLinks = resolveArticleLinks(opf, '<a href="PRODUCT:7">x</a><a href="ARTICLE:care">y</a><a href="HOME">z</a>', catalog, new Set(["care"]), storefrontBase(opf));
  outputs.articleImage = buildArticleImagePrompt(opf, { title: "Care", topic: "Flower Care", imageConcept: "A vase." });
  outputs.articleContract = JSON.stringify(generatedArticleJsonSchema(opf));
  for (const sceneStrategy of ["PRODUCT_STUDIO", "BRAND_STORY", "FEATURE_DEMO"] as const) {
    outputs[`codex.${sceneStrategy}`] = buildCodexPrompt(opf, variant({ sceneStrategy }), brief(variant({ sceneStrategy })));
  }
  outputs.websiteCta = buildWebsiteCta(opf, 1024, 1024).input.toString();
  for (const order of [1, 3, 4]) {
    outputs[`posterBrief.${order}`] = posterPhotographyBrief(opf, { order, headline: "One Clear Price", subheadline: "Flowers for every moment.", contentPoints: order === 3 ? ["Trim stems", "Fresh water"] : [] });
  }
  outputs.textOverlay = buildCreativeTextOverlay(opf.visual, variant({ cta: "Shop Now" }), "left").toString();
  outputs.textOverlayLight = buildCreativeTextOverlay(opf.visual, variant(), "left", 1024, 1024, "top", "light", 280).toString();
  const plan = { carouselConcept: "c", revealSlide: 3, giftingRelationship: { sender: "a", recipient: "b", relationship: "friends", reason: "r", pointOfView: "recipient" },
    slides: [1, 2, 3, 4].map((order) => ({ ...variant({ order }), productRole: order < 3 ? "none" : "supporting", cta: "", storyRole: "r", storyBeat: "b", brandRole: order < 3 ? "none" : "reveal", sceneChange: "s", cameraDirection: "c" })) } as unknown as StoryCreativePlan;
  for (const order of [1, 3, 4]) outputs[`story.${order}`] = buildStorySlidePrompt(opf, plan.slides[order - 1] as never, brief(variant()), plan, []);
  outputs.rotation = [0.01, 0.3, 0.5, 0.7, 0.99].map((r) => createRotationPlan(opf, products, [], [], new Date("2026-07-20"), () => r).guidance).join("\n");

  withEnv(t, { HERMES_API_KEY: "test", HERMES_API_URL: "http://hermes.test" });
  const calls = captureFetch(t);
  await generateMarketingStrategy(opf, input).catch(() => undefined);
  await generateStoryCreativePlan(opf, input, { id: 7 }, {}).catch(() => undefined);
  await generateCampaignRecommendation(opf, products, [{ url: "https://www.onepriceflowers.com/", title: "One Price Flowers", text: "One price." }], [], [], undefined, createRotationPlan(opf, products, [], [], new Date("2026-07-20"), () => 0.4)).catch(() => undefined);
  calls.forEach((call, index) => { outputs[`hermesRequest.${index}`] = call.body; });
  assert.equal(calls.length, 3);

  for (const [label, text] of Object.entries(outputs)) assertNoGreatFlowers(label, text);

  // And the One Price Flowers specifics are actually present.
  assert.match(outputs["hermesRequest.0"]!, /Use the onepriceflowers-marketing-strategist skill/);
  assert.match(outputs["hermesRequest.1"]!, /Use the onepriceflowers-marketing-strategist skill/);
  assert.match(outputs.strategyPrompt!, /Always include \\?"OnePriceFlowers\\?" as one of the hashtags/);
  assert.match(outputs.strategyPrompt!, /logo-green\.svg/);
  for (const key of ["strategyPrompt", "blogPrompt", "wikiPrompt", "articlePrompt", "hermesRequest.1", "hermesRequest.2"]) {
    assert.match(outputs[key]!, /NEVER say that every bouquet costs the same/, `${key} lacks the one-price rules`);
  }
  assert.match(outputs.wikiLinks!, /onepriceflowers\.com\/product\/warm-meaningful\//);
  assert.match(outputs.articleLinks!, /onepriceflowers\.com\/articles\/care\//);
  assert.match(outputs.blogLinks!, /onepriceflowers\.com\/blogs\/gifts\//);
  assert.match(outputs.wikiPayload!, /Same-Day in Most Areas/);
  assert.match(outputs.heroOverlay!, /ONE PRICE FLOWERS JOURNAL/);
  assert.match(outputs.websiteCta!, /www\.onepriceflowers\.com/);
  assert.match(outputs["posterBrief.4"]!, /website line: "www\.onepriceflowers\.com"/);
  assert.match(outputs["posterBrief.1"]!, /deep forest green or warm white lettering/);
  assert.match(outputs["codex.BRAND_STORY"]!, /The wordmark is a solid dark forest green that only reads/);
  assert.match(outputs.articleContract!, /"One Price Flowers Editorial Team"/);
  assert.match(outputs.textOverlay!, /fill="#154233"/, "CTA pill uses the One Price Flowers button colour");
});

test("catalog and website context use the brand's own API, storefront and user agent", async (t) => {
  const calls = captureFetch(t, (url) => url.includes("/api/product")
    ? new Response(JSON.stringify({ current_page: 1, last_page: 1, total: 1, data: [{ id: 187, name: "Warm & Meaningful", slug: "warm-meaningful", stock_status: "in_stock", price: 94.99 }] }), { status: 200 })
    : new Response("<title>One Price Flowers</title>", { status: 200 }));
  const [product] = await getCatalogProducts(opf);
  assert.equal(calls[0]!.url, "https://api.onepriceflowers.com/api/product?page=1");
  assert.equal(product!.url, "https://www.onepriceflowers.com/product/warm-meaningful");
  await getWebsiteContext(opf);
  assert.deepEqual(calls.slice(1).map((c) => c.url), [...opf.storefront.websiteContextPages]);
});

test("S3: a One Price Flowers campaign delete can never reach storefront product photos", (t) => {
  withEnv(t, { OPF_AWS_S3_BUCKET: "oneflowers-prod", OPF_AWS_REGION: "us-east-1", OPF_AWS_S3_CREATIVE_PREFIX: undefined, OPF_AWS_S3_CAMPAIGN_PREFIX: undefined });
  const base = "https://oneflowers-prod.s3.us-east-1.amazonaws.com";
  assert.deepEqual(s3Settings(opf).creativePrefix, "marketing/campaign");
  assert.deepEqual(ownedCampaignAsset(opf, `${base}/marketing/campaign/abc.png`), { key: "marketing/campaign/abc.png" });
  assert.equal(ownedCampaignAsset(opf, `${base}/public/1579/warm-meaningful.webp`), null, "storefront product photos are never owned");
  assert.equal(ownedCampaignAsset(opf, `${base}/campaign/abc.png`), null);
  assert.equal(ownedCampaignAsset(opf, "https://greatflowers-bucket.s3.us-west-2.amazonaws.com/marketing/campaign/abc.png"), null, "another bucket is never owned");
  process.env.OPF_AWS_S3_CREATIVE_PREFIX = "public/marketing";
  assert.throws(() => s3Settings(opf), /Unsafe S3 marketing prefix/);
  process.env.OPF_AWS_S3_CREATIVE_PREFIX = "/";
  assert.throws(() => s3Settings(opf), /Unsafe S3 marketing prefix/);
});

test("data isolation: One Price Flowers drafts and campaigns live in their own folder", async () => {
  const originalCwd = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), "multi-project-"));
  try {
    process.chdir(directory);
    const { addBlogDraft, getBlogDrafts } = await import("./blog.store.js");
    const { saveCampaign, getCampaigns } = await import("./campaign.store.js");
    const draft = { topic: "t", title: "Gifts", slug: "gifts", metaTitle: "m", metaDescription: "m", summary: "s", categorySlug: "gift", productIds: [7], heroProductId: 7,
      heroStrategy: "HUMAN_GIFTING_MOMENT", heroProductRole: "supporting", heroConcept: "c", contentFormat: "CURATED_LIST", html: "<p>x</p>", environment: "api.onepriceflowers.com" } as const;
    await addBlogDraft(opf, draft as never);
    await saveCampaign(opf, input, {} as never);
    assert.equal((await getBlogDrafts(opf)).length, 1);
    assert.equal((await getBlogDrafts(greatflowers)).length, 0);
    assert.equal((await getCampaigns(greatflowers)).length, 0);
    assert.ok(existsSync(path.join(directory, "data/projects/onepriceflowers/blogs.json")));
    assert.ok(existsSync(path.join(directory, "data/projects/onepriceflowers/campaigns.json")));
    assert.equal(existsSync(path.join(directory, "data/blogs.json")), false, "GreatFlowers' file was not touched");
    assert.equal(JSON.parse(await readFile(path.join(directory, "data/campaigns.json"), "utf8")).length, 0);
  } finally {
    process.chdir(originalCwd);
    await rm(directory, { recursive: true, force: true });
  }
});

test("locks: AI jobs are single-flight per project, Codex stays global", () => {
  const gfBlog = tryAcquire(projectLockKey(greatflowers, "blog"));
  const opfBlog = tryAcquire(projectLockKey(opf, "blog"));
  assert.ok(gfBlog && opfBlog, "two brands can write blogs at the same time");
  assert.equal(tryAcquire(projectLockKey(greatflowers, "blog")), null, "but one brand cannot run two");
  gfBlog(); opfBlog();
  const codex = tryAcquire("codex");
  assert.ok(codex);
  assert.equal(tryAcquire("codex"), null, "image generation is shared by every brand");
  codex();
});

test("schedules: One Price Flowers content jobs finish before GreatFlowers' evening window", () => {
  const hours = (expression: string) => expression.split(" ")[1]!.split(/[,]/).flatMap((part) => {
    const [from, to] = part.split("-").map(Number);
    return to === undefined ? [from!] : Array.from({ length: to - from! + 1 }, (_, i) => from! + i);
  });
  const { blogDraftCron, wikiDraftCron, wikiRecoveryCrons, articleDraftCron, articleRecoveryCron, timezone } = opf.schedule;
  assert.equal(timezone, greatflowers.schedule.timezone);
  for (const expression of [blogDraftCron, wikiDraftCron, ...wikiRecoveryCrons, articleDraftCron, articleRecoveryCron]) {
    assert.ok(hours(expression).every((hour) => hour < 18), `${expression} overlaps GreatFlowers' 18:00-23:30 window`);
  }
});

test("requests resolve their project; unknown or disabled projects are refused", async (t) => {
  withEnv(t, { OPF_ENABLED: undefined });
  const app = express();
  app.use("/api", projectContext);
  app.get("/api/which", (_req, res) => { res.json({ id: projectOf(res).id }); });
  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const get = async (pathname: string, headers: Record<string, string> = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { headers });
    return { status: response.status, body: await response.json() as { id?: string } };
  };
  assert.deepEqual(await get("/api/which"), { status: 200, body: { id: "greatflowers" } }, "no header keeps today's behaviour");
  assert.equal((await get("/api/which", { [PROJECT_HEADER]: "onepriceflowers" })).status, 404, "disabled until OPF_ENABLED=true");
  assert.equal((await get("/api/which?project=nope")).status, 404);
  process.env.OPF_ENABLED = "true";
  assert.deepEqual((await get("/api/which", { [PROJECT_HEADER]: "onepriceflowers" })).body, { id: "onepriceflowers" });
  assert.deepEqual((await get("/api/which?project=onepriceflowers")).body, { id: "onepriceflowers" });
});

// Compile-time reminder: every brand must define the full config.
const _everyProjectIsComplete: ProjectConfig[] = [greatflowers, onepriceflowers];
void _everyProjectIsComplete;

test("strategy repair messages name the request's own brand", async (t) => {
  withEnv(t, { HERMES_API_KEY: "test", HERMES_API_URL: "http://hermes.test" });
  for (const method of ["log", "warn", "error"] as const) t.mock.method(console, method, () => {});
  // Force the one schema rule whose message names GreatFlowers.
  const rule = "Independent GreatFlowers creatives must always show flowers; use productRole optional when the catalog product is not referenced";
  t.mock.method(marketingStrategySchema, "parse", () => {
    throw new z.ZodError([{ code: "custom", path: ["creativeBrief", "variants"], message: rule, input: undefined }]);
  });
  const repairRequest = async (project: ProjectConfig) => {
    const bodies: string[] = [];
    t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit = {}) => {
      bodies.push(String(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
    });
    await assert.rejects(() => generateMarketingStrategy(project, input));
    return bodies[1] ?? "";
  };
  const opfRepair = await repairRequest(opf);
  assert.match(opfRepair, /Independent One Price Flowers creatives must always show flowers/);
  assertNoGreatFlowers("strategy repair request", opfRepair.replace(/greatflowers-[a-z-]+/g, ""));
  assert.match(await repairRequest(greatflowers), /Independent GreatFlowers creatives must always show flowers/, "GreatFlowers' message is unchanged");
});

test("automation: GreatFlowers keeps its default, new brands start with timed drafts off", (t) => {
  withEnv(t, { BLOG_AUTOGENERATE: undefined, OPF_BLOG_AUTOGENERATE: undefined, OPF_WIKI_AUTOGENERATE: undefined, OPF_ARTICLE_AUTOGENERATE: undefined, OPF_BLOG_PUBLISH_LIVE: undefined, OPF_WIKI_PUBLISH_LIVE: undefined, OPF_ARTICLE_PUBLISH_LIVE: undefined });
  // GreatFlowers: only "false" ever disabled it, exactly as before.
  for (const [value, expected] of [[undefined, true], ["false", false], ["true", true], ["yes", true], ["", true]] as const) {
    value === undefined ? delete process.env.BLOG_AUTOGENERATE : (process.env.BLOG_AUTOGENERATE = value);
    assert.equal(autogenerateEnabled(greatflowers, "BLOG"), expected, `BLOG_AUTOGENERATE=${value}`);
  }
  // One Price Flowers: off unless explicitly "true".
  assert.equal(autogenerateEnabled(opf, "BLOG"), false);
  assert.equal(isSafeMode(opf), true, "enabling the brand alone is safe");
  process.env.OPF_BLOG_AUTOGENERATE = "true";
  assert.equal(autogenerateEnabled(opf, "BLOG"), true);
  assert.equal(isSafeMode(opf), false);
});

test("readiness: missing settings are reported by the project's own variable names", (t) => {
  withEnv(t, { OPF_ADMIN_API_URL: "https://api.example.test/api", OPF_ADMIN_EMAIL: undefined, OPF_ADMIN_PASSWORD: " " });
  const missing = missingSettings(opf).map((item) => item.variable);
  assert.ok(!missing.includes("OPF_ADMIN_API_URL"));
  assert.ok(missing.includes("OPF_ADMIN_EMAIL"));
  assert.ok(missing.includes("OPF_ADMIN_PASSWORD"), "a blank value counts as missing");
  assert.ok(missing.every((name) => name.startsWith("OPF_")));
});

test("admin API: GreatFlowers requests are unchanged; One Price Flowers pages at 100", async (t) => {
  withEnv(t, { GF_ADMIN_API_URL: "https://gf.test/api/admin", GF_ADMIN_EMAIL: "a@b.c", GF_ADMIN_PASSWORD: "x", OPF_ADMIN_API_URL: "https://opf.test/api/admin", OPF_ADMIN_EMAIL: "a@b.c", OPF_ADMIN_PASSWORD: "x" });
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    const u = new URL(String(url));
    urls.push(`${u.host}${u.pathname}${u.search}`);
    const page = Number(u.searchParams.get("page") ?? 1);
    const size = Number(u.searchParams.get("paginate") ?? 0);
    // 250 categories on the server, served in pages of the requested size.
    const total = u.pathname.endsWith("/category") ? 250 : 3;
    const data = Array.from({ length: Math.max(0, Math.min(size || total, total - (page - 1) * (size || total))) }, (_, i) => ({ id: (page - 1) * size + i + 1 }));
    return new Response(JSON.stringify({ data, current_page: page, last_page: size ? Math.ceil(total / size) : 1, total }), { status: 200 });
  });
  const gfClient = createGfClient(greatflowers, "token");
  await gfClient.listBlogs(); await gfClient.listWikis(); await gfClient.listArticles();
  const gfCategories = await gfClient.listBlogCategories();
  await gfClient.searchProducts("", 100);
  assert.deepEqual(urls.splice(0), [
    "gf.test/api/admin/blog?paginate=500",
    "gf.test/api/admin/wiki?paginate=500",
    "gf.test/api/admin/article?paginate=500",
    "gf.test/api/admin/category?type=post&paginate=200",
    "gf.test/api/admin/product?status=1&is_approved=1&paginate=100",
  ], "GreatFlowers sends exactly the requests it always has");
  assert.equal(gfCategories.length, 200);
  const opfCategories = await createGfClient(opf, "token").listBlogCategories();
  assert.deepEqual(urls, [
    "opf.test/api/admin/category?type=post&paginate=100&page=1",
    "opf.test/api/admin/category?type=post&paginate=100&page=2",
  ]);
  assert.equal(opfCategories.length, 200, "same number of rows as one large request would return");
});

test("queue pages describe each brand's own draft schedule, read from its crons", (t) => {
  for (const name of ["BLOG_AUTOGENERATE", "WIKI_AUTOGENERATE", "ARTICLE_AUTOGENERATE", "OPF_BLOG_AUTOGENERATE", "OPF_WIKI_AUTOGENERATE", "OPF_ARTICLE_AUTOGENERATE"]) {
    const previous = process.env[name];
    delete process.env[name];
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
  // GreatFlowers: exactly the times its queue pages always showed.
  assert.deepEqual(draftSchedule(greatflowers, "BLOG"), { autogenerate: true, days: "Monday, Wednesday and Friday", time: "6:00 PM IST" });
  assert.deepEqual(draftSchedule(greatflowers, "WIKI"), { autogenerate: true, days: "Tuesday, Thursday and Saturday", time: "7:00 PM IST", retryPeriod: "evening" });
  assert.deepEqual(draftSchedule(greatflowers, "ARTICLE"), { autogenerate: true, days: "Sunday", time: "6:30 PM IST", retryPeriod: "evening" });
  // One Price Flowers runs earlier in the day (it shares the image generator) and starts with timed drafts off.
  assert.deepEqual(draftSchedule(onepriceflowers, "BLOG"), { autogenerate: false, days: "Monday, Wednesday and Friday", time: "2:00 PM IST" });
  assert.deepEqual(draftSchedule(onepriceflowers, "WIKI"), { autogenerate: false, days: "Tuesday, Thursday and Saturday", time: "2:30 PM IST", retryPeriod: "afternoon" });
  assert.deepEqual(draftSchedule(onepriceflowers, "ARTICLE"), { autogenerate: false, days: "Sunday", time: "2:00 PM IST", retryPeriod: "afternoon" });
  process.env.OPF_WIKI_AUTOGENERATE = "true";
  assert.equal(draftSchedule(onepriceflowers, "WIKI").autogenerate, true);
});
