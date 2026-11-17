import { useEffect, useState } from "react";
import App from "./App";
import { DEFAULT_PROJECT_ID, getProjectId, listProjects, setProjectId, type ProjectSummary } from "./project";

// Loads the enabled projects and remounts the whole dashboard when the selected project changes,
// so no campaign, strategy or creative state from one brand can carry over into another.
export function ProjectRoot() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [projectId, setSelectedProjectId] = useState(getProjectId());

  useEffect(() => {
    let cancelled = false;
    listProjects().then((available) => {
      if (cancelled) return;
      // A remembered project may since have been disabled; fall back to the default one.
      if (!available.some((project) => project.id === getProjectId())) {
        setProjectId(available.find((project) => project.isDefault)?.id ?? available[0]?.id ?? DEFAULT_PROJECT_ID);
      }
      setSelectedProjectId(getProjectId());
      setProjects(available);
    });
    return () => { cancelled = true; };
  }, []);

  // Render nothing until the list is known, so the brand on screen always matches the project
  // every request is sent for (listProjects falls back to GreatFlowers if the call fails).
  if (!projects) return null;
  const project = projects.find((candidate) => candidate.id === projectId) ?? projects[0]!;

  const switchProject = (id: string) => {
    setProjectId(id);
    setSelectedProjectId(id);
  };

  return <App key={project.id} project={project} projects={projects} onProjectChange={switchProject} />;
}
