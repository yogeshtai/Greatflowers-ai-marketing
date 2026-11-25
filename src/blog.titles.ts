import { randomUUID } from "node:crypto";
import { inferredFormat } from "./blog.schema.js";
import { contentTitleTokens, findTitleCollision, normalizeContentTitle, type ContentTitle } from "./content.overlap.js";
import { readJsonArray, withFileLock, writeJsonAtomic } from "./json.file.js";
import { getUpcomingOccasions } from "./occasion.calendar.js";
import { projectDataPath, type ProjectConfig } from "./projects/index.js";

// Each brand keeps a list of blog titles to write. Scheduled and manual runs can take their topic
// from it: the AI picks the most suitable ready title and the writer must use that title.

export const BLOG_TITLE_STATUSES = ["queued", "writing", "used", "skipped", "failed"] as const;
export type BlogTitleStatus = (typeof BLOG_TITLE_STATUSES)[number];

export interface BlogTitle {
  id: string;
  title: string;
  status: BlogTitleStatus;
  /** A pinned title is written next, before the AI's choice and regardless of its season. */
  pinned?: boolean;
  /** Notes from the import checks that do not block the title. */
  warnings: string[];
  addedAt: string;
  updatedAt: string;
  /** Failed generation attempts; the title is marked failed after MAX_TITLE_ATTEMPTS. */
  attempts: number;
  error?: string;
  usedAt?: string;
  draftId?: string;
  /** The title the post was published with (shorter than the list title when that was over 60 characters). */
  draftTitle?: string;
  selectionReason?: string;
}

/** The blog title limit; longer list titles are shortened by the writer. */
export const TITLE_MAX = 60;
const TITLE_MIN = 10;
const TITLE_HARD_MAX = 120;
const TITLE_GOOD_MIN = 35;
export const MAX_TITLE_ATTEMPTS = 2;
/** A title for a dated occasion becomes ready this many days before it (blog posts need lead time to rank). */
export const SEASON_LEAD_DAYS = 60;

// Claims a post is never allowed to make, so a title that promises one cannot be written.
const FORBIDDEN_CLAIMS: Array<[RegExp, string]> = [
  [/\bfree\s+(same[- ]day\s+)?(delivery|shipping)\b/i, '"free delivery" or "free shipping"'],
  [/\btax[- ]free\b|\bno\s+tax\b/i, '"tax-free"'],
  [/\b\d+\s*%\s*off\b|\bcoupons?\b|\bpromo\s*codes?\b|\bdiscount\s+codes?\b/i, "a discount or promo code"],
  [/\bguaranteed?\b[^.]*\b(deliver|arriv)|\b(deliver|arriv)\w*\b[^.]*\bguaranteed?\b/i, "guaranteed delivery"],
  [/\b(every|all)\s+bouquets?\s+(costs?|is|are)\s+(the\s+)?same\b|\bsame\s+price\s+for\s+(every|all)\b/i, '"every bouquet costs the same"'],
];

// Dated occasions from the calendar, matched against a title with apostrophes removed and
// hyphens turned into spaces ("Mother's Day" -> "mothers day").
const OCCASION_PATTERNS: Record<string, RegExp> = {
  "Valentine's Day": /\bvalentines?\b/,
  "Mother's Day": /\bmothers? day\b/,
  Easter: /\beaster\b/,
  "Administrative Professionals Day": /\badministrative professionals?\b/,
  "Graduation Season": /\bgraduat/,
  "Father's Day": /\bfathers? day\b/,
  "Independence Day": /\bindependence day\b|\b(fourth|4th) of july\b|\bjuly (4|4th|fourth)\b/,
  "Back to School": /\bback to school\b/,
  "Grandparents Day": /\bgrandparents? day\b/,
  Halloween: /\bhalloween\b/,
  Thanksgiving: /\bthanksgiving\b|\bfriendsgiving\b/,
  Christmas: /\bchristmas\b|\bxmas\b/,
  Hanukkah: /\bhanukkah\b|\bchanukah\b/,
  "New Year": /\bnew years?\b/,
};

