const WEBSITE_PAGES = [
  "https://greatflowers.net/",
  "https://greatflowers.net/build-your-bouquet/",
];

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
  url: string
): Promise<WebsitePageContext> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "GreatFlowers-AI-Marketing/1.0",
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

export async function getGreatFlowersWebsiteContext() {
  const results = await Promise.allSettled(
    WEBSITE_PAGES.map(fetchPage)
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