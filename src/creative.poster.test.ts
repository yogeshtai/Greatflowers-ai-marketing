import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderPoster, posterLayout } from "./creative.poster.js";

test("four poster compositions render complete square assets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gf-posters-"));
  try {
    const photo = await sharp({ create: { width: 1536, height: 1536, channels: 3, background: "#a389ad" } }).png().toBuffer();
    const logo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="190" height="76"><text x="0" y="40" font-size="26">Great Flowers</text></svg>');
    assert.equal(new Set([1, 2, 3, 4].map(posterLayout)).size, 4);
    for (const order of [1, 2, 3, 4]) {
      const output = join(directory, `${order}.png`);
      await renderPoster(photo, logo, { order, headline: "A Beautiful Way to Say Thanks", subheadline: "A thoughtful surprise for someone special.", contentPoints: order === 3 ? ["Choose their favorite colors.", "Add a personal message.", "Make an ordinary day special."] : [] }, output);
      const metadata = await sharp(output).metadata();
      assert.equal(metadata.width, 1080);
      assert.equal(metadata.height, 1080);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
