import type { ProjectConfig } from "./types.js";

export type ContentKind = "BLOG" | "WIKI" | "ARTICLE";

// Scheduled draft generation for one content type. "false" always turns it off and "true" always
// turns it on; any other value (or none) uses the project's default. For GreatFlowers that is on,
// exactly as before (only "false" ever disabled it); new brands default to off.
export function autogenerateEnabled(project: ProjectConfig, kind: ContentKind): boolean {
  const value = project.env(`${kind}_AUTOGENERATE`);
  if (value === "false") return false;
  if (value === "true") return true;
  return project.autogenerateByDefault;
}

// The automation switches for one content type, with the defaults the schedulers apply.
export function contentAutomation(project: ProjectConfig, kind: ContentKind) {
  return {
    autogenerate: autogenerateEnabled(project, kind),
    autoapprove: project.env(`${kind}_AUTOAPPROVE`) !== "false",
    publishLive: project.env(`${kind}_PUBLISH_LIVE`) === "true",
    publishMode: (project.env(`${kind}_PUBLISH_MODE`) ?? "immediate") === "immediate" ? "immediate" as const : "scheduled" as const,
  };
}

// Safe mode for a first launch: nothing is generated on a timer and anything published stays hidden.
export const isSafeMode = (project: ProjectConfig) =>
  (["BLOG", "WIKI", "ARTICLE"] as const).every((kind) => {
    const automation = contentAutomation(project, kind);
    return !automation.autogenerate && !automation.publishLive;
  });
