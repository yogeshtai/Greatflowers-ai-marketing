import type { ProjectConfig } from "./types.js";

// Settings each project needs, by the GreatFlowers variable name. project.envName() gives the
// project's own variable (OPF_ADMIN_API_URL, ...). Values are never printed, only presence.
export const REQUIRED_SETTINGS = {
  "Storefront admin API (blogs, wikis, articles)": ["GF_ADMIN_API_URL", "GF_ADMIN_EMAIL", "GF_ADMIN_PASSWORD"],
  "Live content URLs": ["GF_STOREFRONT_URL"],
  "Meta publishing (Facebook + Instagram)": ["META_PAGE_ID", "META_INSTAGRAM_ACCOUNT_ID", "META_PAGE_ACCESS_TOKEN"],
  "S3 marketing images": ["AWS_S3_BUCKET", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
} as const;

// Recommendations still work without GA4 (they continue without analytics).
export const OPTIONAL_SETTINGS = {
  "GA4 product analytics": ["GA4_PROPERTY_ID"],
} as const;

export function missingSettings(project: ProjectConfig, settings: Record<string, readonly string[]> = REQUIRED_SETTINGS) {
  return Object.entries(settings).flatMap(([area, names]) =>
    names.filter((name) => !project.env(name)?.trim()).map((name) => ({ area, variable: project.envName(name) })),
  );
}
