import assert from "node:assert/strict";
import test from "node:test";
import { generateCampaignRecommendation } from "./campaign.recommender.js";
import { createRotationPlan } from "./campaign.rotation.js";
import type { MarketingProduct } from "./greatflowers.products.js";
import type { WebsitePageContext } from "./website.context.js";

test("recommendation preserves evidence inputs and rejects outputs that bypass rotation", async (t) => {
  const products = [{ id: 1, name: "Catalog bouquet", stockStatus: "in_stock", image: "https://example.com/flower.jpg", description: "Verified catalog description", categories: ["Flowers"], price: 40, url: "https://greatflowers.net/flowers" }] as MarketingProduct[];
  const rotation = createRotationPlan(products, [{ creativeScenario: "Already used scene" }], [{ marketingAngle: "Previously published angle" }], new Date(2026, 8, 28), () => 0.3);
  const output = {
    contentTheme: rotation.contentTheme, visualTreatment: rotation.visualTreatment,
    selectedProductId: 1, selectedProductName: "Catalog bouquet", occasion: "Home styling",
    creativeScenario: "Flowers beside the reading chair", audience: "US", campaignGoal: rotation.campaignGoal,
    trafficSource: "Organic Social", platforms: ["Instagram", "Facebook"], priority: rotation.priority,
    reasonForSelection: "Verified catalog description", customerIntent: "Style a reading corner", marketingAngle: "A reading corner refresh",
    decisionSummary: "A reading corner refresh is worth testing", websiteEvidence: ["Website context"], catalogEvidence: ["Catalog evidence"], analyticsEvidence: ["Limited data"], rotationEvidence: ["A fresh theme"], assumptions: ["Worth testing"], additionalContext: "",
  };
  let prompt = "";
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    prompt = JSON.parse(String(init.body)).messages[1].content;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 });
  });
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  t.mock.method(console, "warn", () => {});
  const oldKey = process.env.HERMES_API_KEY;
  process.env.HERMES_API_KEY = "test-only";
  t.after(() => { if (oldKey === undefined) delete process.env.HERMES_API_KEY; else process.env.HERMES_API_KEY = oldKey; });
  const run = () => generateCampaignRecommendation(products, [{ url: "https://greatflowers.net", title: "GreatFlowers", text: "Verified website message" }] as WebsitePageContext[], [], [{ itemId: "1", itemName: "Catalog bouquet", views: 3, addToCarts: 1, checkouts: 0, purchases: 0 }], undefined, rotation);
  const result = await run();
  assert.equal(result.contentTheme, rotation.contentTheme);
  for (const evidence of ["Verified website message", "Verified catalog description", '"views":3', '"addToCarts":1', "CURRENT OCCASION CALENDAR", "Already used scene", "Previously published angle"]) assert.ok(prompt.includes(evidence), evidence);
  output.selectedProductId = 999;
  await assert.rejects(run, /eligible catalog product/);
  output.selectedProductId = 1;
  output.creativeScenario = "Already used scene!";
  await assert.rejects(run, /repeated a recent creative scenario/);
  output.creativeScenario = "A fresh scene";
  output.contentTheme = "gifting-story";
  await assert.rejects(run, /selected content rotation/);
});
