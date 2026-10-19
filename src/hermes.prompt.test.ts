import assert from "node:assert/strict";
import test from "node:test";
import { buildPrompt, type CampaignInput } from "./hermes.js";

test("campaign strategy prompt forbids unexplained prop metaphors", () => {
  const input: CampaignInput = {
    campaignGoal: "Build consideration",
    product: "Petals of Grace",
    audience: "US flower shoppers",
    trafficSource: "Organic Social",
    platforms: ["Instagram", "Facebook"],
    priority: "medium",
  };
  const prompt = buildPrompt(input);

  assert.match(prompt, /must make immediate sense on first read/);
  assert.match(prompt, /Physical props such as pens, keys, cards, desks, mugs and tools/);
  assert.match(prompt, /The review is over\. The red pen isn't\./);
  assert.match(prompt, /For the person who made your work better\./);
  assert.match(prompt, /Never refer to a pen, key, desk or another prop as a substitute for the person/);
  assert.match(prompt, /45-110 words/);
  assert.match(prompt, /6-10 focused hashtags/);
  assert.match(prompt, /must not contain hashtags/);
  assert.match(prompt, /Never invent names, ages, cities, exact timelines/);
  assert.match(prompt, /headline of at most 6 words/);
  assert.match(prompt, /Exactly two variants must use "hero" or "supporting"/);
  assert.match(prompt, /Do not use productRole "none" in independent mode/);
  assert.match(prompt, /Every independent visual must unmistakably market flowers/);
  assert.match(prompt, /props remain secondary atmosphere rather than the subject/);
  assert.match(prompt, /include at least one gentle purchase or product-discovery action/);
});