const forMatching = (value: string) => value.toLowerCase().replace(/[’']/g, "").replace(/[-_/]+/g, " ").replace(/\s+/g, " ");

export interface TitleSeason {
  /** The dated occasion the title is about, if any. */
  occasion?: { name: string; date: string; daysUntil: number };
  /** False while a seasonal title's occasion is more than SEASON_LEAD_DAYS away. */
  ready: boolean;
}

export function titleSeason(title: string, today: Date = new Date()): TitleSeason {
  const text = forMatching(title);
  const occasion = getUpcomingOccasions(370, today)
    .filter((upcoming) => OCCASION_PATTERNS[upcoming.name]?.test(text))
    .sort((a, b) => a.daysUntil - b.daysUntil)[0];
  return occasion ? { occasion, ready: occasion.daysUntil <= SEASON_LEAD_DAYS } : { ready: true };
}

const shortDate = (isoDate: string) => new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Strips list bullets, "1." or "1)" numbering and surrounding quotes from a pasted line.
// A leading number that is part of the title ("5 Best Bouquets...") is kept.
export function cleanTitleLine(line: string): string {
  let title = line
    .replace(/^\s*(?:[-*•–—]+|\(?\d{1,3}[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  const quoted = title.match(/^["“'‘](.+)["”'’]$/);
  if (quoted) title = quoted[1]!.trim();
  return title;
}

export type TitleCheck = { ok: true; warnings: string[] } | { ok: false; reason: string };

// The import checks. Rejections are titles the writer could not use; warnings are shown but do not block.
export function checkBlogTitle(title: string, ctx: { inventory: ContentTitle[]; listTitles: string[]; today?: Date }): TitleCheck {
  if (title.length < TITLE_MIN) return { ok: false, reason: `Too short: titles need at least ${TITLE_MIN} characters.` };
  if (title.length > TITLE_HARD_MAX) return { ok: false, reason: `Too long: titles can have at most ${TITLE_HARD_MAX} characters.` };
  const claim = FORBIDDEN_CLAIMS.find(([pattern]) => pattern.test(title));
  if (claim) return { ok: false, reason: `Promises ${claim[1]}, which posts are not allowed to claim.` };
  const normalized = normalizeContentTitle(title);
  if (ctx.listTitles.some((existing) => normalizeContentTitle(existing) === normalized)) return { ok: false, reason: "Already in your title list." };
  const collision = findTitleCollision(title, ctx.inventory);
  if (collision) return { ok: false, reason: `Overlaps the existing ${collision.item.kind} "${collision.item.title}".` };

  const warnings: string[] = [];
  if (title.length > TITLE_MAX) warnings.push(`Longer than ${TITLE_MAX} characters, so the writer will shorten it and keep the main keyword.`);
  else if (title.length < TITLE_GOOD_MIN) warnings.push(`Shorter than ${TITLE_GOOD_MIN} characters; longer, specific titles usually rank better.`);
  const format = inferredFormat(title);
  if (format === "PRACTICAL_GUIDE" || format === "QUESTION_EXPLAINER") warnings.push("How-to and question topics usually suit Articles; this will be written as a blog guide.");
  const picks = Number(title.match(/^(\d+)\b/)?.[1] ?? 0);
  if (picks > 8) warnings.push(`Promises ${picks} picks; lists longer than 8 are hard to fill with well-matched products.`);
  const season = titleSeason(title, ctx.today);
  if (season.occasion && !season.ready) warnings.push(`Waits for ${season.occasion.name} (${shortDate(season.occasion.date)}); it becomes ready about ${SEASON_LEAD_DAYS} days before.`);
  const similar = findTitleCollision(title, ctx.listTitles.map((existing) => ({ kind: "blog" as const, title: existing })));
  if (similar) warnings.push(`Very similar to "${similar.item.title}" in your list.`);
  return { ok: true, warnings };
}

// The written post must keep the assigned title. A title within the limit is used as is (only
// capitalization or punctuation may change); a longer one may be shortened but must stay made of
// its own words.
export function assertAssignedTitle(written: string, assigned: string) {
  if (assigned.length <= TITLE_MAX) {
    if (normalizeContentTitle(written) !== normalizeContentTitle(assigned)) throw new Error(`title must be exactly the assigned title "${assigned}"`);
    return;
  }
  const assignedTokens = contentTitleTokens(assigned);
  const writtenTokens = [...contentTitleTokens(written)];
  const kept = writtenTokens.filter((token) => assignedTokens.has(token)).length;
  if (!writtenTokens.length || kept / writtenTokens.length < 0.7) {
    throw new Error(`title must be a shortened version of the assigned title "${assigned}" that keeps its main keyword and words`);
  }
}

// ── Store ────────────────────────────────────────────────────────────────────
// Each project keeps its own blog-titles.json (GreatFlowers in data/, other brands in data/projects/<id>/).
const dataFile = (project: ProjectConfig) => projectDataPath(project, "blog-titles.json");
const readAll = (project: ProjectConfig) => readJsonArray<BlogTitle>(dataFile(project));
const writeAll = (project: ProjectConfig, titles: BlogTitle[]) => writeJsonAtomic(dataFile(project), titles);
const locked = <R>(project: ProjectConfig, operation: () => Promise<R>) => withFileLock(dataFile(project), operation);

export const getBlogTitles = (project: ProjectConfig) => locked(project, () => readAll(project));

export interface AddTitlesResult {
  added: BlogTitle[];
  rejected: Array<{ title: string; reason: string }>;
}

export function addBlogTitles(project: ProjectConfig, lines: string[], inventory: ContentTitle[], today: Date = new Date()): Promise<AddTitlesResult> {
  return locked(project, async () => {
    const all = await readAll(project);
    const listTitles = all.map((item) => item.title);
    const result: AddTitlesResult = { added: [], rejected: [] };
    for (const line of lines) {
      const title = cleanTitleLine(line);
      if (!title) continue;
      const check = checkBlogTitle(title, { inventory, listTitles, today });
      if (!check.ok) {
        result.rejected.push({ title, reason: check.reason });
        continue;
      }
      const now = new Date().toISOString();
      const saved: BlogTitle = { id: randomUUID(), title, status: "queued", warnings: check.warnings, addedAt: now, updatedAt: now, attempts: 0 };
      all.push(saved);
      listTitles.push(title);
      result.added.push(saved);
    }
    if (result.added.length) await writeAll(project, all);
    return result;
  });
}

export function updateBlogTitle(project: ProjectConfig, id: string, update: (title: BlogTitle, all: BlogTitle[]) => BlogTitle | null): Promise<BlogTitle | null> {
  return locked(project, async () => {
    const all = await readAll(project);
    const index = all.findIndex((item) => item.id === id);
    const current = all[index];
    if (!current) return null;
    const next = update(current, all);
    if (!next) return null;
    all[index] = { ...next, updatedAt: new Date().toISOString() };
    await writeAll(project, all);
    return all[index]!;
  });
}

export function deleteBlogTitle(project: ProjectConfig, id: string): Promise<"deleted" | "missing" | "writing"> {
  return locked(project, async () => {
    const all = await readAll(project);
    const index = all.findIndex((item) => item.id === id);
    if (index === -1) return "missing";
    if (all[index]!.status === "writing") return "writing";
    all.splice(index, 1);
    await writeAll(project, all);
    return "deleted";
  });
}

export const claimBlogTitle = (project: ProjectConfig, id: string, reason: string) =>
  updateBlogTitle(project, id, (title) => {
    const { error: _error, ...rest } = title;
    return { ...rest, status: "writing", selectionReason: reason };
  });

export const completeBlogTitle = (project: ProjectConfig, id: string, draft: { id: string; title: string }) =>
  updateBlogTitle(project, id, (title) => {
    const { error: _error, pinned: _pinned, ...rest } = title;
    return { ...rest, status: "used", usedAt: new Date().toISOString(), draftId: draft.id, draftTitle: draft.title };
  });

// A failed run puts the title back in the queue; after MAX_TITLE_ATTEMPTS failures it needs attention.
export const releaseBlogTitle = (project: ProjectConfig, id: string, error: string) =>
  updateBlogTitle(project, id, (title) => {
    const attempts = title.attempts + 1;
    return { ...title, attempts, status: attempts >= MAX_TITLE_ATTEMPTS ? "failed" : "queued", error: error.slice(0, 500) };
  });

// Only one blog generation runs per project at a time (the blog lock), so a title still marked
// "writing" when a new run starts was left behind by a restart. It goes back to the queue.
export function resetStaleWritingTitles(project: ProjectConfig): Promise<number> {
  return locked(project, async () => {
    const all = await readAll(project);
    const stale = all.filter((item) => item.status === "writing");
    if (!stale.length) return 0;
    const now = new Date().toISOString();
    for (const item of stale) Object.assign(item, { status: "queued", updatedAt: now });
    await writeAll(project, all);
    return stale.length;
  });
}
