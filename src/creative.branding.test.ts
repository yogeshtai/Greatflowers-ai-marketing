import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWebsiteCta,
  CREATIVE_CTA_PURPLE,
  CREATIVE_LOGO_WIDTH_RATIO,
} from "./codex.creative.js";

test("creative branding matches the approved logo scale and website CTA", () => {
  const cta = buildWebsiteCta(1024, 1024);
  const svg = cta.input.toString();

  assert.equal(CREATIVE_LOGO_WIDTH_RATIO, 0.2);
  assert.deepEqual(
    { left: cta.left, top: cta.top, width: cta.width, height: cta.height },
    { left: 297, top: 920, width: 430, height: 68 }
  );
  assert.match(svg, new RegExp(`fill="${CREATIVE_CTA_PURPLE}"`));
  assert.match(svg, /fill="white"/);
  assert.match(svg, /font-weight="700"/);
  assert.match(svg, /www\.greatflowers\.net/);
});
