import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { buildWikiPrompt, resolveWikiLinks, selectWikiSubject, validateWiki, WIKI_SUBJECTS } from "./wiki.generator.js";
import { buildWikiImagePrompt, optimizeWikiImage, WIKI_IMAGE_HEIGHT, WIKI_IMAGE_MIME_TYPE, WIKI_IMAGE_WIDTH } from "./wiki.image.js";
import { beginWikiImageRegeneration, endWikiImageRegeneration, isWikiDraftImagePending } from "./wiki.jobs.js";
import { buildWikiPublishPayload, wikiPublishAfterFor } from "./wiki.publisher.js";

const products = [
  { id: 7, name: "Rose Garden Bouquet", slug: "rose-garden", price: 50, imageUrl: "rose.webp", description: "Red roses arranged with greenery." },
  { id: 8, name: "White Lily Bouquet", slug: "white-lily", price: 45, imageUrl: "lily.webp", description: "White lilies in a clear glass vase." },
  { id: 9, name: "Pink Rose Bouquet", slug: "pink-rose-bouquet", price: 59.97, imageUrl: "pink-rose.webp", description: "Pink roses arranged in a vase." },
];
const subject = WIKI_SUBJECTS[0]!;
const paragraph = `<p>${"Roses are recognized by layered petals and are traditionally associated with many different sentiments. ".repeat(11)}</p>`;
const html = [
  "Overview", "Identification", "Varieties", "Colors and Meanings", "Season and Availability", "Cut Flower Care", "Design Uses", "Gifting", "Frequently Asked Questions",
].map((heading, index) => `<h2>${heading}</h2>${paragraph}${index === 2 ? '<p>See the <a href="PRODUCT:7">Rose Garden Bouquet</a> as one available example.</p>' : index === 6 ? '<p>Compare it with the <a href="PRODUCT:9">Pink Rose Bouquet</a>.</p>' : ""}`).join("") + '<p>Browse <a href="HOME">Great Flowers</a> for related arrangements.</p>';
const base = {
  title: "Roses",
  slug: "roses",
  botanicalName: "Rosa",
  authorName: "Mason Thomas",
  description: "Roses are layered flowering plants valued in gardens, floral design and gifts, with forms and colors suited to many different settings.",
  metaTitle: "Roses: Meanings, Varieties and Care",
  metaDescription: "Learn how to recognize roses, understand their traditional color meanings, care for cut stems and choose them for arrangements and thoughtful gifts.",
  productIds: [7, 9],
  heroProductId: 7,
  imageConcept: "A richly detailed garden rose bloom sits off-center beside one opening bud and a leafy stem on warm natural linen in soft window light.",
  html,
};

test("wiki subject selection prefers catalog relevance and treats singular aliases as existing", () => {
  assert.equal(selectWikiSubject([], products).title, "Roses");
  assert.equal(selectWikiSubject(["Rose"], products).title, "Lilies");
  assert.equal(selectWikiSubject(["Roses"], [{ ...products[0]!, name: "Calla Lily Bouquet", description: "White calla lilies." }]).title, "Calla Lilies");
  assert.throws(() => selectWikiSubject(["Baby's Breath (Gypsophila)"], [{ ...products[0]!, name: "White Tribute", description: "Delicate baby's breath with fresh greenery." }]), /No unused wiki subject/);
  assert.throws(() => selectWikiSubject(["Orchid (Phalaenopsis)"], [{ ...products[0]!, name: "Purple Orchid", description: "Purple orchids." }]), /No unused wiki subject/);
  assert.throws(() => selectWikiSubject([], [{ ...products[0]!, name: "Seasonal Bouquet", description: "Mixed fresh stems." }]), /No unused wiki subject/);
});

