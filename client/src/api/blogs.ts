import axios from "axios";
import { API_BASE } from "../constants";

export type BlogStatus = "draft" | "approved" | "published" | "rejected" | "failed";

export interface BlogDraft {
  id: string;
  status: BlogStatus;
  topic: string;
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  summary: string;
  categorySlug: string;
  html: string;
  createdAt: string;
  approvedAt?: string;
  publishAfter?: string;
  publishedAt?: string;
  remoteId?: number;
  remoteStatus?: 0 | 1;
  url?: string;
  attempts: number;
  error?: string;
  environment: string;
}

export type BlogEdit = Partial<Pick<BlogDraft, "title" | "metaTitle" | "metaDescription" | "summary" | "html">>;

const url = (path = "") => `${API_BASE}/api/blogs${path}`;
const unwrap = (error: unknown): never => {
  throw new Error(axios.isAxiosError(error) && error.response?.data?.error ? error.response.data.error : error instanceof Error ? error.message : "Request failed");
};
const call = async <T,>(request: Promise<{ data: T }>) => request.then((r) => r.data).catch(unwrap);

export const getBlogs = () => call<{ blogs: BlogDraft[]; liveMode: boolean }>(axios.get(url()));
export const generateBlog = () => call<{ blog: BlogDraft }>(axios.post(url("/generate"), {}, { timeout: 11 * 60_000 }));
export const editBlog = (id: string, edit: BlogEdit) => call<{ blog: BlogDraft }>(axios.patch(url(`/${id}`), edit));
export const approveBlog = (id: string) => call<{ blog: BlogDraft }>(axios.post(url(`/${id}/approve`)));
export const rejectBlog = (id: string) => call<{ blog: BlogDraft }>(axios.post(url(`/${id}/reject`)));
export const publishBlogNow = (id: string) => call<{ blog: BlogDraft }>(axios.post(url(`/${id}/publish-now`), {}, { timeout: 2 * 60_000 }));
