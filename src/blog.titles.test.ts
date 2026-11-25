import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  addBlogTitles,
  assertAssignedTitle,
  checkBlogTitle,
  claimBlogTitle,
  cleanTitleLine,
  completeBlogTitle,
  deleteBlogTitle,
  getBlogTitles,
  releaseBlogTitle,
  resetStaleWritingTitles,
  titleSeason,
  updateBlogTitle,
  type BlogTitle,
} from "./blog.titles.js";
import { eligibleTitles, fallbackPick, pickBlogTitle, resolveTitleAssignment, type AskModel, type SelectionContext } from "./blog.title-selector.js";
import { BlogGenerateRequestSchema } from "./blog.schema.js";
import { scheduledTitleSource } from "./blog.scheduler.js";
import { greatflowers, onepriceflowers } from "./projects/index.js";
import type { ContentTitle } from "./content.overlap.js";

const today = new Date("2026-11-25T10:00:00Z");
const inventory: ContentTitle[] = [
  { kind: "blog", title: "Best Thanksgiving Centerpiece Flowers for Hosts", slug: "thanksgiving-centerpieces" },
  { kind: "wiki", title: "Poinsettias", slug: "poinsettias" },
];
const products = [{ id: 7, name: "Red Rose Bouquet", slug: "red-rose-bouquet", price: 40, imageUrl: "x", description: "Red roses in a glass vase." }];

async function inTempDir(run: () => Promise<void>) {
  const originalCwd = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), "blog-titles-"));
  try {
    process.chdir(directory);
    await run();
  } finally {
    process.chdir(originalCwd);
    await rm(directory, { recursive: true, force: true });
  }
}

const title = (overrides: Partial<BlogTitle> & { title: string }): BlogTitle => ({
  id: overrides.title, status: "queued", warnings: [], addedAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", attempts: 0, ...overrides,
});

test("pasted lines lose bullets, numbering and quotes but keep a title's own number", () => {
  assert.equal(cleanTitleLine("  - Christmas Flowers for a Cozy Living Room "), "Christmas Flowers for a Cozy Living Room");
  assert.equal(cleanTitleLine("1. Christmas Flowers for a Cozy Living Room"), "Christmas Flowers for a Cozy Living Room");
  assert.equal(cleanTitleLine("(2) Holiday Hostess Flowers"), "Holiday Hostess Flowers");
  assert.equal(cleanTitleLine("• “Winter White Bouquets for December”"), "Winter White Bouquets for December");
  assert.equal(cleanTitleLine("5 Best Christmas Bouquets for Coworkers"), "5 Best Christmas Bouquets for Coworkers");
  assert.equal(cleanTitleLine("   "), "");
});

test("import checks reject titles the writer could not use", () => {
  const ctx = { inventory, listTitles: ["Christmas Flowers for a Cozy Living Room"], today };
  assert.match((checkBlogTitle("Short", ctx) as { reason: string }).reason, /Too short/);
  assert.match((checkBlogTitle("x".repeat(121), ctx) as { reason: string }).reason, /Too long/);
  assert.match((checkBlogTitle("Free Delivery Christmas Bouquets for Everyone", ctx) as { reason: string }).reason, /free delivery/);
  assert.match((checkBlogTitle("Christmas Roses Delivered, Guaranteed by Dec 24", ctx) as { reason: string }).reason, /guaranteed delivery/);
  assert.match((checkBlogTitle("20% Off Holiday Flower Gifts This Week", ctx) as { reason: string }).reason, /discount or promo code/);
  assert.match((checkBlogTitle("christmas flowers for a cozy living room", ctx) as { reason: string }).reason, /Already in your title list/);
  const overlap = checkBlogTitle("Best Thanksgiving Centerpiece Flowers for Hosts", ctx) as { reason: string };
  assert.match(overlap.reason, /Overlaps the existing blog "Best Thanksgiving Centerpiece Flowers for Hosts"/);
});

