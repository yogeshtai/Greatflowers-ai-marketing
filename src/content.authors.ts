export const CONTENT_AUTHORS = [
  "Great Flowers Editorial Team",
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

// New drafts use a transparent, consistent editorial byline. The legacy names
// remain accepted so old drafts can still be edited and published unchanged.
export function selectContentAuthor(recentAuthors: Array<string | undefined>, random: () => number = Math.random): (typeof CONTENT_AUTHORS)[number] {
  // Keep legacy names valid for existing drafts, but use one stable byline for
  // all newly generated content. This name must correspond to the site's
  // maintained author profile.
  void recentAuthors;
  void random;
  return DEFAULT_CONTENT_AUTHOR;
}
