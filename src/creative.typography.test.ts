import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCodexPrompt,
  layoutForCreativeVariant,
  shouldUseProductReference,
  shouldShowWebsiteCta,
  type CreativeBrief,
  type CreativeVariant,
} from "./codex.creative.js";
import {
  buildCreativeTextOverlay,
  CREATIVE_TEXT_PINK,
  CREATIVE_TEXT_PURPLE,
  headlineWords,
  textPaletteForCreative,
  typographyForCreative,
} from "./creative.text.js";

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

test("typography mode follows the creative purpose", () => {
  assert.equal(typographyForCreative(variant()).mode, "editorial-serif");
  assert.equal(typographyForCreative(variant({
    creativeType: "informational",
    sceneStrategy: "INFORMATIONAL_GRAPHIC",
  })).mode, "modern-sans");
  assert.equal(typographyForCreative(variant({
    creativeType: "informational",
    sceneStrategy: "EDITORIAL_CONTENT",
  })).mode, "editorial-serif");
});

test("headline typography applies controlled pink emphasis to a meaningful phrase", () => {
  const words = headlineWords("Tuesday Flowers, Chosen on Purpose");
  assert.deepEqual(
    words.filter(word => word.accented).map(word => word.text),
    ["Chosen", "on", "Purpose"]
  );

  const svg = buildCreativeTextOverlay(variant(), "left").toString();
  assert.match(svg, new RegExp(CREATIVE_TEXT_PURPLE));
  assert.match(svg, new RegExp(CREATIVE_TEXT_PINK));
  assert.match(svg, /Bodoni 72, Didot, Georgia/);
  assert.match(svg, /Bring the[\s\S]*Blooms/);
  assert.match(svg, /A thoughtful surprise for their[\s\S]*day\./);
});

test("independent creative styling rotates layout, palette and website treatment", () => {
  assert.deepEqual(layoutForCreativeVariant(variant({ order: 1 })), { logoPosition: "top-right", textSide: "left", textVertical: "top" });
  assert.deepEqual(layoutForCreativeVariant(variant({ order: 2 })), { logoPosition: "top-left", textSide: "right", textVertical: "lower" });
  assert.equal(layoutForCreativeVariant(variant({ order: 2, contentPoints: ["One useful point", "Another useful point"] })).textVertical, "top");
  assert.notDeepEqual(textPaletteForCreative(variant({ order: 1 })), textPaletteForCreative(variant({ order: 2 })));
  assert.equal(shouldShowWebsiteCta(variant({ order: 1 })), false);
  assert.equal(shouldShowWebsiteCta(variant({ order: 4 })), true);
});

test("headline and subheadline keep compact spacing and preserve color-boundary spaces", () => {
  const cases = [
    { side: "left" as const, x: 56, anchor: "start", creativeType: "lifestyle", sceneStrategy: "HUMAN_LIFESTYLE" },
    { side: "right" as const, x: 968, anchor: "end", creativeType: "informational", sceneStrategy: "INFORMATIONAL_GRAPHIC" },
  ];

  for (const current of cases) {
    const svg = buildCreativeTextOverlay(variant({
      creativeType: current.creativeType as CreativeVariant["creativeType"],
      sceneStrategy: current.sceneStrategy as CreativeVariant["sceneStrategy"],
      headline: "The spare key that started it all",
      subheadline: "Some debts are too big for a generic thank you.",
    }), current.side).toString();

    assert.match(svg, /that<\/tspan><tspan fill="#[a-f0-9]+" dx="0\.22em">started/);

    const headlinePattern = new RegExp(`<tspan x="${current.x}" y="(\\d+)" text-anchor="${current.anchor}">`, "g");
    const headlineYs = [...svg.matchAll(headlinePattern)].map(match => Number(match[1]));
    const subheadingY = Number(svg.match(new RegExp(`<tspan x="${current.x}" y="(\\d+)">Some debts`))?.[1]);
    const lastHeadlineY = headlineYs.at(-1)!;

    assert.ok(subheadingY - lastHeadlineY <= 60);
    assert.ok(subheadingY - lastHeadlineY >= 40);
  }
});

