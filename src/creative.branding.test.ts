import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWebsiteCta,
  CREATIVE_CTA_PURPLE,
  CREATIVE_LOGO_WIDTH_RATIO,
  logoScrimTone,
  logoScrimToneForCells,
  logoScrimOpacity,
  buildLogoScrimSvg,
  LOGO_SCRIM_PAD_X,
  LOGO_SCRIM_PAD_Y,
} from "./codex.creative.js";

test("creative branding matches the approved logo scale and website CTA", () => {
  const cta = buildWebsiteCta(1024, 1024);
  const svg = cta.input.toString();

  assert.equal(CREATIVE_LOGO_WIDTH_RATIO, 0.24);
  assert.deepEqual(
    { left: cta.left, top: cta.top, width: cta.width, height: cta.height },
    { left: 297, top: 920, width: 430, height: 68 }
  );
  assert.match(svg, new RegExp(`fill="${CREATIVE_CTA_PURPLE}"`));
  assert.match(svg, /fill="white"/);
  assert.match(svg, /font-weight="700"/);
  assert.match(svg, /www\.greatflowers\.net/);
});

test("the logo scrim only engages when the corner cannot carry the wordmark", () => {
  // A clean bright backdrop carries both ends of the gradient; a scrim there is only a smudge.
  assert.equal(logoScrimTone(255, 255, 255), null);
  assert.equal(logoScrimTone(240, 232, 236), null);

  // Dark corners swallow the indigo end, leaving half the name invisible.
  assert.equal(logoScrimTone(0, 0, 0), "light");
  assert.equal(logoScrimTone(32, 28, 40), "light");
  assert.equal(logoScrimTone(96, 84, 92), "light");

  // Mid pinks and mauves wash out the magenta end even though they are bright. These used to ask
  // for a dark scrim, which cannot work: see the proof in the unsoundness test below.
  assert.equal(logoScrimTone(214, 198, 205), "light");
  assert.equal(logoScrimTone(190, 150, 170), "light");

  // A saturated magenta corner clashes with the wordmark from the other direction.
  assert.equal(logoScrimTone(198, 42, 120), "light");
});

test("a corner that is bright on one side and dark on the other still gets a scrim", () => {
  // Chosen so neither patch hits the opacity cap, where every corner would ask for the same wash.
  const bright = [250, 248, 250] as const;
  const dark = [150, 142, 152] as const;

  // Each half alone is judged correctly.
  assert.equal(logoScrimTone(bright[0], bright[1], bright[2]), null);
  assert.equal(logoScrimTone(dark[0], dark[1], dark[2]), "light");

  // Averaged into a single sample the split corner reads as a mid-tone, which is how the wordmark
  // on the lamplit dining frame ended up half-swallowed by a dark window.
  const mean = [0, 1, 2].map(channel => Math.round((bright[channel]! + dark[channel]!) / 2)) as [number, number, number];
  assert.ok(
    logoScrimOpacity(mean[0], mean[1], mean[2]) < logoScrimOpacity(dark[0], dark[1], dark[2]),
    "averaging must understate the scrim the worst patch needs"
  );

  // Judged cell by cell, the dark half decides.
  const split = [bright, bright, bright, bright, bright, bright, dark, dark, dark, dark, dark, dark];
  assert.equal(logoScrimToneForCells(split), "light");

  // A corner that is uniformly fine is still left alone.
  assert.equal(logoScrimToneForCells([bright, bright, bright, bright]), null);
});

test("darkening the corner can never rescue this wordmark", () => {
  // The stops span a wide luminance range, so the two ends pull in opposite directions. Pushing the
  // background dark enough for the magenta end destroys the indigo end, which is why every scrim
  // lightens and logoScrimTone has no "dark" branch to choose.
  const stops = ["#351E6A", "#701888", "#A52E7F", "#B32C7E", "#DB2173"];
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance = (hex: string) =>
    0.2126 * channel(parseInt(hex.slice(1, 3), 16)) +
    0.7152 * channel(parseInt(hex.slice(3, 5), 16)) +
    0.0722 * channel(parseInt(hex.slice(5, 7), 16));
  const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  const lightest = Math.max(...stops.map(luminance));
  const darkest = Math.min(...stops.map(luminance));
  const darkEnough = (lightest + 0.05) / 3 - 0.05;

  assert.ok(contrast(darkEnough, darkest) < 1.1, "darkening for the magenta end must wreck the indigo end");
  assert.ok(contrast(3 * (lightest + 0.05) - 0.05, darkest) >= 3, "lightening must satisfy both ends at once");
});

test("the logo scrim is strong enough to clear the threshold it just measured", () => {
  for (const corner of [[0, 0, 0], [20, 18, 25], [32, 28, 40], [96, 84, 92], [190, 150, 170], [198, 42, 120]] as const) {
    assert.ok(logoScrimTone(corner[0], corner[1], corner[2]), `${corner} should need a scrim`);
    const opacity = logoScrimOpacity(corner[0], corner[1], corner[2]);
    const lifted = [0, 1, 2].map(c => Math.round(255 * opacity + corner[c]! * (1 - opacity))) as [number, number, number];

    // Either the corner now carries the wordmark, or it was dark enough that the cap bound first -
    // in which case the scrim must still be at full strength rather than quietly giving up.
    const fixed = logoScrimTone(lifted[0], lifted[1], lifted[2]) === null;
    assert.ok(fixed || opacity >= 0.44, `${corner} got only ${opacity.toFixed(2)} and still fails`);
  }

  // A corner barely below the line gets a wash too faint to see, not a plate.
  assert.ok(logoScrimOpacity(200, 196, 200) < logoScrimOpacity(40, 36, 44));
});

test("the logo scrim reaches zero before the patch ends, so it is never a visible box", () => {
  const svg = buildLogoScrimSvg(418, 274, 0.45);
  const radius = Number(svg.match(/r="([\d.]+)%"/)?.[1]) / 100;
  const stops = [...svg.matchAll(/<stop offset="([\d.]+)%"[^>]*stop-opacity="([\d.]+)"/g)]
    .map(match => ({ offset: Number(match[1]) / 100, opacity: Number(match[2]) }));

  // Opacity at a point `distance` from the centre, in objectBoundingBox units.
  const opacityAt = (distance: number) => {
    const offset = distance / radius;
    if (offset >= 1) return 0;
    for (let index = 1; index < stops.length; index += 1) {
      const [from, to] = [stops[index - 1]!, stops[index]!];
      if (offset <= to.offset) {
        return from.opacity + (to.opacity - from.opacity) * ((offset - from.offset) / (to.offset - from.offset));
      }
    }
    return 0;
  };

  // The rectangle's own geometry: edges at 0.5 from centre, corners at 0.707.
  assert.equal(opacityAt(0.5), 0, "the scrim must be gone by the edge of its patch");
  assert.equal(opacityAt(0.707), 0, "the scrim must be gone in the corners of its patch");

  // A radius past 50% is what put a hard-edged light rectangle behind the wordmark twice.
  assert.ok(radius <= 0.5, `radius ${radius} lets the gradient run past the rectangle`);

  // The wordmark itself still sits at full strength, or lifting the corner achieves nothing.
  const wordmarkEdgeX = 0.5 / (1 + 2 * LOGO_SCRIM_PAD_X);
  const wordmarkEdgeY = 0.5 / (1 + 2 * LOGO_SCRIM_PAD_Y);
  assert.equal(opacityAt(wordmarkEdgeX), 0.45, "the far end of the wordmark lost its scrim");
  assert.equal(opacityAt(wordmarkEdgeY), 0.45, "the top of the wordmark lost its scrim");
});
