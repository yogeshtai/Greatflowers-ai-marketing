import assert from "node:assert/strict";
import test from "node:test";
import { creativeBriefSchema, SCENE_STRATEGIES } from "./strategy.schema.js";
import { ART_DIRECTIONS, PREFERRED_ART_DIRECTIONS, fallbackArtDirection } from "./creative.direction.js";

const scenes = ["PRODUCT_STUDIO", "HUMAN_GIFTING_MOMENT", "EDITORIAL_CONTENT", "OCCASION_SCENE"] as const;
const roles = ["hero", "supporting", "optional", "optional"] as const;
const types = ["product", "lifestyle", "informational", "occasion"] as const;
const artDirections = ["sculptural-studio", "documentary-gifting", "flower-care-demonstration", "seasonal-cinematic"] as const;
const copyLayouts = ["top-left-editorial", "lower-right-caption", "full-bleed-left-gradient", "top-right-editorial"] as const;
const environments = ["dining-table", "front-doorstep", "studio-backdrop", "outdoor-garden"] as const;
const lightingSetups = ["diffused-overcast", "golden-hour", "hard-studio", "bright-daylight"] as const;

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
  artDirection: artDirections[order - 1],
  copyLayout: copyLayouts[order - 1],
  environment: environments[order - 1],
  lightingSetup: lightingSetups[order - 1],
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
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map(v => ({ ...v, artDirection: "sculptural-studio" })) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map(v => ({ ...v, copyLayout: "top-left-editorial" })) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map(v => ({ ...v, environment: "dining-table" })) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map((v, index) => index === 0 ? { ...v, environment: environments[1] } : v) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map(v => ({ ...v, lightingSetup: "golden-hour" })) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map(({ environment, ...rest }) => rest) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map(({ lightingSetup, ...rest }) => rest) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map(v => ({ ...v, productRole: "hero" })) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({
    ...base,
    variants: variants.map((v, index) => index === 1 ? { ...v, creativeType: "informational" } : v),
  }).success, false);
  assert.equal(creativeBriefSchema.safeParse({
    ...base,
    variants: variants.map((v, index) => ({
      ...v,
      sceneStrategy: ["PRODUCT_STUDIO", "EDITORIAL_CONTENT", "OCCASION_SCENE", "BRAND_STORY"][index],
    })),
  }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map((v, index) => ({ ...v, productRole: index < 3 ? "supporting" : "none" })) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map((v, index) => ({ ...v, productRole: index === 0 ? "hero" : "optional" })) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map((v, index) => ({ ...v, productRole: index === 0 ? "hero" : index < 3 ? "supporting" : "optional" })) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map((v, index) => ({ ...v, productRole: index === 3 ? "none" : v.productRole })) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map(v => ({ ...v, cta: "Save this idea" })) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map(v => ({ ...v, cta: "Send this to a friend" })) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: variants.map((v, index) => index === 0 ? { ...v, headline: "This headline has far too many words today" } : v) }).success, false);
});

test("every art direction stays reachable so an assigned visual treatment is always usable", () => {
  const suggested = new Set(Object.values(PREFERRED_ART_DIRECTIONS).flat());
  for (const direction of ART_DIRECTIONS) {
    assert.ok(suggested.has(direction), `${direction} can be assigned as a campaign visual treatment but no scene prefers it`);
  }
  for (const scene of SCENE_STRATEGIES) {
    const preferred = PREFERRED_ART_DIRECTIONS[scene];
    assert.ok(preferred?.length, `${scene} has no preferred art directions`);
    assert.ok(preferred.includes(fallbackArtDirection(scene)), `${scene} fallback is not among its preferred directions`);
  }
});

test("scene strategy never hard-blocks an art direction", () => {
  const variants = [1, 2, 3, 4].map(variant);
  const parseWithLastVariant = (sceneStrategy: string, artDirection: string) => creativeBriefSchema.safeParse({
    ...base,
    variants: variants.map((item, index) => index === 3 ? { ...item, sceneStrategy, artDirection } : item),
  });

  assert.equal(parseWithLastVariant("BRAND_STORY", "color-block-editorial").success, true);

  const taken = new Set<string>(artDirections.slice(0, 3));
  for (const scene of SCENE_STRATEGIES) {
    for (const direction of ART_DIRECTIONS.filter(value => !taken.has(value))) {
      const result = parseWithLastVariant(scene, direction);
      assert.equal(result.success, true, `${direction} should be allowed with ${scene}: ${result.error?.message}`);
    }
  }
});

test("copy that promises a process must include every meaningful content point", () => {
  const variants = [1, 2, 3, 4].map(variant);
  const withFirst = (changes: Record<string, unknown>) => [
    { ...variants[0], headline: "Three simple care steps", subheadline: "A quick routine for fresh flowers.", ...changes },
    ...variants.slice(1),
  ];

  assert.equal(creativeBriefSchema.safeParse({ ...base, variants: withFirst({}) }).success, false);
  assert.equal(creativeBriefSchema.safeParse({
    ...base,
    variants: withFirst({ contentPoints: ["Trim the stems", "Use a clean vase"] }),
  }).success, false);
  assert.equal(creativeBriefSchema.safeParse({
    ...base,
    variants: withFirst({ contentPoints: ["Trim the stems", "Use a clean vase", "Refresh the water"] }),
  }).success, true);
  assert.equal(creativeBriefSchema.safeParse({
    ...base,
    variants: withFirst({ contentPoints: ["Step 1", "Use a clean vase", "Refresh the water"] }),
  }).success, false);
  assert.equal(creativeBriefSchema.safeParse({
    ...base,
    variants: withFirst({ contentPoints: ["One", "Two", "Three"] }),
  }).success, false);
});

test("content promises do not mistake ordinary copy or unrelated numbers for list counts", () => {
  const variants = [1, 2, 3, 4].map(variant);
  const withFirst = (changes: Record<string, unknown>) => [
    { ...variants[0], ...changes },
    ...variants.slice(1),
  ];

  assert.equal(creativeBriefSchema.safeParse({
    ...base,
    variants: withFirst({ headline: "A Beautiful Way to Show Care" }),
  }).success, true);
  assert.equal(creativeBriefSchema.safeParse({
    ...base,
    variants: withFirst({
      headline: "2-day delivery, three simple care steps",
      contentPoints: ["Trim the stems", "Use a clean vase", "Refresh the water"],
    }),
  }).success, true);
  assert.equal(creativeBriefSchema.safeParse({
    ...base,
    variants: withFirst({
      headline: "A simple three-step routine",
      contentPoints: ["Trim the stems", "Use a clean vase", "Refresh the water"],
    }),
  }).success, true);
});

test("unclear copy cannot use a physical prop as the person or message", () => {
  const variants = [1, 2, 3, 4].map(variant);
  const withFirst = (headline: string, subheadline: string) => [
    { ...variants[0], headline, subheadline },
    ...variants.slice(1),
  ];

  assert.equal(creativeBriefSchema.safeParse({
    ...base,
    variants: withFirst("The review is over. The red pen isn't.", "Petals sit beside six weeks of notes."),
  }).success, false);
  assert.equal(creativeBriefSchema.safeParse({
    ...base,
    variants: withFirst("'Thanks, that was helpful' isn't enough.", "Name the red pen. Name the practice runs."),
  }).success, false);
  assert.equal(creativeBriefSchema.safeParse({
    ...base,
    variants: withFirst(
      "For the teammate who helped you",
      "Thank the person whose thoughtful feedback made a difference.",
    ),
  }).success, true);
});