test("import checks warn without blocking", () => {
  const ctx = { inventory, listTitles: ["Christmas Flowers for a Cozy Living Room Table"], today };
  const long = checkBlogTitle("Christmas Eve Dinner Flowers That Make a Small Apartment Feel Festive and Bright", ctx);
  assert.ok(long.ok && long.warnings.some((w) => /Longer than 60/.test(w)));
  const howTo = checkBlogTitle("How to Keep a Christmas Bouquet Fresh All Week", ctx);
  assert.ok(howTo.ok && howTo.warnings.some((w) => /suit Articles/.test(w)));
  const seasonal = checkBlogTitle("Mother's Day Flowers for a Long-Distance Mom", ctx);
  assert.ok(seasonal.ok && seasonal.warnings.some((w) => /Waits for Mother's Day \(May 9\)/.test(w)));
  const listy = checkBlogTitle("10 Christmas Bouquets for Every Person on Your List", ctx);
  assert.ok(listy.ok && listy.warnings.some((w) => /Promises 10 picks/.test(w)));
  const similar = checkBlogTitle("Christmas Flowers for Cozy Living Room Tables", ctx);
  assert.ok(similar.ok && similar.warnings.some((w) => /Very similar to/.test(w)));
  const clean = checkBlogTitle("Christmas Centerpieces That Leave Room for Dinner", ctx);
  assert.deepEqual(clean, { ok: true, warnings: [] });
});

test("seasonal titles wait until their occasion is within 60 days; evergreen titles are always ready", () => {
  assert.deepEqual(titleSeason("Christmas Centerpieces That Leave Room for Dinner", today), { occasion: { name: "Christmas", date: "2026-12-25", daysUntil: 30 }, ready: true });
  assert.equal(titleSeason("New Year's Eve Party Flowers for Small Spaces", today).ready, true);
  assert.equal(titleSeason("Valentine's Day Roses Beyond the Classic Dozen", today).occasion?.name, "Valentine's Day");
  assert.equal(titleSeason("Valentine's Day Roses Beyond the Classic Dozen", today).ready, false);
  assert.equal(titleSeason("Thanksgiving Hostess Flowers", today).ready, true, "Thanksgiving is tomorrow");
  assert.equal(titleSeason("Thanksgiving Hostess Flowers", new Date("2026-11-27T10:00:00Z")).ready, false, "just passed, so it waits for next year");
  assert.deepEqual(titleSeason("Thank You Flowers for a Helpful Neighbor", today), { ready: true });
});

test("the written title must be the assigned one; long titles may only be shortened", () => {
  assertAssignedTitle("christmas centerpieces that leave room for dinner", "Christmas Centerpieces That Leave Room for Dinner");
  assertAssignedTitle("Christmas Centerpieces That Leave Room for Dinner!", "Christmas Centerpieces That Leave Room for Dinner");
  assert.throws(() => assertAssignedTitle("Holiday Centerpieces for Dinner", "Christmas Centerpieces That Leave Room for Dinner"), /exactly the assigned title/);
  const long = "Christmas Eve Dinner Flowers That Make a Small Apartment Feel Festive and Bright";
  assertAssignedTitle("Christmas Eve Dinner Flowers for Small Apartments", long);
  assert.throws(() => assertAssignedTitle("Winter Bouquets for Cozy Holiday Parties", long), /shortened version/);
});

test("title list lifecycle: add, write, finish, fail and restore", async () => {
  await inTempDir(async () => {
    const result = await addBlogTitles(onepriceflowers, [
      "1. Christmas Centerpieces That Leave Room for Dinner",
      "christmas centerpieces that leave room for dinner",
      "",
      "Free Shipping Holiday Bouquets for the Whole Family",
      "Winter White Bouquets for a Quiet December Weekend",
    ], inventory, today);
    assert.deepEqual(result.added.map((t) => t.title), ["Christmas Centerpieces That Leave Room for Dinner", "Winter White Bouquets for a Quiet December Weekend"]);
    assert.deepEqual(result.rejected.map((r) => r.title), ["christmas centerpieces that leave room for dinner", "Free Shipping Holiday Bouquets for the Whole Family"]);
    assert.ok(existsSync("data/projects/onepriceflowers/blog-titles.json"));
    assert.equal(existsSync("data/blog-titles.json"), false, "GreatFlowers' list was not touched");
    assert.equal((await getBlogTitles(greatflowers)).length, 0);

    const [first, second] = result.added as [BlogTitle, BlogTitle];
    await claimBlogTitle(onepriceflowers, first.id, "Christmas is four weeks away.");
    assert.equal(await deleteBlogTitle(onepriceflowers, first.id), "writing", "a title being written cannot be deleted");
    await completeBlogTitle(onepriceflowers, first.id, { id: "draft-1", title: first.title });
    const used = (await getBlogTitles(onepriceflowers)).find((t) => t.id === first.id)!;
    assert.equal(used.status, "used");
    assert.equal(used.draftId, "draft-1");
    assert.equal(used.selectionReason, "Christmas is four weeks away.");

    await claimBlogTitle(onepriceflowers, second.id, "Pinned.");
    await releaseBlogTitle(onepriceflowers, second.id, "Hermes timed out");
    let failing = (await getBlogTitles(onepriceflowers)).find((t) => t.id === second.id)!;
    assert.equal(failing.status, "queued");
    assert.equal(failing.attempts, 1);
    await releaseBlogTitle(onepriceflowers, second.id, "Hermes timed out again");
    failing = (await getBlogTitles(onepriceflowers)).find((t) => t.id === second.id)!;
    assert.equal(failing.status, "failed");
    assert.equal(failing.error, "Hermes timed out again");

    await updateBlogTitle(onepriceflowers, second.id, (t) => ({ ...t, status: "writing" }));
    assert.equal(await resetStaleWritingTitles(onepriceflowers), 1, "a title left writing by a restart goes back to the queue");
    assert.equal((await getBlogTitles(onepriceflowers)).find((t) => t.id === second.id)!.status, "queued");
    assert.equal(await deleteBlogTitle(onepriceflowers, second.id), "deleted");
  });
});

test("eligible titles: overlapping ones are set aside, seasonal ones wait unless pinned", () => {
  const titles = [
    title({ title: "Christmas Centerpieces That Leave Room for Dinner" }),
    title({ title: "Valentine's Day Roses Beyond the Classic Dozen" }),
    title({ title: "Mother's Day Brunch Flowers", pinned: true }),
    title({ title: "Best Thanksgiving Centerpiece Flowers for Hosts" }),
    title({ title: "Winter White Bouquets for a Quiet December Weekend", status: "used" }),
  ];
  const { eligible, overlapping } = eligibleTitles(titles, { inventory, today });
  assert.deepEqual(eligible.map((t) => t.title), ["Christmas Centerpieces That Leave Room for Dinner", "Mother's Day Brunch Flowers"]);
  assert.deepEqual(overlapping.map((o) => o.title.title), ["Best Thanksgiving Centerpiece Flowers for Hosts"]);
  assert.equal(fallbackPick([title({ title: "Winter Hostess Gifts", addedAt: "2026-10-01T00:00:00Z" }), title({ title: "Christmas Table Flowers" })], today).title, "Christmas Table Flowers", "the soonest seasonal title wins");
});

test("AI pick: pinned first, single title without asking, AI choice validated, fallback on failure", async () => {
  const ctx: SelectionContext = { inventory, recentTitles: ["Thanksgiving Host Gifts"], products, today };
  const candidates = [title({ title: "Winter Hostess Gifts", addedAt: "2026-10-01T00:00:00Z" }), title({ title: "Christmas Table Flowers", addedAt: "2026-10-02T00:00:00Z" })];
  let asked = 0;
  const neverAsk: AskModel = async () => { asked++; throw new Error("should not ask"); };
  assert.equal((await pickBlogTitle(onepriceflowers, [...candidates, title({ title: "Pinned Pick", pinned: true })], ctx, neverAsk)).method, "pinned");
  assert.equal((await pickBlogTitle(onepriceflowers, [candidates[0]!], ctx, neverAsk)).method, "only");
  assert.equal(asked, 0);

  let prompt = "";
  const choosesSecond: AskModel = async (text, validate) => { prompt = text; return validate(JSON.stringify({ titleKey: "t2", reason: "Christmas is a month away and the red roses suit it." })); };
  const ai = await pickBlogTitle(onepriceflowers, candidates, ctx, choosesSecond);
  assert.equal(ai.method, "ai");
  assert.equal(ai.title.title, "Christmas Table Flowers");
  assert.match(prompt, /t1: "Winter Hostess Gifts" \[evergreen\]/);
  assert.match(prompt, /t2: "Christmas Table Flowers" \[Christmas in 30 days\]/);
  assert.match(prompt, /One Price Flowers \(onepriceflowers\.com\)/);
  assert.doesNotMatch(prompt, /great\s*flowers/i);

  const inventsKey: AskModel = async (_text, validate) => validate(JSON.stringify({ titleKey: "t9", reason: "A title that does not exist in the list." }));
  const fallback = await pickBlogTitle(onepriceflowers, candidates, ctx, inventsKey);
  assert.equal(fallback.method, "fallback");
  assert.equal(fallback.title.title, "Christmas Table Flowers");
});

test("resolving a run's title: claims the pick, scheduled runs fall back when the list has nothing ready", async () => {
  await inTempDir(async () => {
    const ctx: SelectionContext = { inventory, recentTitles: [], products, today };
    const neverAsk: AskModel = async () => { throw new Error("should not ask"); };
    assert.equal(await resolveTitleAssignment(greatflowers, { kind: "pick", fallbackToAuto: true }, ctx, neverAsk), undefined, "empty list: the usual calendar-led post");
    await assert.rejects(resolveTitleAssignment(greatflowers, { kind: "pick", fallbackToAuto: false }, ctx, neverAsk), /No ready titles/);

    const { added } = await addBlogTitles(greatflowers, ["Christmas Centerpieces That Leave Room for Dinner", "Valentine's Day Roses Beyond the Classic Dozen"], inventory, today);
    const assignment = await resolveTitleAssignment(greatflowers, { kind: "pick", fallbackToAuto: true }, ctx, neverAsk);
    assert.deepEqual(assignment && { title: assignment.title, method: assignment.method }, { title: "Christmas Centerpieces That Leave Room for Dinner", method: "only" });
    assert.equal((await getBlogTitles(greatflowers)).find((t) => t.id === added[0]!.id)!.status, "writing");

    // A chosen title that now overlaps published content is skipped with the reason.
    const overlapCtx = { ...ctx, inventory: [...inventory, { kind: "blog" as const, title: "Valentine's Day Roses Beyond the Classic Dozen" }] };
    await assert.rejects(resolveTitleAssignment(greatflowers, { kind: "title", titleId: added[1]!.id }, overlapCtx, neverAsk), /now overlaps the existing blog/);
    const skipped = (await getBlogTitles(greatflowers)).find((t) => t.id === added[1]!.id)!;
    assert.equal(skipped.status, "skipped");
  });
});

test("a manual draft takes one steer: an occasion, a list title, or an AI pick", () => {
  assert.equal(BlogGenerateRequestSchema.parse({ source: "title-list" }).source, "title-list");
  assert.equal(BlogGenerateRequestSchema.parse({ titleId: "7d9f1c4e-3b2a-4c1d-9e8f-0a1b2c3d4e5f" }).titleId, "7d9f1c4e-3b2a-4c1d-9e8f-0a1b2c3d4e5f");
  assert.throws(() => BlogGenerateRequestSchema.parse({ occasion: "Christmas", source: "title-list" }), /not more than one/);
  assert.throws(() => BlogGenerateRequestSchema.parse({ titleId: "not-a-uuid" }));
});

test("scheduled drafts use the title list unless BLOG_TITLE_LIST=false", (t) => {
  for (const name of ["BLOG_TITLE_LIST", "OPF_BLOG_TITLE_LIST"]) {
    const previous = process.env[name];
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
    delete process.env[name];
  }
  assert.deepEqual(scheduledTitleSource(greatflowers), { kind: "pick", fallbackToAuto: true });
  assert.deepEqual(scheduledTitleSource(onepriceflowers), { kind: "pick", fallbackToAuto: true });
  process.env.OPF_BLOG_TITLE_LIST = "false";
  assert.equal(scheduledTitleSource(onepriceflowers), undefined);
  assert.deepEqual(scheduledTitleSource(greatflowers), { kind: "pick", fallbackToAuto: true }, "each brand has its own switch");
});
