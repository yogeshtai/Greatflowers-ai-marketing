import assert from "node:assert/strict";
import test from "node:test";
import { CONTENT_AUTHORS, isContentAuthor, selectContentAuthor } from "./content.authors.js";
import { BlogEditSchema } from "./blog.schema.js";

test("content authors are approved plain US-style bylines", () => {
  assert.equal(CONTENT_AUTHORS.length, 9);
  assert.equal(new Set(CONTENT_AUTHORS).size, CONTENT_AUTHORS.length);
  for (const author of CONTENT_AUTHORS) assert.match(author, /^[A-Z][A-Za-z ]+$/);
  assert.equal(isContentAuthor("Mason Thomas"), true);
  assert.equal(isContentAuthor("Unknown Writer"), false);
});

test("content author selection uses one consistent byline", () => {
  const recent = [CONTENT_AUTHORS[0], CONTENT_AUTHORS[1], CONTENT_AUTHORS[2]];
  assert.equal(selectContentAuthor(recent, () => 0), CONTENT_AUTHORS[0]);
  assert.equal(selectContentAuthor(recent, () => 0.999), CONTENT_AUTHORS[0]);
});

test("blog edits accept only an approved author", () => {
  assert.equal(BlogEditSchema.parse({ authorName: "Mason Thomas" }).authorName, "Mason Thomas");
  assert.throws(() => BlogEditSchema.parse({ authorName: "Unknown Writer" }));
});
