import { z } from "zod";
import type { CatalogProduct } from "./blog.generator.js";
import {
  claimBlogTitle,
  getBlogTitles,
  resetStaleWritingTitles,
  titleSeason,
  updateBlogTitle,
  SEASON_LEAD_DAYS,
  type BlogTitle,
} from "./blog.titles.js";
import { findTitleCollision, type ContentTitle } from "./content.overlap.js";
import { requestHermesJSON } from "./hermes.json.js";
import { parseModelJSONCandidates } from "./model.json.js";
import { getUpcomingOccasions } from "./occasion.calendar.js";
import type { ProjectConfig } from "./projects/index.js";

// Chooses which title from the brand's title list the next blog is written for.

/** Where a draft's title comes from: the AI's pick from the list, or one title chosen by the user. */
export type BlogTitleSource =
  | { kind: "pick"; fallbackToAuto: boolean }
  | { kind: "title"; titleId: string };

export type PickMethod = "pinned" | "only" | "ai" | "fallback" | "chosen";

export interface BlogTitleAssignment {
  id: string;
  title: string;
  reason: string;
  method: PickMethod;
}

export interface SelectionContext {
  inventory: ContentTitle[];
  recentTitles: string[];
  products: CatalogProduct[];
  today?: Date;
  signal?: AbortSignal;
}

export type AskModel = <T>(prompt: string, validate: (output: string) => T, jsonSchema: object) => Promise<T>;

const MAX_CANDIDATES = 30;

const overlapReason = (collision: { item: ContentTitle }) => `Now overlaps the existing ${collision.item.kind} "${collision.item.title}".`;

// Titles the AI may choose from right now. Queued titles that now overlap published content are
// returned separately so they can be skipped; seasonal titles wait until their occasion is near,
// unless pinned.
export function eligibleTitles(titles: BlogTitle[], ctx: Pick<SelectionContext, "inventory" | "today">) {
  const eligible: BlogTitle[] = [];
  const overlapping: Array<{ title: BlogTitle; reason: string }> = [];
  for (const title of titles) {
    if (title.status !== "queued") continue;
    const collision = findTitleCollision(title.title, ctx.inventory);
    if (collision) overlapping.push({ title, reason: overlapReason(collision) });
    else if (title.pinned || titleSeason(title.title, ctx.today).ready) eligible.push(title);
  }
  return { eligible, overlapping };
}

// Code-only choice used when there is nothing to compare or the AI is unavailable: the soonest
// seasonal title first, then the oldest title in the list.
export function fallbackPick(candidates: BlogTitle[], today?: Date): BlogTitle {
  const soonest = (title: BlogTitle) => titleSeason(title.title, today).occasion?.daysUntil ?? Number.POSITIVE_INFINITY;
  return [...candidates].sort((a, b) => soonest(a) - soonest(b) || a.addedAt.localeCompare(b.addedAt))[0]!;
}

export function buildTitleSelectionPrompt(project: ProjectConfig, candidates: Array<{ key: string; title: BlogTitle }>, ctx: SelectionContext): string {
  const today = ctx.today ?? new Date();
  const upcoming = getUpcomingOccasions(SEASON_LEAD_DAYS, today).map((occasion) => `${occasion.name} (${occasion.date}, ${occasion.daysUntil} days away)`);
  const lines = candidates.map(({ key, title }) => {
    const occasion = titleSeason(title.title, today).occasion;
    return `  - ${key}: "${title.title}"${occasion ? ` [${occasion.name} in ${occasion.daysUntil} days]` : " [evergreen]"}`;
  });
  return `You choose the next blog post ${project.brand.name} (${project.brand.domain}) should publish, from the marketing team's title list.
Use only the information below. Do not browse, search or call tools.

TODAY: ${today.toISOString().slice(0, 10)}
UPCOMING OCCASIONS (next ${SEASON_LEAD_DAYS} days): ${upcoming.length ? upcoming.join("; ") : "none"}

RECENT POSTS (newest first; avoid repeating their theme or format back to back):
${ctx.recentTitles.slice(0, 10).map((title) => `  - ${title}`).join("\n") || "  (none)"}

PRODUCTS THE POST CAN FEATURE:
${ctx.products.slice(0, 40).map((product) => `  - ${product.name}${product.description ? `: ${product.description.slice(0, 90)}` : ""}`).join("\n")}

CANDIDATE TITLES (choose exactly one key):
${lines.join("\n")}

CHOOSE BY, IN THIS ORDER:
1. Timing: a title for an occasion 3 to 7 weeks away beats one further out or evergreen. An occasion under 2 weeks away is still a good choice if no other title is timely.
2. Product fit: several of the products above must genuinely suit the title.
3. Variety: a different theme and format from the recent posts.
4. Search intent: a clear, specific thing a US flower buyer would search for.

Return JSON only: {"titleKey": "<one of the keys>", "reason": "<one or two plain sentences for the marketing team>"}`;
}

