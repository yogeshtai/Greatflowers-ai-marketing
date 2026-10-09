import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLinks, sanitizeEmbeds, selectBlogFormat, toCatalogProduct, validatePost } from "./blog.generator.js";
import { nextNewYorkHour } from "./blog.time.js";
import { publishAfterFor } from "./blog.publisher.js";
import { buildHeroOverlaySvg, buildHeroPrompt, pickComposition } from "./blog.image.js";
import { getUpcomingOccasions } from "./occasion.calendar.js";

const para = "<p>" + "Fresh flowers make every gift feel personal and thoughtful. ".repeat(25) + "</p>";
const html = `<h2>Why flowers</h2>${para}<p><a href="PRODUCT:7">Red Rose Bouquet</a> and <a href="BLOG:other-post">our other guide</a>.</p><div class="blog-product-embed" data-product-id="7"></div><h2>More</h2>${para}${para}${para}<p>Visit <a href="HOME">Great Flowers</a> today.</p>`;
const base = {
  topic: "Thanksgiving table flowers", title: "Best Thanksgiving Table Flowers for Hosts", slug: "thanksgiving-table-flowers",
  metaTitle: "Thanksgiving Table Flowers", metaDescription: "Discover thoughtful Thanksgiving table flower ideas for hosts, from warm autumn bouquets to simple centerpieces that fit any dinner.",
  summary: "Simple ideas for choosing flowers that suit a Thanksgiving dinner table.", categorySlug: "gift", productIds: [7], heroProductId: 7,
  heroStrategy: "OCCASION_SCENE", heroProductRole: "supporting", heroConcept: "A host reaches across a candlelit table to place the final arrangement while arriving friends remove their coats in the softly blurred doorway behind her.", html,
  contentFormat: "CURATED_LIST",
};
const products = [{ id: 7, name: "Red Rose Bouquet", slug: "red-rose-bouquet", price: 40, imageUrl: "x", description: "Red roses in a glass vase." }, { id: 8, name: "Other", slug: "other", price: 30, imageUrl: "x", description: "Red roses in a glass vase." }];
const ctx = { existingTitles: ["Other post title here"], existingSlugs: ["other"], categories: new Set(["gift"]), products, relatedSlugs: new Set(["other-post"]), base: "https://greatflowers.net", requiredFormat: "CURATED_LIST" as const };

