import assert from "node:assert/strict";
import test from "node:test";
import { creativeBriefSchema } from "./strategy.schema.js";

const scenes = ["PRODUCT_STUDIO", "HUMAN_GIFTING_MOMENT", "EDITORIAL_CONTENT", "OCCASION_SCENE"] as const;
const roles = ["hero", "supporting", "none", "optional"] as const;
const types = ["product", "lifestyle", "informational", "occasion"] as const;

const variant = (order: number) => ({
  order,
  creativeType: types[order - 1],
  sceneStrategy: scenes[order - 1],
  concept: `Distinct marketing concept ${order}`,
  headline: `Distinct headline ${order}`,
  subheadline: "Clear supporting copy.",
  cta: "Shop flowers",
  visualDirection: `Visual direction ${order}`,
  productRole: roles[order - 1],
  occasionContext: "Birthday",
  colorPalette: `Palette ${order}`,
  compositionStyle: `Composition ${order}`,
  lightingStyle: `Lighting ${order}`,
  sceneType: `Scene ${order}`,
});

const base = {
  creativeMode: "independent" as const,
  headline: "Campaign headline",
  subheadline: "Campaign support",
  cta: "Shop flowers",
  mood: "Warm",
  backgroundDirection: "Varied environments",
  productTreatment: "Preserve the real product",
  logoPlacement: "top-right",
  textPlacement: "top-left",
  creativeGoal: "Drive discovery",
};

test("independent campaigns require four genuinely varied creative directions", () => {
  const variants = [1, 2, 3, 4].map(variant);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants }).success, true);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.slice(0, 3) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map(v => ({ ...v, sceneStrategy: "PRODUCT_STUDIO" })) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map(v => ({ ...v, compositionStyle: "Same composition", sceneType: "Same scene" })) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map(v => ({ ...v, productRole: "hero" })) }).success, false);
});
