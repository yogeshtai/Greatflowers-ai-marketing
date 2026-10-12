import axios from "axios";
import { API_BASE } from "../constants";
import type { GenerationState } from "./blogs";

export interface WikiGenerationState extends GenerationState {
  phase?: "article" | "image";
}

export type WikiStatus = "draft" | "approved" | "published" | "rejected" | "failed";

export interface WikiDraft {
  id: string;
  status: WikiStatus;
  title: string;
  slug: string;
  botanicalName: string;
  authorName: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
  productIds: number[];
  heroProductId: number;
  imageConcept: string;
  html: string;
  createdAt: string;
  updatedAt?: string;
  approvedAt?: string;
  publishAfter?: string;
  publishedAt?: string;
  imageSource?: "ai" | "product";
  remoteId?: number;
  remoteStatus?: 0 | 1;
  url?: string;
  attempts: number;
  error?: string;
  environment: string;
}

export type WikiEdit = Partial<Pick<WikiDraft, "title" | "botanicalName" | "authorName" | "description" | "metaTitle" | "metaDescription" | "html">>;

const url = (path = "") => `${API_BASE}/api/wikis${path}`;
const unwrap = (error: unknown): never => {
  throw new Error(axios.isAxiosError(error) && error.response?.data?.error ? error.response.data.error : error instanceof Error ? error.message : "Request failed");
};
const call = async <T,>(request: Promise<{ data: T }>) => request.then((response) => response.data).catch(unwrap);

export const getWikis = () => call<{ wikis: WikiDraft[]; liveMode: boolean; publishMode: "immediate" | "scheduled"; generation: WikiGenerationState }>(axios.get(url()));
export const getWikiStatus = () => call<{ generation: WikiGenerationState }>(axios.get(url("/status")));
export const generateWiki = () => call<{ started: boolean }>(axios.post(url("/generate"), {}));
export const editWiki = (id: string, edit: WikiEdit) => call<{ wiki: WikiDraft }>(axios.patch(url(`/${id}`), edit));
export const deleteWiki = (id: string) => call<{ success: true }>(axios.delete(url(`/${id}`)));
export const approveWiki = (id: string) => call<{ wiki: WikiDraft }>(axios.post(url(`/${id}/approve`)));
export const rejectWiki = (id: string) => call<{ wiki: WikiDraft }>(axios.post(url(`/${id}/reject`)));
export const publishWikiNow = (id: string) => call<{ wiki: WikiDraft }>(axios.post(url(`/${id}/publish-now`), {}, { timeout: 2 * 60_000 }));
export const wikiImageUrl = (wiki: Pick<WikiDraft, "id" | "updatedAt">) => `${url(`/${wiki.id}/image`)}?v=${encodeURIComponent(wiki.updatedAt ?? "")}`;
export const regenerateWikiImage = (id: string) => call<{ wiki: WikiDraft }>(axios.post(url(`/${id}/image/regenerate`), {}, { timeout: 12 * 60_000 }));