test("valid post passes and links resolve to real URLs", () => {
  const out = validatePost(JSON.stringify(base), ctx);
  assert.equal(out.slug, base.slug);
  assert.ok(out.html.includes('href="https://greatflowers.net/product/red-rose-bouquet/"'));
  assert.ok(out.html.includes('href="https://greatflowers.net/blogs/other-post/"'));
  assert.ok(out.html.includes('href="https://greatflowers.net/"'));
});
test("invented URLs are rejected", () => assert.throws(() => validatePost(JSON.stringify({ ...base, html: html + '<p><a href="https://example.com/x">x</a></p>' }), ctx), /not allowed/));
test("single-quoted or unquoted hrefs are rejected", () => {
  for (const bad of [`<a href='https://example.com'>x</a>`, `<a href=https://example.com>x</a>`]) assert.throws(() => resolveLinks(bad, { productSlugs: new Map(), blogSlugs: new Set(), base: "b" }), /double quotes/);
});
test("catalog description is cleaned of HTML", () => {
  assert.equal(toCatalogProduct({ id: 1, name: "A", slug: "a", short_description: "<p>Pink &amp; white <b>lilies</b></p>" }).description, "Pink & white lilies");
});
test("images are rejected", () => assert.throws(() => validatePost(JSON.stringify({ ...base, html: html + '<img src="https://example.com/a.png">' }), ctx)));
test("unknown product link is rejected", () => assert.throws(() => resolveLinks('<a href="PRODUCT:99">x</a>', { productSlugs: new Map(), blogSlugs: new Set(), base: "b" }), /unknown product/));
test("missing HOME closing link is rejected", () => assert.throws(() => validatePost(JSON.stringify({ ...base, html: html.replace('href="HOME"', 'href="BLOG:other-post"') }), ctx), /HOME/));
test("duplicate slug rejected", () => assert.throws(() => validatePost(JSON.stringify(base), { ...ctx, existingSlugs: [base.slug] }), /slug/));
test("second category accepted when different, rejected when same or unknown", () => {
  const ctx2 = { ...ctx, categories: new Set(["gift", "birthday"]) };
  assert.equal(validatePost(JSON.stringify({ ...base, secondCategorySlug: "birthday" }), ctx2).secondCategorySlug, "birthday");
  assert.throws(() => validatePost(JSON.stringify({ ...base, secondCategorySlug: "gift" }), ctx2), /secondCategorySlug/);
  assert.throws(() => validatePost(JSON.stringify({ ...base, secondCategorySlug: "nope" }), ctx2), /secondCategorySlug/);
});
test("'none' is accepted when no category fits, but not with a second category", () => {
  assert.equal(validatePost(JSON.stringify({ ...base, categorySlug: "none" }), ctx).categorySlug, "none");
  assert.throws(() => validatePost(JSON.stringify({ ...base, categorySlug: "none", secondCategorySlug: "gift" }), ctx), /omit secondCategorySlug/);
});
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
test("immediate mode schedules publishing for now; scheduled mode uses the 10 AM ET slot", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  try {
    delete process.env.BLOG_PUBLISH_MODE;
    assert.equal(publishAfterFor(now).toISOString(), now.toISOString());
    process.env.BLOG_PUBLISH_MODE = "scheduled";
    assert.equal(publishAfterFor(now).toISOString(), "2026-10-07T14:00:00.000Z");
  } finally {
    delete process.env.BLOG_PUBLISH_MODE;
  }
});
test("blog lookahead sees Halloween and Thanksgiving from Oct 8", () => {
  const names = getUpcomingOccasions(50, new Date(2026, 9, 8)).map((o) => o.name);
  assert.deepEqual(names, ["Halloween", "Thanksgiving"]);
});
test("hero prompt follows the scene strategy, keeps the product exact, and forbids text", () => {
  const prompt = buildHeroPrompt({ title: "Best Flowers for Boss's Day", topic: "Boss's Day", heroStrategy: "HUMAN_GIFTING_MOMENT", heroProductRole: "supporting", heroConcept: "A colleague hands a sunflower bouquet to her manager." }, "a candid medium shot");
  assert.ok(prompt.includes("HUMAN_GIFTING_MOMENT") && prompt.includes("A colleague hands a sunflower bouquet to her manager."));
  assert.ok(prompt.includes("a candid medium shot") && /exact flowers, colors, shapes and vase/.test(prompt));
  assert.ok(/no text/.test(prompt) && /REQUIRED: include one or more people/.test(prompt));
  assert.ok(prompt.includes("three layers of depth") && prompt.includes("Avoid the default formula"));
});
test("occasion heroes require an active event instead of an empty decorated scene", () => {
  const prompt = buildHeroPrompt({ title: "Halloween Flower Arrangements", topic: "Halloween party table", heroStrategy: "OCCASION_SCENE", heroProductRole: "supporting", heroConcept: "Friends place candles and flowers as guests arrive." });
  assert.match(prompt, /REQUIRED: include at least one naturally framed person/);
  assert.match(prompt, /event in progress/);
  assert.match(prompt, /not an empty decorated room/);
});
test("hero overlay uses real escaped title text", () => {
  const overlay = buildHeroOverlaySvg("Flowers & Gifts <Today>").toString();
  assert.match(overlay, /GREAT FLOWERS JOURNAL/);
  assert.match(overlay, /Flowers &amp; Gifts &lt;Today&gt;/);
  assert.match(overlay, /x="930"/);
  assert.doesNotMatch(overlay, /linearGradient/);
  const longOverlay = buildHeroOverlaySvg("How to Choose Thoughtful Flowers for Every Important Celebration and Personal Milestone").toString();
  assert.ok((longOverlay.match(/class="title"/g) ?? []).length <= 4);
  assert.doesNotMatch(longOverlay, /<text[^>]*class="title"[^>]*>[^<]{50}/);
});
test("blog formats rotate before repeating", () => {
  const history: Array<{ title: string; contentFormat?: "CURATED_LIST" | "PRACTICAL_GUIDE" | "OCCASION_PLAYBOOK" | "QUESTION_EXPLAINER" }> = [];
  const formats = Array.from({ length: 4 }, () => {
    const format = selectBlogFormat(history);
    history.unshift({ title: "Generated post", contentFormat: format });
    return format;
  });
  assert.equal(new Set(formats).size, 4);
  assert.equal(selectBlogFormat(history), formats[0]);
});
test("sensitive topics are forced into a respectful scene without people moments", () => {
  const prompt = buildHeroPrompt({ title: "Sympathy Flowers for a Funeral", topic: "sympathy", heroStrategy: "HUMAN_GIFTING_MOMENT" });
  assert.ok(prompt.includes("OCCASION_SCENE") && prompt.includes("SENSITIVE TOPIC") && !prompt.includes("HUMAN_GIFTING_MOMENT"));
});
test("compositions vary by strategy", () => assert.notEqual(pickComposition("EDITORIAL_CONTENT", () => 0), pickComposition("HUMAN_GIFTING_MOMENT", () => 0)));
