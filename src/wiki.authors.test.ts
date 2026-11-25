import { test } from "node:test";
import assert from "node:assert/strict";
import { isWikiAuthor, selectWikiAuthor, wikiAuthors } from "./wiki.authors.js";
import { greatflowers } from "./projects/index.js";

const WIKI_AUTHORS = wikiAuthors(greatflowers);

test("wiki authors are approved plain US-style bylines", () => {
  assert.ok(WIKI_AUTHORS.includes("Great Flowers Editorial Team"));
  assert.ok(WIKI_AUTHORS.every((name) => /^[A-Z][A-Za-z ]+$/.test(name)));
  assert.equal(isWikiAuthor(greatflowers, "Mason Thomas"), true);
  assert.equal(isWikiAuthor(greatflowers, "Unknown Writer"), false);
});

test("wiki author selection uses one consistent byline", () => {
  const recent = WIKI_AUTHORS.slice(0, 3);
  assert.equal(selectWikiAuthor(greatflowers, [...recent], () => 0), WIKI_AUTHORS[0]);
  assert.equal(selectWikiAuthor(greatflowers, [...recent], () => 0.999), WIKI_AUTHORS[0]);
});
