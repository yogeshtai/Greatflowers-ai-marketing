// A project is one storefront brand the marketing agent works for (GreatFlowers, One Price Flowers, ...).
// Everything that differs between brands lives here; every service receives the project explicitly.

export interface TextPalette {
  primary: string;
  accent: string;
  secondary: string;
}

export interface ProjectVisual {
  // Official logo composited onto creatives (never recreated by the image model).
  logoUrl: string;
  // Every colour in the logo wordmark; the corner-contrast check must keep all of them legible.
  logoColours: readonly string[];
  // How the wordmark looks, told to the image model so it leaves a backdrop the logo reads on.
  logoAppearance: string;
  // Headline colour and the dark label colour used inside light markers.
  textPrimary: string;
  // Fill of the CTA pill on every creative (the storefront's button colour).
  ctaFill: string;
  // Fill of the website pill at the bottom of a creative.
  websiteCtaFill: string;
  // Copy palettes over light photographs (dark text) and dark photographs (light text).
  // Both lists run in the same accent order so one index picks the matching accent.
  darkTextPalettes: readonly TextPalette[];
  lightTextPalettes: readonly TextPalette[];
  // Blog hero title card.
  journalBar: string;
  journalLabel: string;
  // Lettering colours the image model may paint into integrated creatives (on-brand and legible).
  letteringColours: string;
}

export interface ProjectSchedule {
  timezone: string;
  blogDraftCron: string;
  wikiDraftCron: string;
  wikiRecoveryCrons: readonly string[];
  articleDraftCron: string;
  articleRecoveryCron: string;
}

export interface ProjectConfig {
  // Stable key: request header value, lock-name prefix and data folder name.
  id: string;
  // The project used when a request names none. Exactly one project is the default.
  isDefault: boolean;
  enabled: () => boolean;
  // Maps a GreatFlowers environment variable name (e.g. "META_PAGE_ID" or "GF_ADMIN_API_URL")
  // to the variable that holds this project's value. GreatFlowers keeps the original names.
  envName: (name: string) => string;
  // Reads one of this project's settings: process.env[envName(name)].
  env: (name: string) => string | undefined;
  // Folder for this project's JSON stores and generated images, relative to the working directory.
  dataDir: string;
  // Whether scheduled draft generation runs when a *_AUTOGENERATE setting is unset. GreatFlowers
  // keeps its original default (on); new brands start off until explicitly switched on.
  autogenerateByDefault: boolean;
  brand: {
    // Name used inside prompts and marketing copy, e.g. "GreatFlowers".
    name: string;
    // Name used in content bylines, closing links and the SEO title suffix, e.g. "Great Flowers".
    displayName: string;
    // Bare domain mentioned to the blog writer, e.g. "greatflowers.net".
    domain: string;
    // Matches the brand name inside an SEO title.
    namePattern: RegExp;
    // Hashtag that every Instagram post carries.
    hashtag: string;
    // Hermes skill holding this brand's strategy knowledge.
    hermesSkill: string;
    // Hermes skill for wiki/article/blog entries. When set, content prompts name it explicitly.
    contentSkill?: string;
    // One-line description given to the blog writer.
    businessDescription: string;
    // Examples of verified services a feature-focused creative may promote.
    featureExamples: string;
    // Brand-specific verified claims and wording rules appended to AI prompts.
    promptAddendum?: string;
    authors: readonly string[];
    defaultAuthor: string;
    journalLabel: string;
    // Badge above product cards inserted into wiki entries.
    productCardBadge: string;
  };
  storefront: {
    // Used when the storefront URL setting (GF_STOREFRONT_URL or its equivalent) is unset.
    defaultBaseUrl: string;
    // Path segments of public content URLs: <base>/<segment>/<slug>/
    paths: { product: string; blog: string; wiki: string; article: string };
    // Live pages scraped as website evidence for campaign recommendations.
    websiteContextPages: readonly string[];
    // Text of the website pill on creatives.
    ctaDisplayUrl: string;
    userAgent: string;
  };
  catalog: {
    productApiUrl: string;
  };
  s3: {
    // Key prefix for marketing images when the prefix settings are unset.
    defaultPrefix: string;
  };
  visual: ProjectVisual;
  schedule: ProjectSchedule;
}
