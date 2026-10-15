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
});
