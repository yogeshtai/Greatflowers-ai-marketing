import type express from "express";
import { defaultProject, getProject } from "./index.js";
import type { ProjectConfig } from "./types.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      project?: ProjectConfig;
    }
  }
}

export const PROJECT_HEADER = "x-project-id";

// Resolves which brand an API request is for: the X-Project-Id header, else the ?project= query
// (needed for <img src> and streamed requests that cannot set headers), else the default project.
// Unknown and disabled projects are rejected rather than silently served as another brand.
export const projectContext: express.RequestHandler = (req, res, next) => {
  const header = req.get(PROJECT_HEADER);
  const query = typeof req.query.project === "string" ? req.query.project : undefined;
  const requested = header?.trim() || query?.trim();
  const project = requested ? getProject(requested) : defaultProject();
  if (!project || !project.enabled()) {
    res.status(404).json({ success: false, error: `Unknown or disabled project: ${requested}` });
    return;
  }
  res.locals.project = project;
  next();
};

export function projectOf(res: express.Response): ProjectConfig {
  const project = res.locals.project;
  if (!project) throw new Error("No project was resolved for this request");
  return project;
}
