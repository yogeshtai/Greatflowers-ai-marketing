import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWikiPrompt, resolveWikiLinks, selectWikiSubject, validateWiki, WIKI_SUBJECTS } from "./wiki.generator.js";
import { buildWikiImagePrompt } from "./wiki.image.js";
import { beginWikiImageRegeneration, endWikiImageRegeneration, isWikiDraftImagePending } from "./wiki.jobs.js";
import { wikiPublishAfterFor } from "./wiki.publisher.js";

const products = [
  { id: 7, name: "Rose Garden Bouquet", slug: "rose-garden", price: 50, imageUrl: "rose.webp", description: "Red roses arranged with greenery." },
  { id: 8, name: "White Lily Bouquet", slug: "white-lily", price: 45, imageUrl: "lily.webp", description: "White lilies in a clear glass vase." },
];
const subject = WIKI_SUBJECTS[0]!;
const paragraph = `<p>${"Roses are recognized by layered petals and are traditionally associated with many different sentiments. ".repeat(11)}</p>`;
const html = [
  "Overview", "Identification", "Varieties", "Colors and Meanings", "Season and Availability", "Cut Flower Care", "Design Uses", "Gifting", "Frequently Asked Questions",
].map((heading, index) => `<h2>${heading}</h2>${paragraph}${index === 2 ? '<p>See the <a href="PRODUCT:7">Rose Garden Bouquet</a> as one available example.</p>' : ""}`).join("") + '<p>Browse <a href="HOME">Great Flowers</a> for related arrangements.</p>';
const base = {
  title: "Roses",
  slug: "roses",
  botanicalName: "Rosa",
  authorName: "Great Flowers Editorial Team",
  description: "Roses are layered flowering plants valued in gardens, floral design and gifts, with forms and colors suited to many different settings.",
  metaTitle: "Roses: Meanings, Varieties and Care",
  metaDescription: "Learn how to recognize roses, understand their traditional color meanings, care for cut stems and choose them for arrangements and thoughtful gifts.",
  productIds: [7],
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
