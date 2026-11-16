import path from "node:path";
import { greatflowers } from "./greatflowers.js";
import { onepriceflowers } from "./onepriceflowers.js";
import type { ProjectConfig } from "./types.js";

export type { ProjectConfig, ProjectVisual, TextPalette } from "./types.js";
export { greatflowers, onepriceflowers };

// To add a brand: create src/projects/<id>.ts, add it here, give it its own env prefix,
// Hermes skills, data folder and cron window (see onepriceflowers.ts).
export const PROJECTS: readonly ProjectConfig[] = [greatflowers, onepriceflowers];

if (PROJECTS.filter((project) => project.isDefault).length !== 1) throw new Error("Exactly one project must be the default");
if (new Set(PROJECTS.map((project) => project.id)).size !== PROJECTS.length) throw new Error("Project ids must be unique");

export const getProject = (id: string): ProjectConfig | undefined => PROJECTS.find((project) => project.id === id);
export const defaultProject = (): ProjectConfig => PROJECTS.find((project) => project.isDefault)!;
export const enabledProjects = (): ProjectConfig[] => PROJECTS.filter((project) => project.enabled());

// ---- data folders -------------------------------------------------------------------------

export const projectDataDir = (project: ProjectConfig) => path.join(process.cwd(), project.dataDir);
export const projectDataPath = (project: ProjectConfig, ...parts: string[]) => path.join(projectDataDir(project), ...parts);

// ---- locks --------------------------------------------------------------------------------

// Expensive AI jobs are single-flight per project. Codex image generation is NOT: it detects its
// output as the newest file in one shared folder, so it keeps one global lock for every brand.
export const projectLockKey = (project: ProjectConfig, name: string) => `${project.id}:${name}`;

// ---- storefront ---------------------------------------------------------------------------

// Base URL for links inside generated content.
export const storefrontBase = (project: ProjectConfig) =>
  (project.env("GF_STOREFRONT_URL") || project.storefront.defaultBaseUrl).replace(/\/+$/, "");

// Public URL of a published blog, wiki entry or article. Undefined until the storefront URL setting
// is configured, so a staging run never records a production link.
export function liveContentUrl(project: ProjectConfig, kind: "blog" | "wiki" | "article", slug: string): string | undefined {
  const configured = project.env("GF_STOREFRONT_URL");
  return configured ? `${configured.replace(/\/+$/, "")}/${project.storefront.paths[kind]}/${slug}/` : undefined;
}

export const productPageUrl = (project: ProjectConfig, base: string, slug: string) =>
  `${base}/${project.storefront.paths.product}/${slug}/`;

// ---- prompt additions ---------------------------------------------------------------------

// Brand-specific verified claims, appended after a prompt. Empty for brands without any, so their
// prompts stay byte-identical.
export const promptAddendum = (project: ProjectConfig) =>
  project.brand.promptAddendum ? `\n\n${project.brand.promptAddendum}` : "";

// Names the brand's content skill so Hermes never picks another brand's skill on its own.
export const contentSkillPrefix = (project: ProjectConfig) =>
  project.brand.contentSkill ? `Use the ${project.brand.contentSkill} skill.\n\n` : "";
