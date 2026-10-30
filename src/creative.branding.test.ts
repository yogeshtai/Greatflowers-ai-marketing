import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWebsiteCta,
  CREATIVE_CTA_PURPLE,
  CREATIVE_LOGO_WIDTH_RATIO,
  logoScrimTone,
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

  // Mid pinks and mauves wash out the magenta end even though they are bright.
  assert.equal(logoScrimTone(214, 198, 205), "dark");
  assert.equal(logoScrimTone(190, 150, 170), "dark");

  // A saturated magenta corner clashes with the wordmark from the other direction.
  assert.equal(logoScrimTone(198, 42, 120), "light");
});
