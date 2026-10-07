import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeEmbeds, validatePost } from "./blog.generator.js";
import { nextNewYorkHour } from "./blog.time.js";

const para = "<p>" + "Fresh flowers make every gift feel personal and thoughtful. ".repeat(25) + "</p>";
const html = `<h2>Why flowers</h2>${para}<div class="blog-product-embed" data-product-id="7"></div><h2>More</h2>${para}${para}${para}`;
const base = {
  topic: "Thanksgiving table flowers", title: "Best Thanksgiving Table Flowers for Hosts", slug: "thanksgiving-table-flowers",
  metaTitle: "Thanksgiving Table Flowers", metaDescription: "Discover thoughtful Thanksgiving table flower ideas for hosts, from warm autumn bouquets to simple centerpieces that fit any dinner.",
  summary: "Simple ideas for choosing flowers that suit a Thanksgiving dinner table.", categorySlug: "gift", productIds: [7], heroProductId: 7, html,
};
const ctx = { existingTitles: ["Other post title here"], existingSlugs: ["other"], categories: new Set(["gift"]), productIds: new Set([7, 8]) };

test("valid post passes", () => assert.equal(validatePost(JSON.stringify(base), ctx).slug, base.slug));
test("duplicate slug rejected", () => assert.throws(() => validatePost(JSON.stringify(base), { ...ctx, existingSlugs: [base.slug] }), /slug/));
test("unknown category rejected", () => assert.throws(() => validatePost(JSON.stringify({ ...base, categorySlug: "nope" }), ctx), /categorySlug/));
test("script tags rejected", () => assert.throws(() => validatePost(JSON.stringify({ ...base, html: html + "<script>x</script>" }), ctx)));
test("hallucinated embeds are stripped", () => {
  const out = sanitizeEmbeds(html + '<div class="blog-product-embed" data-product-id="99"></div>', new Set([7]));
  assert.ok(out.includes('data-product-id="7"') && !out.includes('"99"'));
});
test("publish time: summer is 10:00 EDT (14:00Z)", () => assert.equal(nextNewYorkHour(10, new Date("2026-07-01T15:00:00Z")).toISOString(), "2026-07-02T14:00:00.000Z"));
test("publish time: winter is 10:00 EST (15:00Z)", () => assert.equal(nextNewYorkHour(10, new Date("2026-12-01T16:00:00Z")).toISOString(), "2026-12-02T15:00:00.000Z"));
test("publish time: before slot stays same day", () => assert.equal(nextNewYorkHour(10, new Date("2026-10-07T12:00:00Z")).toISOString(), "2026-10-07T14:00:00.000Z"));
test("publish time: crosses DST end (Nov 1 2026)", () => assert.equal(nextNewYorkHour(10, new Date("2026-11-01T15:30:00Z")).toISOString(), "2026-11-02T15:00:00.000Z"));
