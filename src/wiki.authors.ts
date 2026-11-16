import { contentAuthors, defaultContentAuthor, isContentAuthor, selectContentAuthor } from "./content.authors.js";

// Backwards-compatible wiki names; blogs and wikis deliberately share one
// approved byline pool per project so each storefront presents a consistent editorial team.
export const wikiAuthors = contentAuthors;
export const defaultWikiAuthor = defaultContentAuthor;
export const isWikiAuthor = isContentAuthor;
export const selectWikiAuthor = selectContentAuthor;
