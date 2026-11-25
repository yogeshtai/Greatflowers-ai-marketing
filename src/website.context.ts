import { withTimeoutSignal } from "./http.helpers.js";
import type { ProjectConfig } from "./projects/index.js";

export type WebsitePageContext = {
  url: string;
  title: string;
  text: string;
};

function cleanHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string) {
  const match = html.match(
    /<title[^>]*>(.*?)<\/title>/i
  );

  return match?.[1]?.trim() || "";
}

async function fetchPage(
  project: ProjectConfig,
  url: string,
  signal?: AbortSignal,
): Promise<WebsitePageContext> {
  const response = await fetch(url, {
    signal: withTimeoutSignal(15_000, signal),
    headers: {
      "User-Agent":
        project.storefront.userAgent,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Website fetch failed ${response.status}: ${url}`
    );
  }

  const html = await response.text();

  const text = cleanHtml(html);

  return {
    url,
    title: extractTitle(html),

    // Prevent huge AI prompts
    text: text.slice(0, 6000),
  };
}

// Live storefront pages used as website evidence for campaign recommendations.
export async function getWebsiteContext(project: ProjectConfig, signal?: AbortSignal) {
  const results = await Promise.allSettled(
    project.storefront.websiteContextPages.map((url) => fetchPage(project, url, signal))
  );

  return results
    .filter(
      (
        result
      ): result is PromiseFulfilledResult<WebsitePageContext> =>
        result.status === "fulfilled"
    )
    .map((result) => result.value);
}
