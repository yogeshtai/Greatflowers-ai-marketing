import assert from "node:assert/strict";
import test from "node:test";
import { assertNoTitleCollision, findTitleCollision, titleSimilarity } from "./content.overlap.js";

test("cross-type overlap catches close title variants", () => {
  const inventory = [{ kind: "blog" as const, title: "Beginner Guide to Flower Color Styling", slug: "flower-color-styling" }];
  const collision = findTitleCollision("Flower Color Styling for Beginners", inventory);
  assert.equal(collision?.item.kind, "blog");
  assert.throws(() => assertNoTitleCollision("Flower Color Styling for Beginners", inventory), /update that page instead/);
});

test("generic flower words do not create false collisions", () => {
  const inventory = [{ kind: "wiki" as const, title: "Roses" }];
  assert.equal(findTitleCollision("Five Birthday Flowers for a Sister", inventory), undefined);
  assert.ok(titleSimilarity("Rose Care at Home", "Birthday Flower Delivery") < 0.3);
});