const SelectionSchema = z.object({ titleKey: z.string().min(1), reason: z.string().trim().min(10).max(400) });
const SelectionJsonSchema = z.toJSONSchema(SelectionSchema, { io: "input", unrepresentable: "any" });

const defaultAsk = (signal?: AbortSignal): AskModel => (prompt, validate, jsonSchema) =>
  requestHermesJSON(prompt, validate, signal, jsonSchema, { freshRetries: 0 });

export async function pickBlogTitle(project: ProjectConfig, candidates: BlogTitle[], ctx: SelectionContext, ask: AskModel = defaultAsk(ctx.signal)): Promise<{ title: BlogTitle; reason: string; method: PickMethod }> {
  if (!candidates.length) throw new Error("No ready titles to choose from");
  const pinned = candidates.filter((title) => title.pinned).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  if (pinned.length) return { title: pinned[0]!, reason: "Pinned to be written next.", method: "pinned" };
  if (candidates.length === 1) return { title: candidates[0]!, reason: "The only ready title in the list.", method: "only" };

  const shortlist = [...candidates].sort((a, b) => a.addedAt.localeCompare(b.addedAt)).slice(0, MAX_CANDIDATES)
    .map((title, index) => ({ key: `t${index + 1}`, title }));
  const byKey = new Map(shortlist.map((entry) => [entry.key, entry.title]));
  try {
    const choice = await ask(buildTitleSelectionPrompt(project, shortlist, ctx), (output) => {
      for (const candidate of parseModelJSONCandidates(output)) {
        const parsed = SelectionSchema.safeParse(candidate);
        if (!parsed.success) continue;
        if (!byKey.has(parsed.data.titleKey)) throw new Error(`titleKey must be one of: ${[...byKey.keys()].join(", ")}`);
        return parsed.data;
      }
      return SelectionSchema.parse(parseModelJSONCandidates(output).at(-1));
    }, SelectionJsonSchema);
    return { title: byKey.get(choice.titleKey)!, reason: choice.reason, method: "ai" };
  } catch (error) {
    if (ctx.signal?.aborted) throw error;
    console.warn(`[${project.id}] AI title selection failed; using the code pick:`, error instanceof Error ? error.message : error);
    return { title: fallbackPick(shortlist.map((entry) => entry.title), ctx.today), reason: "The AI choice was unavailable, so the soonest seasonal (or oldest) ready title was used.", method: "fallback" };
  }
}

// Resolves the title for one generation run and marks it as being written. Returns undefined when
// a scheduled run finds no ready title, so it writes the usual calendar-led post instead.
export async function resolveTitleAssignment(project: ProjectConfig, source: BlogTitleSource, ctx: SelectionContext, ask?: AskModel): Promise<BlogTitleAssignment | undefined> {
  await resetStaleWritingTitles(project);
  const titles = await getBlogTitles(project);

  if (source.kind === "title") {
    const chosen = titles.find((title) => title.id === source.titleId);
    if (!chosen) throw new Error("That title is no longer in the list.");
    if (chosen.status === "used") throw new Error(`"${chosen.title}" has already been written.`);
    const collision = findTitleCollision(chosen.title, ctx.inventory);
    if (collision) {
      await updateBlogTitle(project, chosen.id, (title) => ({ ...title, status: "skipped", error: overlapReason(collision) }));
      throw new Error(`"${chosen.title}" ${overlapReason(collision).replace(/^Now o/, "now o")}`);
    }
    await claimBlogTitle(project, chosen.id, "Chosen by you.");
    return { id: chosen.id, title: chosen.title, reason: "Chosen by you.", method: "chosen" };
  }

  const { eligible, overlapping } = eligibleTitles(titles, ctx);
  for (const { title, reason } of overlapping) {
    await updateBlogTitle(project, title.id, (current) => ({ ...current, status: "skipped", error: reason }));
  }
  if (!eligible.length) {
    if (source.fallbackToAuto) return undefined;
    throw new Error(`No ready titles in the list. Add titles, or wait until a seasonal title's occasion is within ${SEASON_LEAD_DAYS} days.`);
  }
  const pick = await pickBlogTitle(project, eligible, ctx, ask);
  await claimBlogTitle(project, pick.title.id, pick.reason);
  return { id: pick.title.id, title: pick.title.title, reason: pick.reason, method: pick.method };
}
