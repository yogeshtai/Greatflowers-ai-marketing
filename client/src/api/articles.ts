import axios from "axios";
import { API_BASE } from "../constants";
import type { GenerationState } from "./blogs";

export interface ArticleGenerationState extends GenerationState { phase?: "article" | "image" }
export type ArticleStatus = "draft" | "approved" | "published" | "rejected" | "failed";
export interface ArticleDraft {
  id: string; status: ArticleStatus; title: string; slug: string; topic: string; format: string; authorName: string;
  description: string; metaTitle: string; metaDescription: string; productIds: number[]; heroProductId: number;
  imageConcept: string; html: string; createdAt: string; updatedAt?: string; approvedAt?: string; publishAfter?: string;
  publishedAt?: string; imageSource?: "ai" | "product"; remoteId?: number; remoteStatus?: 0 | 1; url?: string;
  attempts: number; error?: string; environment: string;
}
export type ArticleEdit = Partial<Pick<ArticleDraft, "title" | "topic" | "authorName" | "description" | "metaTitle" | "metaDescription" | "html">>;

const url = (path = "") => `${API_BASE}/api/articles${path}`;
const unwrap = (error: unknown): never => { throw new Error(axios.isAxiosError(error) && error.response?.data?.error ? error.response.data.error : error instanceof Error ? error.message : "Request failed"); };
const call = async <T,>(request: Promise<{ data: T }>) => request.then((response) => response.data).catch(unwrap);

export const getArticles = () => call<{ articles: ArticleDraft[]; topics: string[]; liveMode: boolean; publishMode: "immediate" | "scheduled"; generation: ArticleGenerationState }>(axios.get(url()));
export const getArticleStatus = () => call<{ generation: ArticleGenerationState }>(axios.get(url("/status")));
export const generateArticle = () => call<{ started: boolean }>(axios.post(url("/generate"), {}));
export const editArticle = (id: string, edit: ArticleEdit) => call<{ article: ArticleDraft }>(axios.patch(url(`/${id}`), edit));
export const deleteArticle = (id: string) => call<{ success: true }>(axios.delete(url(`/${id}`)));
export const approveArticle = (id: string) => call<{ article: ArticleDraft }>(axios.post(url(`/${id}/approve`)));
export const rejectArticle = (id: string) => call<{ article: ArticleDraft }>(axios.post(url(`/${id}/reject`)));
export const publishArticleNow = (id: string) => call<{ article: ArticleDraft }>(axios.post(url(`/${id}/publish-now`), {}, { timeout: 2 * 60_000 }));
export const articleImageUrl = (article: Pick<ArticleDraft, "id" | "updatedAt">) => `${url(`/${article.id}/image`)}?v=${encodeURIComponent(article.updatedAt ?? "")}`;
export const regenerateArticleImage = (id: string) => call<{ article: ArticleDraft }>(axios.post(url(`/${id}/image/regenerate`), {}, { timeout: 12 * 60_000 }));
