import assert from "node:assert/strict";
import test from "node:test";
import { CONTENT_THEMES, createRotationPlan, publishedRotationHistory, type RotationEntry } from "./campaign.rotation.js";
import { getActiveOccasions } from "./occasion.calendar.js";
import type { MarketingProduct } from "./greatflowers.products.js";
import type { SavedCampaign } from "./campaign.store.js";

const product = (id: number, overrides = {}): MarketingProduct => ({ id, name: `Bouquet ${id}`, description: "Fresh arrangement", price: 40, salePrice: null, stockStatus: "in_stock", slug: `bouquet-${id}`, url: `https://greatflowers.net/${id}`, image: `https://example.com/${id}.jpg`, categories: [], ordersCount: 0, featured: false, trending: false, ...overrides });
const quietDay = new Date(2026, 8, 28, 12);
const catalog = [1, 2, 3, 4, 5, 6, 7].map(id => product(id));

test("recommendations and published posts both enforce theme, visual and product cooldowns", () => {
  const recent = [{ contentTheme: "gifting-story", visualTreatment: "bouquet-detail", productId: 1 }, { contentTheme: "home-styling", productId: 2 }];
  const published = [{ contentTheme: "flower-care", visualTreatment: "room-setting", productId: 3 }, { contentTheme: "product-spotlight", productId: 4 }];
  for (const random of [0, 0.2, 0.5, 0.999]) {
    const plan = createRotationPlan(catalog, recent, published, quietDay, () => random);
    assert.ok(!["gifting-story", "home-styling", "flower-care", "product-spotlight"].includes(plan.contentTheme));
    assert.ok(!["bouquet-detail", "room-setting"].includes(plan.visualTreatment));
    assert.deepEqual(plan.candidates.map(p => p.id), [5, 6, 7]);
  }
});

test("small catalogs relax product cooldown but never admit unavailable products", () => {
  const plan = createRotationPlan([product(1), product(2, { stockStatus: "out_of_stock" }), product(3, { image: null })], [{ productId: 1 }], [], quietDay, () => 0);
  assert.deepEqual(plan.candidates.map(p => p.id), [1]);
  assert.equal(plan.productCooldownRelaxed, true);
  assert.throws(() => createRotationPlan([product(2, { image: null })], [], []), /No in-stock products/);
});

test("legacy history and repeated clicks continue rotating without starving themes", () => {
  const history: RotationEntry[] = [{ productId: 1, occasion: "Birthday" }];
  const seen = new Set<string>();
  let seed = 42;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 60; i++) {
    const plan = createRotationPlan(catalog, history.slice(0, 20), [], quietDay, random);
    assert.notEqual(plan.contentTheme, history[0]?.contentTheme);
    assert.notEqual(plan.contentTheme, history[1]?.contentTheme);
    assert.notEqual(plan.visualTreatment, history[0]?.visualTreatment);
    seen.add(plan.contentTheme);
    history.unshift({ contentTheme: plan.contentTheme, visualTreatment: plan.visualTreatment, productId: plan.candidates[0]!.id });
  }
  assert.equal(seen.size, CONTENT_THEMES.length);
});

test("every content theme is used before any theme repeats", () => {
  const history: RotationEntry[] = [];
  const firstCycle: string[] = [];
  const secondCycle: string[] = [];
  let seed = 17;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };

  for (let index = 0; index < CONTENT_THEMES.length * 2; index++) {
    const plan = createRotationPlan(catalog, history, [], quietDay, random);
    (index < CONTENT_THEMES.length ? firstCycle : secondCycle).push(plan.contentTheme);
    history.unshift({ contentTheme: plan.contentTheme, visualTreatment: plan.visualTreatment });
  }

  assert.equal(new Set(firstCycle).size, CONTENT_THEMES.length);
  assert.equal(new Set(secondCycle).size, CONTENT_THEMES.length);
  assert.notEqual(secondCycle[0], firstCycle.at(-1));
});

test("important holidays increase seasonal selection while preserving theme cooldowns", () => {
  const holiday = new Date(2026, 1, 10, 12);
  let quietCount = 0, holidayCount = 0;
  for (let i = 0; i < 100; i++) {
    const random = () => i / 100;
    const quiet = createRotationPlan(catalog, [], [], quietDay, random);
    const peak = createRotationPlan(catalog, [], [], holiday, random);
    if (["gifting-story", "seasonal-inspiration"].includes(quiet.contentTheme)) quietCount++;
    if (["gifting-story", "seasonal-inspiration"].includes(peak.contentTheme)) holidayCount++;
  }
  assert.ok(holidayCount > quietCount);
  const plan = createRotationPlan(catalog, [{ contentTheme: "seasonal-inspiration", productId: 1 }], [], holiday, () => 0.9);
  assert.notEqual(plan.contentTheme, "seasonal-inspiration");
  assert.ok(plan.candidates.some(p => p.id === 1), "retain products for seasonal fit");
});

test("named-date holidays remain available to seasonal guidance", () => {
  assert.ok(getActiveOccasions(new Date(2026, 4, 5, 12)).seasonal.some(o => o.name === "Mother's Day" && o.date === "2026-05-10"));
  assert.ok(getActiveOccasions(new Date(2026, 10, 20, 12)).seasonal.some(o => o.name === "Thanksgiving" && o.date === "2026-11-26"));
});

test("published history includes recurring and partial publications, excludes drafts, sorts by publication", () => {
  const campaign = (id: string, overrides = {}): SavedCampaign => ({
    id, input: { product: `Bouquet ${id}`, campaignGoal: "Awareness", audience: "US", trafficSource: "Organic Social", priority: "Awareness", platforms: ["Instagram"], contentTheme: "home-styling", creativeScenario: "A welcoming entryway" },
    strategy: { marketingAngle: "Freshen the entryway", creativeBrief: { backgroundDirection: "A bright entryway" } } as SavedCampaign["strategy"],
    status: "draft", createdAt: "2026-09-01", updatedAt: "2026-09-01", ...overrides,
  });
  const history = publishedRotationHistory([
    campaign("draft"),
    campaign("recurring", { publishStatus: "scheduled", publishedAt: "2026-09-20" }),
    campaign("partial", { publishStatus: "failed", publishedPlatforms: ["facebook"], publishedAt: "2026-09-22" }),
  ]);
  assert.deepEqual(history.map(h => h.productName), ["Bouquet partial", "Bouquet recurring"]);
  assert.equal(history[0]?.contentTheme, "home-styling");
  assert.equal(history[0]?.creativeScenario, "A welcoming entryway");
  assert.equal(history[0]?.visualDirection, "A bright entryway");
});
