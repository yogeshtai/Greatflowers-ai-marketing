import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
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
  CREATIVE_LOGO_ASPECT,
  CREATIVE_LOGO_WIDTH_RATIO,
  CREATIVE_MARGIN_RATIO,
  CREATIVE_TEXT_PINK,
  CREATIVE_TEXT_PURPLE,
  detectCreativeTextTone,
  headlineWords,
  shortCtaLabel,
  stripPrices,
  accentIndexForImage,
  ctaAccentForCreative,
  dominantHueFromPixels,
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
  artDirection: "documentary-gifting",
  copyLayout: "top-left-editorial",
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

test("typography mode follows the art direction, then the creative purpose", () => {
  // Reportage-style directions take the grotesque so they stop sharing the editorial serif.
  assert.equal(typographyForCreative(variant()).mode, "documentary-grotesque");
  assert.equal(typographyForCreative(variant({ artDirection: "unboxing-reveal" })).mode, "documentary-grotesque");

  assert.equal(typographyForCreative(variant({ artDirection: "magazine-product-feature" })).mode, "editorial-serif");
  assert.equal(typographyForCreative(variant({
    artDirection: "editorial-flatlay",
    creativeType: "informational",
    sceneStrategy: "INFORMATIONAL_GRAPHIC",
  })).mode, "modern-sans");
  assert.equal(typographyForCreative(variant({
    artDirection: "editorial-flatlay",
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

  const svg = buildCreativeTextOverlay(variant({ artDirection: "magazine-product-feature" }), "left").toString();
  assert.match(svg, new RegExp(CREATIVE_TEXT_PURPLE));
  assert.match(svg, new RegExp(CREATIVE_TEXT_PINK));
  assert.match(svg, /Bodoni 72, Didot, Georgia/);
  assert.match(svg, /Bring the[\s\S]*Blooms/);
  assert.match(svg, /A thoughtful surprise for[\s\S]*their day\./);
});

test("independent creative styling rotates layout while the palette and logo stay on-brand", () => {
  // The logo anchors the top of the text column on the same side, like the reference ads.
  assert.deepEqual(layoutForCreativeVariant(variant({ order: 1 })), { logoPosition: "top-left", textSide: "left", textVertical: "top" });
  assert.deepEqual(layoutForCreativeVariant(variant({ order: 2, copyLayout: "lower-right-caption" })), { logoPosition: "top-right", textSide: "right", textVertical: "lower" });
  assert.equal(layoutForCreativeVariant(variant({ order: 2, copyLayout: "lower-right-caption", contentPoints: ["One useful point", "Another useful point"] })).textVertical, "top");
  // The brand primary is locked; only the accent rotates, so one campaign is not four identical ads.
  assert.equal(textPaletteForCreative(variant({ order: 1 })).primary, CREATIVE_TEXT_PURPLE);
  assert.equal(textPaletteForCreative(variant({ order: 2 })).primary, CREATIVE_TEXT_PURPLE);
  assert.equal(textPaletteForCreative(variant({ order: 4 })).primary, CREATIVE_TEXT_PURPLE);
  assert.equal(textPaletteForCreative(variant({ order: 1 })).accent, CREATIVE_TEXT_PINK);
  assert.notEqual(textPaletteForCreative(variant({ order: 3 })).accent, CREATIVE_TEXT_PINK);
  assert.equal(
    new Set([1, 2, 3, 4].map(order => textPaletteForCreative(variant({ order })).accent)).size,
    4
  );
  assert.equal(shouldShowWebsiteCta(variant({ order: 1 })), false);
  assert.equal(shouldShowWebsiteCta(variant({ order: 4 })), true);
});

test("rotated accents are visibly different colours, not four shades of one hue", () => {
  // A previous version of this file only checked that the four accents were different VALUES, which
  // four near-identical pinks satisfy while still looking like one template on the finished ad.
  const rgb = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  const hue = (hex: string) => {
    const [r, g, b] = rgb(hex).map(value => value / 255) as [number, number, number];
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    if (!delta) return 0;
    const raw = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return (raw * 60 + 360) % 360;
  };
  const luminance = (hex: string) => {
    const [r, g, b] = rgb(hex).map(value => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const high = Math.max(luminance(a), luminance(b));
    const low = Math.min(luminance(a), luminance(b));
    return (high + 0.05) / (low + 0.05);
  };
  const apart = (a: string, b: string) => {
    const gap = Math.abs(hue(a) - hue(b));
    return Math.min(gap, 360 - gap);
  };

  const orders = [1, 2, 3, 4];
  for (const tone of ["dark", "light"] as const) {
    const accents = orders.map(order => textPaletteForCreative(variant({ order }), tone).accent);
    for (let i = 0; i < accents.length; i += 1) {
      for (let j = i + 1; j < accents.length; j += 1) {
        assert.ok(
          apart(accents[i]!, accents[j]!) >= 20,
          `${tone} accents ${accents[i]} and ${accents[j]} are only ${apart(accents[i]!, accents[j]!).toFixed(0)}° apart`
        );
      }
    }
  }

  // Measuring an accent against pure white flatters it: the real backdrop is a warm cream
  // photograph seen through the scrim, which is darker and in the same hue family as the warm
  // accents. Check the accent against that, at the large-text threshold it is actually used at
  // (bold display headlines), and check the CTA fill against the white label it carries.
  const WARM_SCRIMMED_PHOTO = "#e8d5bf";
  for (const order of orders) {
    const accent = textPaletteForCreative(variant({ order }), "dark").accent;
    assert.ok(
      contrast(accent, WARM_SCRIMMED_PHOTO) >= 3,
      `${accent} only reaches ${contrast(accent, WARM_SCRIMMED_PHOTO).toFixed(2)}:1 on a warm photograph`
    );
    assert.ok(contrast(ctaAccentForCreative(order), "#ffffff") >= 4.5, `CTA pill ${ctaAccentForCreative(order)} cannot carry white text`);
  }
});

test("the dominant hue comes from the saturated subject, not walls or shadows", () => {
  const repeat = (pixel: readonly [number, number, number], count: number) =>
    Array.from({ length: count }, () => pixel);

  const amber = [230, 150, 60] as const;
  const scene = [
    ...repeat(amber, 120),
    ...repeat([128, 128, 128], 2000),   // neutral wall
    ...repeat([10, 10, 10], 2000),      // shadow
    ...repeat([250, 250, 250], 800),    // blown highlight
    ...repeat([200, 215, 195], 1200),   // pale roses: real, but too washed out to name a colour
  ];
  const hue = dominantHueFromPixels(scene);
  assert.ok(hue !== null && Math.abs(hue - 32) <= 8, `expected a warm amber hue, got ${hue}`);

  // A frame with nothing saturated in it has no colour to echo.
  assert.equal(dominantHueFromPixels(repeat([128, 128, 128], 4096)), null);
  assert.equal(dominantHueFromPixels([]), null);
});

test("the accent echoes a colour the photograph actually contains", () => {
  const ACCENTS = { pink: 0, gold: 1, teal: 2, coral: 3 };

  // The complaint this fixes: a warm candlelit Halloween table was given a magenta headline purely
  // because it was that creative's turn in the rotation.
  for (const order of [1, 2, 3, 4]) {
    const chosen = accentIndexForImage(23, order);
    assert.notEqual(chosen, ACCENTS.pink, `warm amber frame must not take the magenta accent (order ${order})`);
    assert.notEqual(chosen, ACCENTS.teal, `warm amber frame must not take the teal accent (order ${order})`);
  }

  // Each photograph pulls the accent toward what is in it.
  assert.equal(accentIndexForImage(110, 1), ACCENTS.teal);   // green foliage
  assert.equal(accentIndexForImage(320, 1), ACCENTS.pink);   // magenta blooms
  assert.equal(accentIndexForImage(15, 1), ACCENTS.coral);   // warm terracotta

  // Position only breaks ties between accents that suit the frame equally well, and the closest
  // match always goes first.
  assert.equal(accentIndexForImage(23, 1), ACCENTS.coral);
  assert.notEqual(accentIndexForImage(23, 2), accentIndexForImage(23, 1));

  // With nothing to echo, the old positional rotation still applies.
  assert.deepEqual([1, 2, 3, 4].map(order => accentIndexForImage(null, order)), [0, 1, 2, 3]);
});

test("the CTA pill carries the same accent as the headline it sits under", () => {
  for (const hue of [23, 110, 320, null]) {
    for (const order of [1, 2, 3, 4]) {
      const headline = textPaletteForCreative(variant({ order }), "dark", hue).accent;
      assert.equal(ctaAccentForCreative(order, hue), headline, `pill and headline disagree at hue ${hue}, order ${order}`);
    }
  }
});

test("the copy scrim fades out instead of ending in a visible panel edge", () => {
  const cases = [
    { vertical: "top" as const, overrides: {}, plateauBottom: Math.round(1024 * 0.8) },
    { vertical: "top" as const, overrides: { contentPoints: ["Trim the stems", "Use a clean vase", "Refresh the water"] }, plateauBottom: Math.round(1024 * 0.85) },
    { vertical: "lower" as const, overrides: { copyLayout: "lower-right-caption" }, plateauBottom: Math.round(1024 * 0.92) },
  ];

  for (const current of cases) {
    const svg = buildCreativeTextOverlay(
      variant(current.overrides as Partial<CreativeVariant>), "left", 1024, 1024, current.vertical
    ).toString();

    // The band is masked rather than cut off, so it has no hard horizontal boundary.
    assert.match(svg, /fill="url\(#copy-gradient\)" mask="url\(#copy-mask\)"/);

    const rect = svg.match(/<rect x="0" y="(\d+)" width="1024" height="(\d+)" fill="url\(#copy-gradient\)"/);
    assert.ok(rect, `${current.vertical} scrim rect not found`);
    const [top, span] = [Number(rect[1]), Number(rect[2])];

    // Scope this to the vertical fade: the horizontal copy-gradient also uses white stops.
    const fade = svg.match(/<linearGradient id="copy-fade"[^>]*>([\s\S]*?)<\/linearGradient>/);
    assert.ok(fade, `${current.vertical} copy-fade gradient not found`);
    const stops = [...fade[1]!.matchAll(/<stop offset="([\d.]+)%" stop-color="#ffffff" stop-opacity="([\d.]+)"\/>/g)]
      .map(match => ({ offset: Number(match[1]), opacity: Number(match[2]) }));
    assert.deepEqual(stops.at(-1), { offset: 100, opacity: 0 }, "the scrim must reach zero at its lower edge");

    // Full-strength coverage still reaches the boundary the solid rectangle used to end at, so
    // softening the edge cannot cost legibility under the copy.
    const plateau = stops.filter(stop => stop.opacity === 1);
    assert.equal(plateau.length, 2);
    assert.ok(
      top + (span * plateau.at(-1)!.offset) / 100 >= current.plateauBottom - 1,
      `${current.vertical} scrim weakens at ${top + (span * plateau.at(-1)!.offset) / 100} before ${current.plateauBottom}`
    );

    // A band floating in the middle of the frame must fade in at the top as well.
    assert.equal(stops[0]!.opacity, current.vertical === "lower" ? 0 : 1);
  }
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
  assert.match(prompt, /outer left 46% of the upper 82%/);
  assert.match(prompt, /NO WEBSITE PILL/);
  assert.doesNotMatch(prompt, /lower-center 12%/);
  assert.match(prompt, /Do NOT render any text, letters, numbers/);
  assert.match(prompt, /Do not draw empty circles, unlabeled icons/);
  assert.match(prompt, /logo corner must be an evenly LIT, LIGHT, uncluttered area/);
  assert.match(prompt, /never let that corner be half bright and half dark/);
  assert.doesNotMatch(prompt, /TEXT OVERLAY \(verbatim\)/);
  assert.doesNotMatch(prompt, /Three exact care steps/);
});

test("only the fourth independent creative reserves space for the website pill", () => {
  const creative = variant({ order: 4, copyLayout: "top-right-editorial" });
  const prompt = buildCodexPrompt(creative, brief(creative));

  assert.match(prompt, /lower-center 12%/);
  assert.doesNotMatch(prompt, /NO WEBSITE PILL/);
  assert.match(prompt, /outer right 42% of the upper half/);
});

test("middle variants reserve and render a genuinely different lower text structure", () => {
  const creative = variant({ order: 2, copyLayout: "lower-right-caption" });
  const prompt = buildCodexPrompt(creative, brief(creative));
  const svg = buildCreativeTextOverlay(creative, "right", 1024, 1024, "lower").toString();

  assert.match(prompt, /outer right 42% of the lower-middle band/);
  assert.match(svg, /y="563"/);
});

test("creative typography automatically switches contrast for dark and light photographs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "creative-contrast-"));
  const darkImage = join(directory, "dark.png");
  const lightImage = join(directory, "light.png");
  try {
    await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#202124" } }).png().toFile(darkImage);
    await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#f2eee7" } }).png().toFile(lightImage);

    assert.equal(await detectCreativeTextTone(darkImage, "left", "top"), "light");
    assert.equal(await detectCreativeTextTone(lightImage, "left", "top"), "dark");

    const lightTextSvg = buildCreativeTextOverlay(variant(), "left", 1024, 1024, "top", "light").toString();
    assert.match(lightTextSvg, /fill="#ffffff"/);
    assert.match(lightTextSvg, /flood-color="#000000"/);
    assert.match(lightTextSvg, /copy-gradient/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("hero and supporting creatives use the real product reference", () => {
  assert.equal(shouldUseProductReference(variant({ productRole: "hero" })), true);
  assert.equal(shouldUseProductReference(variant({ productRole: "supporting" })), true);
  assert.equal(shouldUseProductReference(variant({ productRole: "optional" })), true);
  assert.equal(shouldUseProductReference(variant({ productRole: "none" })), false);

  const supporting = variant({ productRole: "supporting" });
  const prompt = buildCodexPrompt(supporting, brief(supporting));
  assert.match(prompt, /Use the supplied product image as the actual bouquet/);
  assert.match(prompt, /Preserve its recognizable flower mix, colors, arrangement and container/);
  assert.match(prompt, /ART DIRECTION \(MANDATORY\): documentary-gifting/);
  assert.match(prompt, /COPY LAYOUT \(CRITICAL\): top-left-editorial/);

  const optional = variant({ productRole: "optional" });
  const optionalPrompt = buildCodexPrompt(optional, brief(optional));
  assert.match(optionalPrompt, /MUST be the exact supplied product/);
  assert.match(optionalPrompt, /Never invent a different bouquet/);
  assert.match(optionalPrompt, /props may establish context, but must never become the primary/);
});

test("existing creatives without content points retain the original safe area", () => {
  const creative = variant({ headline: "A Beautiful Way to Show You Care" });
  const prompt = buildCodexPrompt(creative, brief(creative));

  assert.match(prompt, /outer left 42% of the upper half/);
  assert.doesNotMatch(prompt, /numbered content points/);
  assert.doesNotMatch(prompt, /empty circles, unlabeled icons/);
  assert.doesNotThrow(() => buildCreativeTextOverlay(creative, "left"));
});

test("headline always starts below the logo with a clear gap", () => {
  for (const headline of ["Autumn, Already Styled", "One Arrangement Changed the Room", "A Beautiful Way to Show You Care Every Day"]) {
    const svg = buildCreativeTextOverlay(variant({ headline }), "left", 1024, 1024, "top").toString();
    const firstBaseline = Number(svg.match(/<tspan x="56" y="(\d+)" text-anchor="start">/)?.[1]);
    const size = Number(svg.match(/font-size="(\d+)" font-weight="700" letter-spacing/)?.[1]);
    const logoBottom = Math.round(1024 * CREATIVE_MARGIN_RATIO) + Math.round(1024 * CREATIVE_LOGO_WIDTH_RATIO * CREATIVE_LOGO_ASPECT);
    assert.ok(firstBaseline - size * 0.72 - logoBottom >= 20, `${headline}: headline top ${firstBaseline - size * 0.72} vs logo bottom ${logoBottom}`);
  }
});

test("image CTA pills are one or two words and the column never prints the URL", () => {
  assert.equal(shortCtaLabel("Shop Now"), "Shop Now");
  assert.equal(shortCtaLabel("Send Flowers"), "Send Flowers");
  assert.equal(shortCtaLabel("Shop Spiced Pumpkin Petals"), "Shop Now");
  assert.equal(shortCtaLabel("Explore the Halloween collection at https://greatflowers.net"), "Explore Now");
  assert.equal(shortCtaLabel("Save this fall table idea"), "Save This");
  assert.equal(shortCtaLabel(""), "");
  const svg = buildCreativeTextOverlay(variant({ cta: "Shop Spiced Pumpkin Petals" }), "left").toString();
  assert.match(svg, />Shop Now →</);
  assert.doesNotMatch(svg, /greatflowers\.net/);
});

test("prices are never baked into creative copy", () => {
  assert.equal(stripPrices("Orange spray mums in an autumn-print bucket — $40.97."), "Orange spray mums in an autumn-print bucket.");
  assert.equal(stripPrices("Only $57.97 today"), "today");
  const svg = buildCreativeTextOverlay(variant({ subheadline: "Orange mums in a bucket — $40.97." }), "left").toString();
  assert.doesNotMatch(svg, /\$40/);
});
