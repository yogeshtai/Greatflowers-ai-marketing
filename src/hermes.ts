
import {
  marketingStrategySchema,
  type MarketingStrategy,
} from "./strategy.schema.js";

export interface CampaignInput {
  campaignGoal: string;
  product: string;
  occasion?: string | undefined;
  audience: string;
  trafficSource: string;
  platforms: string[];
  priority: string;
  additionalContext?: string | undefined;
}

function buildPrompt(input: CampaignInput): string {
  return `
Campaign Goal: ${input.campaignGoal}

Product / Feature: ${input.product}

Occasion: ${input.occasion || "Not specified"}

Audience: ${input.audience}

Traffic Source: ${input.trafficSource}

Platforms: ${input.platforms.join(", ")}

Priority: ${input.priority}

Additional Context: ${input.additionalContext || "None"}

IMPORTANT OUTPUT INSTRUCTIONS:

Return ONLY valid JSON.

Do not use Markdown.
Do not use markdown code fences.
Do not add any explanation before or after the JSON.

FACT VS HYPOTHESIS RULE:

If a marketing statement is not supported by verified GreatFlowers data,
treat it as a hypothesis or recommendation.

Do not present assumptions about customer behavior,
conversion likelihood, or platform performance as verified facts.

Put important hypotheses inside the "assumptions" array.

VERIFIED PRODUCT DATA RULE:

When live GreatFlowers product information is provided
inside Additional Context, treat those supplied product fields
as verified.

Do not ask to verify information already provided,
such as:

- product name
- product description
- price
- stock status
- categories
- product URL
- product image

needsVerification should contain ONLY genuinely missing information,
such as delivery eligibility, current promotions,
cutoff times, inventory details not supplied,
or performance data that has not been provided.

Use exactly this structure:

{
  "campaignObjective": "string",

  "targetCustomer": "string",

  "customerIntent": [
    "string"
  ],

  "customerProblemOrDesire": "string",

  "emotionalTriggers": [
    "string"
  ],

  "marketingAngle": "string",

  "valueProposition": "string",

  "cta": {
    "primary": "string",
    "secondary": "string",
    "destinationUrl": "string"
  },

  "whyThisCouldWork": "string",

  "platformContent": {
    "instagram": {
      "visualConcept": "string",
      "caption": "string",
      "hashtags": ["string"]
    },

    "facebook": {
      "post": "string",
      "cta": "string"
    },

    "pinterest": {
      "titles": ["string"],
      "description": "string",
      "keywords": ["string"],
      "destinationUrl": "string"
    },

    "x": {
      "post": "string"
    },

    "youtubeShorts": {
      "hook": "string",
      "scenes": ["string"],
      "voiceoverOrText": "string",
      "cta": "string",
      "length": "string"
    }
  },

  "abTests": [
    {
      "name": "string",
      "angle": "string",
      "focus": "string",
      "measure": ["string"]
    }
  ],

  "assumptions": [
    "string"
  ],

  "needsVerification": [
    "string"
  ],

  "creativeBrief": {
    "headline": "string",
    "subheadline": "string",
    "cta": "string",
    "mood": "string",
    "backgroundDirection": "string",
    "productTreatment": "string",
    "logoPlacement": "string",
    "textPlacement": "string",
    "creativeGoal": "string",
    "variants": [
      {
        "type": "emotional",
        "headline": "string",
        "subheadline": "string",
        "cta": "string",
        "visualDirection": "string"
      },
      {
        "type": "product-focused",
        "headline": "string",
        "subheadline": "string",
        "cta": "string",
        "visualDirection": "string"
      }
    ]
  }
}

CREATIVE BRIEF RULES:

The creativeBrief is for a future AI visual-generation system that will create social media campaign images.

The future system will use:
- the REAL GreatFlowers product image from the catalog
- the official GreatFlowers logo (https://greatflowers.net/assets/svg/greatflowers-logo.svg)
- your creative brief instructions

to generate finished campaign creatives.

IMPORTANT PRODUCT ACCURACY RULE:

The real catalog product image will be used as the hero product.

Do NOT instruct the image generator to redesign or replace the product.

The creativeBrief may describe:
- background environment
- lighting
- mood
- layout/composition
- typography placement
- decorative elements

The creativeBrief must NOT request changes to:
- flower types
- flower colors
- bouquet composition
- vase/container
- arrangement style
- core product appearance

productTreatment field:

Must explicitly state to preserve the real product.

Example wording:
"Use the real GreatFlowers product image as the hero product. Preserve the bouquet, flower colors, arrangement, container and important product details faithfully. Do not redesign the product."

You may adapt slightly based on the product, but the meaning must remain.

headline:

Short primary ad headline suitable for image creative.
Avoid long paragraphs.
Keep concise.

subheadline:

One short supporting sentence.
Must not invent unsupported claims.

cta:

Short CTA suitable for social advertising.

Safe CTA examples:
- Send Flowers
- Shop Flowers
- Explore the Collection
- Send Something Thoughtful
- Shop [Product Name]

Do NOT create unsupported CTAs:
- Get 50% Off (unless verified promotion exists)
- Guaranteed Delivery Today (unless verified)
- Lowest Price (unless verified)

mood:

Overall visual/emotional direction.

Examples:
- calm, comforting and elegant
- romantic, warm and premium
- cheerful, bright and celebratory

backgroundDirection:

Describe the surrounding scene/environment for the image generator.

Example:
"Soft premium interior with natural window light, neutral tones and subtle botanical elements."

Describe environment only.
Do NOT tell the generator to replace or redesign the bouquet.

logoPlacement:

Simple design instruction for the GreatFlowers logo.

Examples:
- top-left with comfortable margin
- centered at top
- bottom-right, small and unobtrusive

textPlacement:

Simple composition instruction.

Example:
"Place headline in the upper-left negative space and CTA below it without covering the bouquet."

creativeGoal:

Short statement explaining what this creative should achieve.

Example:
"Create a respectful sympathy ad that communicates thoughtfulness while keeping the real product as the visual focus."

variants:

You MUST return exactly 2 creative variants.

Each variant must have a different type:

1. type: "emotional"
Focus on recipient emotion / occasion / customer need.

2. type: "product-focused"
Focus more directly on the selected product and its verified catalog characteristics.

Each variant should have:
- different headline
- different approach
- different visualDirection

Do not duplicate the exact same headline across all variants.

SAME-DAY DELIVERY RULE:

If delivery messaging is used in creative copy, use safe wording:
"Same-day delivery available in eligible areas."

Do NOT say:
- Same-day delivery guaranteed
- Same-day delivery everywhere
- Order now for guaranteed same-day delivery

unless explicitly verified.

FACTUAL SAFETY RULES FOR CREATIVE COPY:

Do NOT invent:
- discounts or coupon codes
- prices
- delivery guarantees
- customer reviews or ratings
- order counts or popularity claims
- bestseller claims
- sales performance claims
- flower contents not in verified product data
- statistics or competitor comparisons

Creative copy must come from:
1. verified live website information
2. verified selected-product information
3. the selected campaign occasion/intent
4. explicitly supported campaign context

If something is unknown, do not state it as fact.

URL RULES:

All URL fields must contain ONLY the raw URL.

Correct:
"https://greatflowers.net/build-your-bouquet/"

Incorrect:
"[https://greatflowers.net/build-your-bouquet/](https://greatflowers.net/build-your-bouquet/)"

Never use Markdown link syntax anywhere in the JSON.

Only include platformContent entries for the platforms requested by the campaign.

Never place unsupported business claims inside the JSON.

The creativeBrief is REQUIRED for all new strategies.

FACT CLASSIFICATION:

- Facts supplied in Additional Context are verified facts.
- Do not put supplied product facts into needsVerification.
- Unknown information belongs in needsVerification.
- Marketing hypotheses belong in assumptions.
- Do not present hypotheses as facts.

WHY THIS COULD WORK RULE:

"whyThisCouldWork" must clearly distinguish verified catalog evidence
from marketing hypotheses.

Statements about:
- cultural associations
- customer preferences
- emotional response
- visual performance
- standing out on social media
- likelihood of conversion

must use hypothesis language such as:

"may"
"could"
"we recommend testing"
"worth testing"

Do not state these as verified facts.

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
}

function extractJSON(output: string): string {
  let cleaned = output.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("Hermes did not return JSON");
  }

  return cleaned.slice(start, end + 1);
}

function normalizeUrl(value?: string): string | undefined {
  if (!value) return value;

  const markdownLink = value.match(/^\[([^\]]+)\]\([^)]+\)$/);

  if (markdownLink) {
    return markdownLink[1];
  }

  return value.trim();
}

function normalizeStrategyUrls(data: any) {
  if (data?.cta?.destinationUrl) {
    data.cta.destinationUrl = normalizeUrl(
      data.cta.destinationUrl
    );
  }

  if (data?.platformContent?.pinterest?.destinationUrl) {
    data.platformContent.pinterest.destinationUrl =
      normalizeUrl(
        data.platformContent.pinterest.destinationUrl
      );
  }

  return data;
}

export async function generateMarketingStrategy(
  input: CampaignInput
): Promise<MarketingStrategy> {
  const apiUrl =
    process.env.HERMES_API_URL ||
    "http://127.0.0.1:8642/v1/chat/completions";

  const apiKey = process.env.HERMES_API_KEY;

  if (!apiKey) {
    throw new Error("HERMES_API_KEY is not configured");
  }

  const prompt = `
Use the greatflowers-marketing-strategist skill.

${buildPrompt(input)}
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

    const normalizedJSON =
      normalizeStrategyUrls(parsedJSON);

    return marketingStrategySchema.parse(
      normalizedJSON
    );
  } catch (error) {
    console.error("Raw Hermes output:", output);
    throw error;
  }
}