test("valid wiki output resolves verified product and home links", () => {
  const wiki = validateWiki(JSON.stringify(base), { subject, existingTitles: [], existingSlugs: [], products, base: "https://greatflowers.net" });
  assert.match(wiki.html, /greatflowers\.net\/product\/rose-garden\//);
  assert.match(wiki.html, /href="https:\/\/greatflowers\.net\/"/);
});

test("existing one-product wiki drafts remain valid", () => {
  const oneProductHtml = html.replace(/<p>Compare it with the <a href="PRODUCT:9">Pink Rose Bouquet<\/a>\.<\/p>/, "");
  const wiki = validateWiki(JSON.stringify({ ...base, productIds: [7], html: oneProductHtml }), {
    subject, existingTitles: [], existingSlugs: [], products, base: "https://greatflowers.net",
  });
  assert.deepEqual(wiki.productIds, [7]);
});

test("wiki validation rejects changed subject identity and unknown links", () => {
  assert.throws(() => validateWiki(JSON.stringify({ ...base, title: "Rose Guide" }), { subject, existingTitles: [], existingSlugs: [], products, base: "https://greatflowers.net" }), /title must be exactly/);
  assert.throws(() => resolveWikiLinks('<p><a href="https://example.com">source</a></p>', products, "https://greatflowers.net"), /not allowed/);
});

test("wiki validation rejects brand duplication, unsupported markup and unselected product links", () => {
  const context = { subject, existingTitles: [], existingSlugs: [], products, base: "https://greatflowers.net" };
  assert.throws(() => validateWiki(JSON.stringify({ ...base, metaTitle: "Roses and Their Meanings | Great Flowers" }), context), /brand name/);
  assert.throws(() => validateWiki(JSON.stringify({ ...base, html: html.replace("<p>", '<p style="color:red">') }), context), /unsupported tags or attributes/);
  assert.throws(() => validateWiki(JSON.stringify({ ...base, html: html.replace('href="HOME"', 'href="PRODUCT:8"') }), context), /not listed in productIds/);
  assert.throws(() => validateWiki(JSON.stringify({ ...base, productIds: [7, 7] }), context), /unique/);
});

test("wiki prompt fixes the subject and requires conservative factual writing", () => {
  const prompt = buildWikiPrompt(subject, products, []);
  assert.match(prompt, /ASSIGNED SUBJECT/);
  assert.match(prompt, /title must be exactly "Roses"/);
  assert.match(prompt, /Do not give medical, edible-use or pet-safety advice/);
  assert.match(prompt, /traditionally associated/);
});

test("wiki slugs remove apostrophes instead of splitting the word", () => {
  const babysBreath = WIKI_SUBJECTS.find((entry) => entry.title === "Baby's Breath")!;
  assert.match(buildWikiPrompt(babysBreath, products, []), /Slug: babys-breath/);
});

test("wiki image prompt uses the storefront's 4:3 slot and forbids text", () => {
  const prompt = buildWikiImagePrompt(base);
  assert.match(prompt, /4:3/);
  assert.match(prompt, /botanically recognizable/);
  assert.match(prompt, /no text/);
});
test("wiki images are encoded as correctly sized progressive JPEGs", async () => {
  const source = await sharp({ create: { width: 80, height: 80, channels: 3, background: "#f3eadc" } }).png().toBuffer();
  const output = await optimizeWikiImage(source);
  const metadata = await sharp(output).metadata();
  assert.equal(WIKI_IMAGE_MIME_TYPE, "image/jpeg");
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, WIKI_IMAGE_WIDTH);
  assert.equal(metadata.height, WIKI_IMAGE_HEIGHT);
  assert.equal(metadata.isProgressive, true);
});

test("manual image regeneration is exposed as pending to approval and publishing", () => {
  const draft = { id: "1f769b3f-21f6-4aa0-95b6-0c818b09c585", createdAt: new Date(0).toISOString() };
  assert.equal(beginWikiImageRegeneration(draft.id), true);
  assert.equal(beginWikiImageRegeneration(draft.id), false);
  assert.equal(isWikiDraftImagePending(draft), true);
  endWikiImageRegeneration(draft.id);
  assert.equal(isWikiDraftImagePending(draft), false);
});

test("wiki publish mode defaults to immediate and supports scheduled mode", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  try {
    delete process.env.WIKI_PUBLISH_MODE;
    assert.equal(wikiPublishAfterFor(now).toISOString(), now.toISOString());
    process.env.WIKI_PUBLISH_MODE = "scheduled";
    assert.equal(wikiPublishAfterFor(now).toISOString(), "2026-10-12T14:00:00.000Z");
  } finally {
    delete process.env.WIKI_PUBLISH_MODE;
  }
});

test("wiki publish payload attaches products and removes legacy inline embeds", () => {
  const draft = {
    ...base,
    id: "1f769b3f-21f6-4aa0-95b6-0c818b09c585",
    status: "approved" as const,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    attempts: 0,
    environment: "example.test",
    html: `${base.html}<div class="blog-product-embed" data-product-id="7"></div>`,
  };
  const payload = buildWikiPublishPayload(draft, 42, 1, [products[0]!, products[2]!], "https://greatflowers.net");
  assert.deepEqual(payload.products, [7, 9]);
  assert.equal(payload.wiki_thumbnail_id, 42);
  assert.equal(payload.status, 1);
  assert.doesNotMatch(payload.content, /blog-product-embed/);
  assert.match(payload.content, /^<p><strong>Same Day Delivery<\/strong>&nbsp;<\/p>/);
  assert.match(payload.content, /<figure class="image"><img src="rose\.webp" alt="Rose Garden Bouquet"><\/figure>/);
  assert.match(payload.content, /href="https:\/\/greatflowers\.net\/product\/rose-garden"/);
  assert.match(payload.content, /<strong>From \$50\.00<\/strong>/);
  assert.match(payload.content, /<figure class="image"><img src="pink-rose\.webp" alt="Pink Rose Bouquet"><\/figure>/);
  assert.match(payload.content, /href="https:\/\/greatflowers\.net\/product\/pink-rose-bouquet"/);
  assert.match(payload.content, /<strong>From \$59\.97<\/strong>/);
});
