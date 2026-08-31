import type {
  WebsitePageContext,
} from "./website.context.js";
import {
  campaignRecommendationSchema,
  type CampaignRecommendation,
} from "./recommendation.schema.js";

import type {
  MarketingProduct,
} from "./greatflowers.products.js";

export type ProductAnalyticsSignal = {
  itemId: string;
  itemName: string;
  views: number;
  addToCarts: number;
  checkouts: number;
  purchases: number;
};

function extractJSON(output: string) {
  let cleaned = output.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error(
      "Hermes did not return recommendation JSON"
    );
  }

  return cleaned.slice(start, end + 1);
}

function createCompactCatalog(
  products: MarketingProduct[]
) {
  return products
    .filter(
      (product) =>
        product.stockStatus === "in_stock" &&
        product.image
    )
    .map((product) => ({
      id: product.id,
      name: product.name,
      description:
        product.description.slice(0, 220),
      price: product.price,
      categories: product.categories,
      url: product.url,
      image: product.image,
    }));
}

export async function generateCampaignRecommendation(
  products: MarketingProduct[],
  websiteContext: WebsitePageContext[],
  recentOccasions: string[] = [],
  analytics: ProductAnalyticsSignal[] = []
): Promise<CampaignRecommendation> {
  const apiUrl =
    process.env.HERMES_API_URL ||
    "http://127.0.0.1:8642/v1/chat/completions";

  const apiKey = process.env.HERMES_API_KEY;

  if (!apiKey) {
    throw new Error("HERMES_API_KEY is not configured");
  }

  const catalog =
    createCompactCatalog(products);

  const today = new Date()
    .toISOString()
    .slice(0, 10);

  const liveWebsiteContext =
    websiteContext.map((page) => ({
      url: page.url,
      title: page.title,
      text: page.text.slice(0, 3500),
    }));

  const prompt = `
Use the greatflowers-marketing-strategist skill.

You are choosing what GreatFlowers should market next.

Market:
United States

Current Date:
${today}

Primary Objective:
Generate orders.

Below is the REAL current GreatFlowers product catalog.

CATALOG:
${JSON.stringify(catalog)}

LIVE GREATFLOWERS WEBSITE CONTEXT:

${JSON.stringify(liveWebsiteContext)}

RECENT CAMPAIGN OCCASIONS:

${JSON.stringify(recentOccasions)}

CAMPAIGN ROTATION RULE:

Avoid repeatedly choosing the same primary occasion.

If the recent campaigns heavily use the same occasion,
prefer another strong and relevant occasion when appropriate.

Do not choose an irrelevant or weaker campaign only for variety.


REAL GREATFLOWERS GA4 BEHAVIOR DATA:

${JSON.stringify(analytics)}

GA4 DATA RULES:

This data comes from actual GreatFlowers website behavior.

Metrics mean:

- views = product items viewed
- addToCarts = items added to cart
- checkouts = items entering checkout
- purchases = items purchased

The current analytics sample is still small
and product tracking was recently standardized.

Therefore:

- Treat GA4 data as supporting evidence only.
- Do not claim statistical significance.
- Do not claim trends from a small number of events.
- Do not assume products with zero activity are unpopular.
- Do not assume the product with the most views is the best product.
- Do not penalize products that have no analytics data yet.
- Do not make causal claims.

Use wording such as:
"early signal"
"limited data"
"worth testing"
"not enough evidence yet"

When useful GA4 evidence exists,
include it inside catalogEvidence.

If the data is too limited,
say that instead of inventing a conclusion.

WEBSITE CONTEXT RULES:

This content was fetched from the live GreatFlowers website.

Use it to understand:
- current promotions
- current seasonal messaging
- currently promoted categories/features
- feature availability
- current website positioning

IMPORTANT:

Live website information takes priority over older stored
GreatFlowers knowledge when they conflict.

If the website says a feature is unavailable,
coming soon, or still being set up,
do NOT recommend that feature for a conversion campaign.

Do not automatically generalize location-specific delivery
messages to the entire United States.

Delivery cutoff times, same-day eligibility, and location-specific
availability must be treated carefully unless their nationwide
scope is explicitly confirmed.

Do not recommend unavailable products or features.

TASK:

Choose exactly ONE product from this catalog that would be a strong candidate for the next marketing campaign.

Then determine:

1. Best relevant occasion
2. Customer intent
3. Marketing angle
4. Audience
5. Recommended social platforms
6. Why this product should be tested

IMPORTANT RULES:

- Only choose a product that exists in the supplied catalog.
- Use the exact supplied product ID and product name.
- Do not invent product facts.
- Do not invent discounts.
- Do not invent delivery guarantees.
- Do not invent sales statistics.

PERFORMANCE DATA RULE:

GreatFlowers now has real GA4 behavior data,
but the current sample size is limited and tracking
was only recently standardized.

Therefore:

- Do not use ordersCount as a ranking signal.
- Use GA4 behavior only as supporting evidence.
- Catalog fit, occasion relevance, website context,
  campaign rotation, and marketing reasoning remain important.
- Do not declare winners or losers from small samples.
- Do not assume products with zero analytics activity are unpopular.
- Do not assume products with more views are automatically better.
- Recommendations should still be treated as experiments.

As more analytics data is collected,
behavioral signals can become more important.

Do NOT use sale price information.
Its business meaning has not been verified.

Seasonal or customer-behavior reasoning that is not supported directly by GreatFlowers data must go into "assumptions".

Choose recommendations for TESTING.
Do not claim that the recommendation is guaranteed to perform.

Return ONLY valid JSON.

No Markdown.
No code fences.
No explanation outside JSON.

Use exactly:

{
  "selectedProductId": 0,
  "selectedProductName": "string",

  "occasion": "string",

  "audience": "string",

  "campaignGoal": "Generate orders",

  "trafficSource": "Organic Social",

  "platforms": [
    "Instagram",
    "Facebook",
    "Pinterest",
    "X",
    "YouTube Shorts"
  ],

  "priority": "Conversions",

  "reasonForSelection": "string",

  "customerIntent": "string",

  "marketingAngle": "string",

  "catalogEvidence": [
    "string"
  ],

  "assumptions": [
    "string"
  ],

  "additionalContext": "string"
}

CAMPAIGN FOCUS RULE:

Choose exactly ONE primary occasion or customer intent.

Do not combine many occasions into a single campaign.

Prefer a focused campaign with one clear customer reason to buy.

Examples:

Good:
Occasion: Birthday

Good:
Occasion: Just Because

Good:
Occasion: Get Well Soon

Bad:
Occasion: Birthday, Anniversary, Congratulations, Get Well Soon, New Baby

If a product fits many occasions, select the ONE occasion
that gives the strongest marketing angle for this campaign.

STRICT FACT RULE:

Clearly separate verified catalog facts from marketing hypotheses.

Verified catalog facts include only information directly supplied
in the product catalog.

Do not present consumer behavior, seasonal demand,
cultural associations, audience preferences,
conversion potential, or platform performance as facts.

For unsupported strategic reasoning, use wording such as:

- "may"
- "could"
- "we recommend testing"
- "hypothesis"
- "worth testing"

All campaign recommendations are experiments,
not guaranteed outcomes.

RECOMMENDATION REASON RULE:

reasonForSelection should primarily use verified catalog evidence.

Any inferred marketing reasoning must be clearly phrased
as a hypothesis using words such as "may", "could",
or "worth testing".

EVIDENCE RULES:

Facts directly available in the supplied catalog may be stated as facts.

Examples:
- product name
- product description
- price
- stock status
- categories
- product URL

Do not ask to verify information already supplied by the live catalog.

Do not infer consumer demand from how frequently a category
appears in the catalog.

Do not describe a price as:
"affordable",
"accessible",
"good value",
"budget friendly"
or similar unless this is explicitly framed as a hypothesis.

Do not claim that an occasion has steady, daily, seasonal,
growing, or high demand unless performance data supports it.

Catalog structure is not customer-behavior data.

When the reasoning is not directly supported by catalog facts,
put it in "assumptions".

CRITICAL PROGRAMMATIC OUTPUT RULE:

You are being called by a backend API.

Return the complete JSON response directly in your final response.

DO NOT:
- create or write files
- save JSON to disk
- return a file path
- return a summary of the campaign
- tell the user that JSON is ready somewhere
- use tools to persist the response

The backend can only read your final stdout response.

Your final response MUST start with {
and MUST end with }

Return the complete JSON object directly.

`.trim();

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "hermes-agent",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Hermes API failed (${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as any;

  const output = data?.choices?.[0]?.message?.content;

  if (!output || typeof output !== "string") {
    console.error("Unexpected Hermes API response:", data);
    throw new Error("Hermes API returned no message content");
  }

  try {
    const jsonText = extractJSON(output);
    const parsedJSON = JSON.parse(jsonText);

    const recommendation =
      campaignRecommendationSchema.parse(parsedJSON);

    return recommendation;
  } catch (error) {
    console.error("Raw Hermes output:", output);
    throw error;
  }
}