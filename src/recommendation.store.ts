import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectDataPath, type ProjectConfig } from "./projects/index.js";

export interface RecommendationHistoryItem {
  productId: number;
  productName: string;
  occasion: string;
  recommendedAt: string;
  contentTheme?: string;
  visualTreatment?: string;
  creativeScenario?: string;
  marketingAngle?: string;
  visualDirection?: string;
  artDirections?: string[];
  copyLayouts?: string[];
}

// Each project keeps its own rotation history; GreatFlowers still uses data/recommendations.json.
const dataFile = (project: ProjectConfig) => projectDataPath(project, "recommendations.json");

async function ensureFile(project: ProjectConfig) {
  const file = dataFile(project);
  await mkdir(path.dirname(file), {
    recursive: true,
  });

  try {
    await readFile(file, "utf8");
  } catch {
    await writeFile(
      file,
      JSON.stringify([], null, 2)
    );
  }
}

async function readHistory(project: ProjectConfig): Promise<
  RecommendationHistoryItem[]
> {
  await ensureFile(project);

  const content = await readFile(
    dataFile(project),
    "utf8"
  );

  return JSON.parse(content);
}

async function writeHistory(
  project: ProjectConfig,
  items: RecommendationHistoryItem[]
) {
  await writeFile(
    dataFile(project),
    JSON.stringify(items, null, 2)
  );
}

export async function getRecentRecommendations(
  project: ProjectConfig,
  limit = 5
) {
  const history = await readHistory(project);

  return history.slice(0, limit);
}

export async function recordRecommendation(
  project: ProjectConfig,
  item: Omit<
    RecommendationHistoryItem,
    "recommendedAt"
  >
) {
  const history = await readHistory(project);

  history.unshift({
    ...item,
    recommendedAt:
      new Date().toISOString(),
  });

  // Keep only latest 50
  const trimmed = history.slice(0, 50);

  await writeHistory(project, trimmed);
}
