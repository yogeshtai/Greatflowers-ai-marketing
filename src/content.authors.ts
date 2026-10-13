export const CONTENT_AUTHORS = [
  "Mason Thomas",
  "Olivia Bennett",
  "Ethan Parker",
  "Grace Mitchell",
  "Noah Carter",
  "Ava Reynolds",
  "Lucas Hayes",
  "Chloe Morgan",
] as const;

export const DEFAULT_CONTENT_AUTHOR = CONTENT_AUTHORS[0];

export function isContentAuthor(value: string): value is (typeof CONTENT_AUTHORS)[number] {
  return (CONTENT_AUTHORS as readonly string[]).includes(value);
}

// Pick once when a draft is created and persist the result. Excluding the
// three most recent names adds variety without changing a byline on retries,
// edits, image regeneration or publication.
export function selectContentAuthor(recentAuthors: Array<string | undefined>, random: () => number = Math.random): string {
  const excluded = new Set(recentAuthors.filter((name): name is string => !!name).slice(0, 3));
  const candidates = CONTENT_AUTHORS.filter((name) => !excluded.has(name));
  const pool = candidates.length ? candidates : [...CONTENT_AUTHORS];
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
}
