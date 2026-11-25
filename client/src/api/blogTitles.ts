import axios from "axios";
import { API_BASE } from "../constants";

// The brand's blog title list (the project is sent with every request by the axios interceptor).

export type BlogTitleStatus = "queued" | "writing" | "used" | "skipped" | "failed";

export interface BlogTitle {
  id: string;
  title: string;
  status: BlogTitleStatus;
  pinned?: boolean;
  warnings: string[];
  addedAt: string;
  updatedAt: string;
  attempts: number;
  error?: string;
  usedAt?: string;
  draftId?: string;
  draftTitle?: string;
  selectionReason?: string;
  /** A seasonal title waits until its occasion is within 60 days (ready = false until then). */
  season: { occasion?: { name: string; date: string; daysUntil: number }; ready: boolean };
}

export interface BlogTitleList {
  titles: BlogTitle[];
  stats: { ready: number; waiting: number; writing: number; used: number; skipped: number; failed: number };
  runsPerWeek: number;
  usedBySchedule: boolean;
  listSwitchedOff: boolean;
}

export interface AddTitlesResult {
  added: BlogTitle[];
  rejected: Array<{ title: string; reason: string }>;
}

export interface TitlePickPreview {
  titleId: string;
  title: string;
  reason: string;
  method: "pinned" | "only" | "ai" | "fallback";
}

const url = (path = "") => `${API_BASE}/api/blog-titles${path}`;
const unwrap = (error: unknown): never => {
  throw new Error(axios.isAxiosError(error) && error.response?.data?.error ? error.response.data.error : error instanceof Error ? error.message : "Request failed");
};
const call = async <T,>(request: Promise<{ data: T }>) => request.then((r) => r.data).catch(unwrap);

export const getBlogTitles = () => call<BlogTitleList>(axios.get(url()));
// Checking titles against the storefront's existing content can take a few seconds.
export const addBlogTitles = (titles: string[]) => call<AddTitlesResult>(axios.post(url(), { titles }, { timeout: 2 * 60_000 }));
export const updateBlogTitle = (id: string, update: { title?: string; pinned?: boolean; status?: "queued" | "skipped" }) =>
  call<{ title: BlogTitle }>(axios.patch(url(`/${id}`), update, { timeout: 2 * 60_000 }));
export const deleteBlogTitle = (id: string) => call<{ success: true }>(axios.delete(url(`/${id}`)));
// Asks the AI which title it would pick, without writing anything (this can take a few minutes).
export const previewBlogTitlePick = () => call<TitlePickPreview>(axios.post(url("/preview-pick"), {}, { timeout: 15 * 60_000 }));
