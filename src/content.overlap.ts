export type ContentKind = "blog" | "wiki" | "article";

export interface ContentTitle {
  kind: ContentKind;
  title: string;
  slug?: string;
}

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "great", "how", "in", "is", "of", "on", "or", "the", "to", "with",
  "flower", "flowers", "floral", "guide", "online",
]);

export const normalizeContentTitle = (value: string) => value
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

export function contentTitleTokens(value: string): Set<string> {
  return new Set(normalizeContentTitle(value).split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
    .map((token) => token.length > 3 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token));
}

export function titleSimilarity(left: string, right: string): number {
  const a = contentTitleTokens(left);
  const b = contentTitleTokens(right);
  if (!a.size || !b.size) return normalizeContentTitle(left) === normalizeContentTitle(right) ? 1 : 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

export function findTitleCollision(candidate: string, inventory: ContentTitle[]): { item: ContentTitle; score: number } | undefined {
  const normalized = normalizeContentTitle(candidate);
  const candidateTokens = contentTitleTokens(candidate);
  return inventory
    .map((item) => ({ item, score: titleSimilarity(candidate, item.title), exact: normalizeContentTitle(item.title) === normalized }))
    .filter(({ item, score, exact }) => {
      if (exact) return true;
      const existingTokens = contentTitleTokens(item.title);
      const shorter = Math.min(candidateTokens.size, existingTokens.size);
      const shared = [...candidateTokens].filter((token) => existingTokens.has(token)).length;
      return shorter >= 3 && score >= 0.72 && shared / shorter >= 0.8;
    })
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score)[0];
}

export function assertNoTitleCollision(candidate: string, inventory: ContentTitle[]) {
  const collision = findTitleCollision(candidate, inventory);
  if (!collision) return;
  const slug = collision.item.slug ? ` (${collision.item.slug})` : "";
  throw new Error(`topic overlaps existing ${collision.item.kind}: "${collision.item.title}"${slug}; update that page instead`);
}
