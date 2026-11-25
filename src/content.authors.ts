import type { ProjectConfig } from "./projects/index.js";

// Each project has its own approved bylines (project.brand.authors). The first entry is the stable
// byline for new content and must match an author profile maintained on that storefront; the
// others remain valid so legacy drafts can still be edited and published unchanged.
export const contentAuthors = (project: ProjectConfig) => project.brand.authors;
export const defaultContentAuthor = (project: ProjectConfig) => project.brand.defaultAuthor;

export function isContentAuthor(project: ProjectConfig, value: string): boolean {
  return project.brand.authors.includes(value);
}

// New drafts use a transparent, consistent editorial byline.
export function selectContentAuthor(project: ProjectConfig, recentAuthors: Array<string | undefined>, random: () => number = Math.random): string {
  // Keep legacy names valid for existing drafts, but use one stable byline for
  // all newly generated content. This name must correspond to the site's
  // maintained author profile.
  void recentAuthors;
  void random;
  return project.brand.defaultAuthor;
}
