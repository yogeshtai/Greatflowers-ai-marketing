import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface RecommendationHistoryItem {
  productId: number;
  productName: string;
  occasion: string;
  recommendedAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");

const DATA_FILE = path.join(
  DATA_DIR,
  "recommendations.json"
);

async function ensureFile() {
  await mkdir(DATA_DIR, {
    recursive: true,
  });

  try {
    await readFile(DATA_FILE, "utf8");
  } catch {
    await writeFile(
      DATA_FILE,
      JSON.stringify([], null, 2)
    );
  }
}

async function readHistory(): Promise<
  RecommendationHistoryItem[]
> {
  await ensureFile();

  const content = await readFile(
    DATA_FILE,
    "utf8"
  );

  return JSON.parse(content);
}

async function writeHistory(
  items: RecommendationHistoryItem[]
) {
  await writeFile(
    DATA_FILE,
    JSON.stringify(items, null, 2)
  );
}

export async function getRecentRecommendations(
  limit = 5
) {
  const history = await readHistory();

  return history.slice(0, limit);
}

export async function recordRecommendation(
  item: Omit<
    RecommendationHistoryItem,
    "recommendedAt"
  >
) {
  const history = await readHistory();

  history.unshift({
    ...item,
    recommendedAt:
      new Date().toISOString(),
  });

  // Keep only latest 50
  const trimmed = history.slice(0, 50);

  await writeHistory(trimmed);
}