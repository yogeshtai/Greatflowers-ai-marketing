export const WIKI_AUTHORS = [
  "Mason Thomas",
  "Olivia Bennett",
  "Ethan Parker",
  "Grace Mitchell",
  "Noah Carter",
  "Ava Reynolds",
  "Lucas Hayes",
  "Chloe Morgan",
] as const;

export const DEFAULT_WIKI_AUTHOR = WIKI_AUTHORS[0];

export function isWikiAuthor(value: string): value is (typeof WIKI_AUTHORS)[number] {
  return (WIKI_AUTHORS as readonly string[]).includes(value);
}

// Pick once when the draft is created and persist the result. Excluding the
// three most recent names gives the wiki variety without changing a byline on
// retries, edits, image regeneration or publication.
export function selectWikiAuthor(recentAuthors: Array<string | undefined>, random: () => number = Math.random): string {
  const excluded = new Set(recentAuthors.filter((name): name is string => !!name).slice(0, 3));
  const candidates = WIKI_AUTHORS.filter((name) => !excluded.has(name));
  const pool = candidates.length ? candidates : [...WIKI_AUTHORS];
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
}
