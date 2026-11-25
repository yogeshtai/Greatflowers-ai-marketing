import axios from "axios";
import { API_BASE } from "./constants";

// The dashboard manages one project (brand) at a time. Every API request carries the selected
// project; the backend uses GreatFlowers when a request names none.
export const PROJECT_HEADER = "X-Project-Id";
export const DEFAULT_PROJECT_ID = "greatflowers";
const STORAGE_KEY = "marketing.projectId";

export interface ProjectSummary {
  id: string;
  isDefault: boolean;
  name: string;
  displayName: string;
  storefrontUrl: string;
  logoUrl: string;
  primaryColor: string;
}

// Used when the backend predates /api/projects, so the dashboard still works for GreatFlowers.
export const FALLBACK_PROJECTS: ProjectSummary[] = [{
  id: DEFAULT_PROJECT_ID,
  isDefault: true,
  name: "GreatFlowers",
  displayName: "Great Flowers",
  storefrontUrl: "https://greatflowers.net",
  logoUrl: "https://greatflowers.net/assets/svg/greatflowers-logo.svg",
  primaryColor: "#701888",
}];

function readStoredProjectId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let currentProjectId = readStoredProjectId() ?? DEFAULT_PROJECT_ID;

export const getProjectId = () => currentProjectId;

export function setProjectId(id: string) {
  currentProjectId = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Remembering the choice is a convenience; the selection still applies for this session.
  }
}

// Headers for raw fetch() calls (streams and scheduling), which bypass the axios interceptor.
export const projectHeaders = (): Record<string, string> => ({ [PROJECT_HEADER]: currentProjectId });

// <img src> requests cannot send headers, so image URLs name the project in the query string.
export const withProjectQuery = (url: string) =>
  `${url}${url.includes("?") ? "&" : "?"}project=${encodeURIComponent(currentProjectId)}`;

axios.interceptors.request.use((config) => {
  config.headers.set(PROJECT_HEADER, currentProjectId);
  return config;
});

export async function listProjects(): Promise<ProjectSummary[]> {
  try {
    const response = await axios.get<{ projects?: ProjectSummary[] }>(`${API_BASE}/api/projects`);
    return response.data.projects?.length ? response.data.projects : FALLBACK_PROJECTS;
  } catch {
    return FALLBACK_PROJECTS;
  }
}

// Initials for the header badge: "Great Flowers" -> "GF", "One Price Flowers" -> "OPF".
export const projectInitials = (project: Pick<ProjectSummary, "displayName">) =>
  project.displayName.split(/\s+/).filter(Boolean).map((word) => word[0]!.toUpperCase()).join("").slice(0, 3);
