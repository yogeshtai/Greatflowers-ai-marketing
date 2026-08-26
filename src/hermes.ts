import { spawn } from "node:child_process";

import {
  marketingStrategySchema,
  type MarketingStrategy,
} from "./strategy.schema.js";

export interface CampaignInput {
  campaignGoal: string;
  product: string;
  occasion?: string;
  audience: string;
  trafficSource: string;
  platforms: string[];
  priority: string;
  additionalContext?: string;
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
  ]
}

URL RULES:

All URL fields must contain ONLY the raw URL.

Correct:
"https://greatflowers.net/build-your-bouquet/"

Incorrect:
"[https://greatflowers.net/build-your-bouquet/](https://greatflowers.net/build-your-bouquet/)"

Never use Markdown link syntax anywhere in the JSON.

Only include platformContent entries for the platforms requested by the campaign.

Never place unsupported business claims inside the JSON.

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

export function generateMarketingStrategy(
  input: CampaignInput
): Promise<MarketingStrategy> {
  return new Promise((resolve, reject) => {
    const prompt = buildPrompt(input);

    const hermes = spawn(
      process.env.HERMES_BIN ||
        `${process.env.HOME}/.local/bin/hermes`,
      [
        "-s",
        "greatflowers-marketing-strategist",
        "-z",
        prompt,
      ],
      {
        env: process.env,
      }
    );

    let output = "";
    let errorOutput = "";

    hermes.stdout.on("data", (data) => {
      output += data.toString();
    });

    hermes.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    hermes.on("error", reject);

    hermes.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Hermes failed with code ${code}\n${errorOutput}`
          )
        );
        return;
      }

      try {
        const jsonText = extractJSON(output);
        const parsedJSON = JSON.parse(jsonText);

	const normalizedJSON = normalizeStrategyUrls(parsedJSON);

	const strategy =
  marketingStrategySchema.parse(normalizedJSON);

        resolve(strategy);
      } catch (error) {
        console.error("Raw Hermes output:", output);
        reject(error);
      }
    });
  });
}
