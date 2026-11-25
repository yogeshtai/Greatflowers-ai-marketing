import axios from "axios";
import { API_BASE } from "../constants";
import { withProjectQuery } from "../project";

export type BlogStatus = "draft" | "approved" | "published" | "rejected" | "failed";

export interface BlogDraft {
  id: string;
  status: BlogStatus;
  topic: string;
  authorName: string;
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  summary: string;
  categorySlug: string;
  secondCategorySlug?: string;
  html: string;
  createdAt: string;
  approvedAt?: string;
  publishAfter?: string;
  publishedAt?: string;
  heroSource?: "ai" | "product";
  updatedAt?: string;
  remoteId?: number;
  remoteStatus?: 0 | 1;
  url?: string;
  attempts: number;
  error?: string;
  environment: string;
  /** Set when the post was written for a title from the title list. */
  sourceTitleId?: string;
  originalTitle?: string;
  selectionReason?: string;
}

export interface GenerationState {
  running: boolean;
  trigger?: "manual" | "schedule";
  occasion?: string;
  /** The title-list title being written, once it has been chosen. */
  title?: string;
  titleReason?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export type BlogEdit = Partial<Pick<BlogDraft, "authorName" | "title" | "metaTitle" | "metaDescription" | "summary" | "html">>;

const url = (path = "") => `${API_BASE}/api/blogs${path}`;
const unwrap = (error: unknown): never => {
  throw new Error(axios.isAxiosError(error) && error.response?.data?.error ? error.response.data.error : error instanceof Error ? error.message : "Request failed");
};
const call = async <T,>(request: Promise<{ data: T }>) => request.then((r) => r.data).catch(unwrap);

// The brand's timed draft schedule, as the server runs it (shown on each queue page).
export interface DraftSchedule { autogenerate: boolean; days: string; time: string; retryPeriod?: "afternoon" | "evening" }

export const getBlogs = () => call<{ blogs: BlogDraft[]; authors: string[]; liveMode: boolean; publishMode: "immediate" | "scheduled"; generation: GenerationState; schedule?: DraftSchedule }>(axios.get(url()));
export const getBlogStatus = () => call<{ generation: GenerationState }>(axios.get(url("/status")));
export const generateBlog = (occasion?: string) => call<{ started: boolean }>(axios.post(url("/generate"), { occasion: occasion?.trim() || undefined }));
// Writes a draft for one title from the title list, or lets the AI pick the best ready title.
export const generateBlogFromTitle = (titleId: string) => call<{ started: boolean }>(axios.post(url("/generate"), { titleId }));
export const generateBlogFromList = () => call<{ started: boolean }>(axios.post(url("/generate"), { source: "title-list" }));
export const editBlog = (id: string, edit: BlogEdit) => call<{ blog: BlogDraft }>(axios.patch(url(`/${id}`), edit));
export const deleteBlog = (id: string) => call<{ success: true }>(axios.delete(url(`/${id}`)));
export const approveBlog = (id: string) => call<{ blog: BlogDraft }>(axios.post(url(`/${id}/approve`)));
export const rejectBlog = (id: string) => call<{ blog: BlogDraft }>(axios.post(url(`/${id}/reject`)));
export const publishBlogNow = (id: string) => call<{ blog: BlogDraft }>(axios.post(url(`/${id}/publish-now`), {}, { timeout: 2 * 60_000 }));
export const blogHeroUrl = (blog: Pick<BlogDraft, "id" | "updatedAt">) => withProjectQuery(`${url(`/${blog.id}/hero`)}?v=${encodeURIComponent(blog.updatedAt ?? "")}`);
export const regenerateBlogHero = (id: string) => call<{ blog: BlogDraft }>(axios.post(url(`/${id}/hero/regenerate`), {}, { timeout: 12 * 60_000 }));
