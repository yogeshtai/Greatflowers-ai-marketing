import assert from "node:assert/strict";
import test from "node:test";
import { buildInstagramCaption, cleanInstagramCaption, formatHashtags, instagramNextAvailableAt } from "./meta.publisher.js";

test("Instagram caption publishing removes embedded hashtags and appends one deduplicated focused block", () => {
  const caption = "A simple flower moment for someone you appreciate.\n\n#GreatFlowers #Roses\n#Roses #FlowerDelivery";
  const hashtags = ["GreatFlowers", "#Roses", "roses", "FlowerDelivery", "GiftFlowers", "ThankYouFlowers", "FreshFlowers", "SendFlowers", "Bouquet", "Appreciation", "ExtraTag"];
  assert.equal(cleanInstagramCaption(caption), "A simple flower moment for someone you appreciate.");
  const published = buildInstagramCaption(caption, hashtags);
  assert.equal((published.match(/#GreatFlowers/g) ?? []).length, 1);
  assert.equal((published.match(/#Roses/gi) ?? []).length, 1);
  assert.equal(published.split(/\s+/).filter((part) => part.startsWith("#")).length, 10);
  assert.equal(formatHashtags([" Roses ", "#roses", "Flower Delivery"]), "#Roses #FlowerDelivery");
});

test("Instagram posting gap waits twelve hours after either manual or automated media", () => {
  const now = new Date("2026-10-17T12:00:00.000Z");
  assert.equal(instagramNextAvailableAt("2026-10-17T06:00:00.000Z", now, 12)?.toISOString(), "2026-10-17T18:00:00.000Z");
  assert.equal(instagramNextAvailableAt("2026-10-16T23:59:59.000Z", now, 12), null);
  assert.equal(instagramNextAvailableAt("2026-10-17T11:00:00.000Z", now, 0), null);
});
