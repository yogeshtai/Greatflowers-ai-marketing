import assert from "node:assert/strict";
import test from "node:test";
import { contentAuthors, isContentAuthor, selectContentAuthor } from "./content.authors.js";
import { blogEditSchema } from "./blog.schema.js";
import { greatflowers, onepriceflowers } from "./projects/index.js";

const CONTENT_AUTHORS = contentAuthors(greatflowers);

test("content authors are approved plain US-style bylines", () => {
  assert.equal(CONTENT_AUTHORS.length, 9);
  assert.equal(new Set(CONTENT_AUTHORS).size, CONTENT_AUTHORS.length);
  for (const author of CONTENT_AUTHORS) assert.match(author, /^[A-Z][A-Za-z ]+$/);
  assert.equal(isContentAuthor(greatflowers, "Mason Thomas"), true);
  assert.equal(isContentAuthor(greatflowers, "Unknown Writer"), false);
});

test("content author selection uses one consistent byline", () => {
  const recent = [CONTENT_AUTHORS[0], CONTENT_AUTHORS[1], CONTENT_AUTHORS[2]];
  assert.equal(selectContentAuthor(greatflowers, recent, () => 0), CONTENT_AUTHORS[0]);
  assert.equal(selectContentAuthor(greatflowers, recent, () => 0.999), CONTENT_AUTHORS[0]);
});

test("blog edits accept only an approved author", () => {
  assert.equal(blogEditSchema(greatflowers).parse({ authorName: "Mason Thomas" }).authorName, "Mason Thomas");
  assert.throws(() => blogEditSchema(greatflowers).parse({ authorName: "Unknown Writer" }));
});

test("each project has its own byline and never accepts another brand's authors", () => {
  assert.equal(selectContentAuthor(onepriceflowers, ["Great Flowers Editorial Team"]), "One Price Flowers");
  assert.equal(isContentAuthor(onepriceflowers, "Great Flowers Editorial Team"), false);
  assert.equal(isContentAuthor(greatflowers, "One Price Flowers"), false);
  assert.throws(() => blogEditSchema(onepriceflowers).parse({ authorName: "Mason Thomas" }));
  assert.equal(blogEditSchema(onepriceflowers).parse({ authorName: "One Price Flowers" }).authorName, "One Price Flowers");
});