test("promised care steps are rendered as visible numbered actions", () => {
  const svg = buildCreativeTextOverlay(variant({
    creativeType: "informational",
    sceneStrategy: "INFORMATIONAL_GRAPHIC",
    headline: "Three Simple Care Steps",
    subheadline: "Start with the basics.",
    contentPoints: ["Trim stems at an angle", "Use a clean vase", "Refresh the water"],
  }), "left").toString();

  assert.match(svg, /<circle/);
  assert.match(svg, />1<\/text>/);
  assert.match(svg, />2<\/text>/);
  assert.match(svg, />3<\/text>/);
  assert.match(svg, /Trim stems at an angle/);
  assert.match(svg, /Use a clean vase/);
  assert.match(svg, /Refresh the water/);
});

test("maximum-length content remains renderable on either text side", () => {
  const creative = variant({
    creativeType: "informational",
    sceneStrategy: "INFORMATIONAL_GRAPHIC",
    headline: "Four Essential Care Steps",
    subheadline: "Help the bouquet stay fresh.",
    contentPoints: [
      "Trim every stem diagonally with clean sharp scissors before placing it",
      "Remove every leaf that would otherwise rest below the vase waterline",
      "Fill a freshly cleaned vase with cool water and flower food",
      "Refresh the water regularly and remove any fading flowers promptly",
    ],
  });

  assert.doesNotThrow(() => buildCreativeTextOverlay(creative, "left"));
  assert.doesNotThrow(() => buildCreativeTextOverlay(creative, "right"));
});

test("image generation reserves clear zones and never renders its own text", () => {
  const creative = variant({
    headline: "Three exact care steps",
    contentPoints: ["Trim the stems", "Use a clean vase", "Refresh the water"],
  });
  const prompt = buildCodexPrompt(creative, brief(creative));

  assert.match(prompt, /TEXT-FREE 1:1 premium social media campaign base image/);
  assert.match(prompt, /outer left 46% of the upper 72%/);
  assert.match(prompt, /NO WEBSITE PILL/);
  assert.doesNotMatch(prompt, /lower-center 12%/);
  assert.match(prompt, /Do NOT render any text, letters, numbers/);
  assert.match(prompt, /Do not draw empty circles, unlabeled icons/);
  assert.doesNotMatch(prompt, /TEXT OVERLAY \(verbatim\)/);
  assert.doesNotMatch(prompt, /Three exact care steps/);
});

test("only the fourth independent creative reserves space for the website pill", () => {
  const creative = variant({ order: 4 });
  const prompt = buildCodexPrompt(creative, brief(creative));

  assert.match(prompt, /lower-center 12%/);
  assert.doesNotMatch(prompt, /NO WEBSITE PILL/);
  assert.match(prompt, /outer right 42% of the upper half/);
});

test("middle variants reserve and render a genuinely different lower text structure", () => {
  const creative = variant({ order: 2 });
  const prompt = buildCodexPrompt(creative, brief(creative));
  const svg = buildCreativeTextOverlay(creative, "right", 1024, 1024, "lower").toString();

  assert.match(prompt, /outer right 42% of the lower-middle band/);
  assert.match(svg, /y="563"/);
});

test("hero and supporting creatives use the real product reference", () => {
  assert.equal(shouldUseProductReference(variant({ productRole: "hero" })), true);
  assert.equal(shouldUseProductReference(variant({ productRole: "supporting" })), true);
  assert.equal(shouldUseProductReference(variant({ productRole: "optional" })), false);
  assert.equal(shouldUseProductReference(variant({ productRole: "none" })), false);

  const supporting = variant({ productRole: "supporting" });
  const prompt = buildCodexPrompt(supporting, brief(supporting));
  assert.match(prompt, /Use the supplied product image as the actual bouquet/);
  assert.match(prompt, /Preserve its recognizable flower mix, colors, arrangement and container/);
});

test("existing creatives without content points retain the original safe area", () => {
  const creative = variant({ headline: "A Beautiful Way to Show You Care" });
  const prompt = buildCodexPrompt(creative, brief(creative));

  assert.match(prompt, /outer left 42% of the upper half/);
  assert.doesNotMatch(prompt, /numbered content points/);
  assert.doesNotMatch(prompt, /empty circles, unlabeled icons/);
  assert.doesNotThrow(() => buildCreativeTextOverlay(creative, "left"));
});
