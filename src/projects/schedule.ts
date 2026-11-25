import { autogenerateEnabled, type ContentKind } from "./automation.js";
import type { ProjectConfig } from "./types.js";

// Describes a project's timed draft schedule for the dashboard, read from the same crons the
// schedulers run, so each brand's queue page shows its own days and times.

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ZONE_LABELS: Record<string, string> = { "Asia/Kolkata": "IST", "America/New_York": "ET" };

export interface DraftSchedule {
  // False when timed drafts are switched off for this content type (drafts only via "Generate now").
  autogenerate: boolean;
  // "Monday, Wednesday and Friday" or "Sunday".
  days: string;
  // "6:00 PM IST".
  time: string;
  // When timed-out runs are retried the same day; absent when the content type has no retries.
  retryPeriod?: "afternoon" | "evening";
}

const fields = (expression: string) => expression.trim().split(/\s+/);

const joinDays = (days: number[]) => {
  const names = days.map((day) => DAY_NAMES[day % 7]!);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]!;
};

const clock = (hour: number, minute: number, timezone: string) =>
  `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"} ${ZONE_LABELS[timezone] ?? timezone}`;

// Earliest hour named by the retry crons ("0,30 20-23 ..." -> 20, "30 14,15,16,17 ..." -> 14).
const firstRetryHour = (expressions: readonly string[]) => {
  const hours = expressions.flatMap((expression) => fields(expression)[1]!.split(",").map((part) => Number(part.split("-")[0])));
  return hours.length ? Math.min(...hours) : undefined;
};

export function draftSchedule(project: ProjectConfig, kind: ContentKind): DraftSchedule {
  const { timezone, blogDraftCron, wikiDraftCron, wikiRecoveryCrons, articleDraftCron, articleRecoveryCron } = project.schedule;
  const cron = kind === "BLOG" ? blogDraftCron : kind === "WIKI" ? wikiDraftCron : articleDraftCron;
  const retries = kind === "BLOG" ? [] : kind === "WIKI" ? wikiRecoveryCrons : [articleRecoveryCron];
  const [minute, hour, , , days] = fields(cron);
  const retryHour = firstRetryHour(retries);
  return {
    autogenerate: autogenerateEnabled(project, kind),
    days: joinDays(days!.split(",").map(Number)),
    time: clock(Number(hour), Number(minute), timezone),
    ...(retryHour === undefined ? {} : { retryPeriod: retryHour >= 17 ? "evening" as const : "afternoon" as const }),
  };
}

// How many timed blog drafts a week the brand's cron runs (Mon/Wed/Fri = 3), for the title-list estimate.
export function blogRunsPerWeek(project: ProjectConfig): number {
  const days = fields(project.schedule.blogDraftCron)[4] ?? "*";
  return days === "*" ? 7 : new Set(days.split(",").map((day) => Number(day) % 7)).size;
}
