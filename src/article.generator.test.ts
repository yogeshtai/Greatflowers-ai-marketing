import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { buildArticlePrompt, resolveArticleLinks, selectArticleFormat, selectArticleTopic, validateArticle } from "./article.generator.js";
import { buildArticleImagePrompt, optimizeArticleImage, ARTICLE_IMAGE_HEIGHT, ARTICLE_IMAGE_MIME_TYPE, ARTICLE_IMAGE_WIDTH } from "./article.image.js";
import { articlePublishAfterFor } from "./article.publisher.js";
import { ARTICLE_DRAFT_CRON } from "./article.scheduler.js";

const products = [
  { id: 7, name: "Rose Garden Bouquet", slug: "rose-garden", price: 50, imageUrl: "rose.webp", description: "Red roses arranged with greenery." },
  { id: 8, name: "Sunshine Bouquet", slug: "sunshine", price: 45, imageUrl: "sun.webp", description: "Yellow sunflowers with seasonal greenery." },
];
const paragraph = `<p>${"Choose flowers around the recipient, setting and timing, then use verified product details to make a confident and thoughtful decision. ".repeat(14)}</p>`;
const articleHtml = ["Start With the Recipient", "Match the Setting", "Choose a Useful Palette", "Plan the Timing", "Avoid Common Mistakes", "Add a Personal Message", "Prepare for Delivery", "Final Checklist"]
  .map((heading, index) => `<h2>${heading}</h2>${paragraph}${index === 1 ? '<p>Consider the <a href="PRODUCT:7">Rose Garden Bouquet</a>.</p>' : ""}${index === 3 ? '<p>Another option is the <a href="PRODUCT:8">Sunshine Bouquet</a>.</p>' : ""}`)
  .join("") + '<p>Explore <a href="HOME">Great Flowers</a> for a thoughtful arrangement.</p>';

test("article topic selection favors the least-used configured topic", () => {
  assert.equal(selectArticleTopic(["Flower Care", "Floral Design", "Seasonal"], ["Flower Care", "Seasonal", "Flower Care"]), "Floral Design");
  assert.throws(() => selectArticleTopic([], []), /No Article Topics/);
});

test("article formats rotate instead of repeatedly choosing one structure", () => {
  assert.equal(selectArticleFormat([]), "DEEP_GUIDE");
  assert.equal(selectArticleFormat([{ format: "DEEP_GUIDE" }]), "HOW_TO");
});

test("article prompt fixes topic, format and distinct editorial direction", () => {
  const prompt = buildArticlePrompt({ topic: "Floral Design", direction: "texture and movement", format: "STYLE_PLAYBOOK", authorName: "Mason Thomas", existingTitles: [], products, related: [] });
  assert.match(prompt, /Admin topic \(use exactly\): Floral Design/);
  assert.match(prompt, /Required editorial format \(use exactly\): STYLE_PLAYBOOK/);
  assert.match(prompt, /Fresh angle: texture and movement/);
  assert.match(prompt, /Avoid repeatedly using listicle titles/);
});

test("article links resolve only verified products, articles and home", () => {
  const html = '<p><a href="PRODUCT:7">Roses</a> and <a href="ARTICLE:care-guide">care</a>. Visit <a href="HOME">Great Flowers</a>.</p>';
  const resolved = resolveArticleLinks(html, products, new Set(["care-guide"]), "https://greatflowers.net");
  assert.match(resolved, /product\/rose-garden\//);
  assert.match(resolved, /greatflowers-articles\/care-guide\//);
  assert.throws(() => resolveArticleLinks('<p><a href="https://example.com">bad</a></p>', products, new Set(), "https://greatflowers.net"), /not allowed/);
});

test("valid article output enforces its assigned taxonomy, format, author and verified products", () => {
  const output = JSON.stringify({
    title: "How to Choose Flowers for a Thoughtful Gift",
    slug: "how-to-choose-flowers-for-a-thoughtful-gift",
    topic: "Gift Guides",
    format: "HOW_TO",
    authorName: "Mason Thomas",
    description: "A practical guide to matching flowers with the recipient, setting and delivery timing for a personal gift that feels considered.",
    metaTitle: "How to Choose Flowers for a Gift",
    metaDescription: "Learn how to choose gift flowers by recipient, setting, color and timing, with practical planning tips for a thoughtful and personal delivery.",
    productIds: [7, 8],
    heroProductId: 7,
    imageConcept: "A friend offers a rose bouquet at a bright apartment doorway while the recipient reaches forward, with warm afternoon layers behind them.",
    html: articleHtml,
  });
  const result = validateArticle(output, { topic: "Gift Guides", format: "HOW_TO", authorName: "Mason Thomas", existingTitles: [], existingSlugs: [], products, relatedSlugs: new Set(), base: "https://greatflowers.net" });
  assert.match(result.html, /product\/rose-garden\//);
  assert.match(result.html, /href="https:\/\/greatflowers\.net\/"/);
  assert.throws(() => validateArticle(output, { topic: "Seasonal", format: "HOW_TO", authorName: "Mason Thomas", existingTitles: [], existingSlugs: [], products, relatedSlugs: new Set(), base: "https://greatflowers.net" }), /topic must be exactly/);
});

test("article image prompt is text-free 16:9 and output is optimized JPEG", async () => {
  const prompt = buildArticleImagePrompt({ title: "A Practical Rose Care Guide", topic: "Flower Care", imageConcept: "A florist trims rose stems beside a sunlit kitchen sink with layered greenery and tools in the background." });
  assert.match(prompt, /16:9/);
  assert.match(prompt, /no text/i);
  const source = await sharp({ create: { width: 80, height: 80, channels: 3, background: "#eadbd8" } }).png().toBuffer();
  const output = await optimizeArticleImage(source);
  const metadata = await sharp(output).metadata();
  assert.equal(ARTICLE_IMAGE_MIME_TYPE, "image/jpeg");
  assert.equal(metadata.width, ARTICLE_IMAGE_WIDTH);
  assert.equal(metadata.height, ARTICLE_IMAGE_HEIGHT);
  assert.equal(metadata.isProgressive, true);
});

test("article publish mode defaults to immediate and supports scheduled mode", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  try {
    delete process.env.ARTICLE_PUBLISH_MODE;
    assert.equal(articlePublishAfterFor(now).toISOString(), now.toISOString());
    process.env.ARTICLE_PUBLISH_MODE = "scheduled";
    assert.equal(articlePublishAfterFor(now).toISOString(), "2026-10-17T14:00:00.000Z");
  } finally { delete process.env.ARTICLE_PUBLISH_MODE; }
});

test("article daily draft schedule is 6:30 PM IST", () => {
  assert.equal(ARTICLE_DRAFT_CRON, "30 18 * * *");
});
