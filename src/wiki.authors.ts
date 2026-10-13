import { CONTENT_AUTHORS, DEFAULT_CONTENT_AUTHOR, isContentAuthor, selectContentAuthor } from "./content.authors.js";

// Backwards-compatible wiki names; blogs and wikis deliberately share one
// approved byline pool so the public site presents a consistent editorial team.
export const WIKI_AUTHORS = CONTENT_AUTHORS;
export const DEFAULT_WIKI_AUTHOR = DEFAULT_CONTENT_AUTHOR;
export const isWikiAuthor = isContentAuthor;
export const selectWikiAuthor = selectContentAuthor;
