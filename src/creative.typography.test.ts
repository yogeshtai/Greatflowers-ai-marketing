import assert from "node:assert/strict";
import test from "node:test";
import { buildCodexPrompt, type CreativeBrief, type CreativeVariant } from "./codex.creative.js";
import {
  buildCreativeTextOverlay,
  CREATIVE_TEXT_PINK,
  CREATIVE_TEXT_PURPLE,
  headlineWords,
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

test("image generation reserves clear zones and never renders its own text", () => {
  const creative = variant({ headline: "Exact approved copy" });
  const prompt = buildCodexPrompt(creative, brief(creative));

  assert.match(prompt, /TEXT-FREE 1:1 premium social media campaign base image/);
  assert.match(prompt, /outer left 42%/);
  assert.match(prompt, /lower-center 12%/);
  assert.match(prompt, /Do NOT render any text, letters, numbers/);
  assert.doesNotMatch(prompt, /TEXT OVERLAY \(verbatim\)/);
  assert.doesNotMatch(prompt, /Exact approved copy/);
});
