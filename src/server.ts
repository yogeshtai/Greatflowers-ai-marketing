import "dotenv/config";
import {
  getGreatFlowersProducts,
} from "./greatflowers.products.js";
import {
  startCampaignScheduler,
} from "./campaign.scheduler.js";
import {
  generateCampaignRecommendation,
} from "./campaign.recommender.js";
import {
  getProductAnalytics,
} from "./ga4.analytics.js";
import {
  publishFacebook,
  publishInstagram,
} from "./meta.publisher.js";
import {
  getCampaigns,
  getCampaignById,
  saveCampaign,
  updateCampaignStatus,
  updateCampaign,
} from "./campaign.store.js";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { generateMarketingStrategy } from "./hermes.js";
import {
  getGreatFlowersWebsiteContext,
} from "./website.context.js";
import {
  getRecentRecommendations,
  recordRecommendation,
} from "./recommendation.store.js";
import {
  getMetaConnectionStatus,
} from "./meta.service.js";
import { prepareInstagramImage } from "./meta.image.js";

const app = express();

const allowedOrigins = [
  "https://marketing-admin.greatflowers.net",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header (curl/server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json());

const campaignSchema = z.object({
  campaignGoal: z.string().min(1),
  product: z.string().min(1),

  occasion: z.string().optional(),

  audience: z.string().min(1),

  trafficSource: z.string().default("Organic Social"),

  platforms: z
    .array(z.string())
    .min(1),

  priority: z.string().default("Conversions"),

  additionalContext: z.string().optional(),
});

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    service: "GreatFlowers AI Marketing",
  });
});

app.post("/api/strategies/generate", async (req, res) => {
  try {
    const parsed = campaignSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid campaign input",
        details: parsed.error.flatten(),
      });
    }

    const strategy = await generateMarketingStrategy(parsed.data);

    return res.json({
      success: true,
      strategy,
    });
  } catch (error) {
    console.error("Strategy generation failed:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to generate marketing strategy",
    });
  }
});

app.post("/api/campaigns", async (req, res) => {
  try {
    const {
      input,
      strategy,
      selectedProduct,
    } = req.body;

    if (!input || !strategy) {
      return res.status(400).json({
        success: false,
        error: "Input and strategy are required",
      });
    }

    const campaign = await saveCampaign(
      input,
      strategy,
      selectedProduct
    );

    return res.status(201).json({
      success: true,
      campaign,
    });
  } catch (error) {
    console.error(
      "Save campaign failed:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Failed to save campaign",
    });
  }
});

app.get("/api/campaigns", async (_req, res) => {
  try {
    const campaigns = await getCampaigns();

    return res.json({
      success: true,
      campaigns,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: "Failed to get campaigns",
    });
  }
});

app.get(
  "/api/campaigns/:id",
  async (req, res) => {
    const campaign = await getCampaignById(
      req.params.id
    );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }

    return res.json({
      success: true,
      campaign,
    });
  }
);

app.patch(
  "/api/campaigns/:id/status",
  async (req, res) => {
    const status = req.body.status;

    if (
      !["draft", "approved", "rejected"].includes(
        status
      )
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid campaign status",
      });
    }

    const campaign =
      await updateCampaignStatus(
        req.params.id,
        status
      );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: "Campaign not found",
      });
    }

    return res.json({
      success: true,
      campaign,
    });
  }
);

app.get(
  "/api/greatflowers/products",
  async (_req, res) => {
    try {
      const products =
        await getGreatFlowersProducts();

      return res.json({
        success: true,
        count: products.length,
        products,
      });
    } catch (error) {
      console.error(
        "GreatFlowers products failed:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to fetch GreatFlowers products",
      });
    }
  }
);

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 1
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }

    console.log("AI call failed. Retrying once...");

    return withRetry(
      fn,
      retries - 1
    );
  }
}

app.post(
  "/api/recommendations/generate",
  async (_req, res) => {
    try {
      console.log("① Fetching catalog + website...");

      // 1. Fetch real GreatFlowers products + website context
      const [
        products,
        websiteContext,
        recentRecommendations,
        rawAnalytics,
      ] = await Promise.all([
        getGreatFlowersProducts(),
        getGreatFlowersWebsiteContext(),
        getRecentRecommendations(5),

        // Use clean/new tracking initially.
        getProductAnalytics("today"),
      ]);

      const validProductIds =
        new Set(
          products.map(
            (product) => String(product.id)
          )
        );

      const productAnalytics =
        rawAnalytics.filter(
          (analytics) =>
            validProductIds.has(
              analytics.itemId
            )
        );

      console.log(
        "GA4 product analytics:",
        productAnalytics
      );

      console.log(
        "Recent recommendations:",
        recentRecommendations.map(
          (item) => item.productName
        )
      );

      const excludedProductIds =
        new Set(
          recentRecommendations.map(
            (item) => item.productId
          )
        );

      const availableProducts =
        products.filter(
          (product) =>
            !excludedProductIds.has(
              product.id
            )
        );

      console.log(
        `Rotation: ${products.length} total → ${availableProducts.length} available`
      );

      console.log(
        "③ Hermes choosing campaign..."
      );


      const recentOccasions =
        recentRecommendations.map(
          (item) => item.occasion
        );


      console.log(
        "Recent occasions:",
        recentOccasions
      );

      console.log(
        "GA4 product analytics:",
        productAnalytics
      );

      console.log(
        "③ Hermes choosing campaign..."
      );

      const recommendation =
        await withRetry(() =>
          generateCampaignRecommendation(
            availableProducts,
            websiteContext,
            recentOccasions,
            productAnalytics
          )
        );

      console.log(
        "④ Recommendation received:",
        recommendation.selectedProductName
      );

      // 3. Verify AI selected a real catalog product
      const selectedProduct =
        products.find(
          (product) =>
            product.id ===
            recommendation.selectedProductId
        );

      const selectedProductAnalytics =
        productAnalytics.find(
          (item) =>
            item.itemId ===
            String(selectedProduct?.id)
        ) || null;

      if (!selectedProduct) {
        throw new Error(
          "Hermes selected an invalid product"
        );
      }

      console.log(
        "⑤ Generating full strategy..."
      );

      // 4. Generate complete strategy
      const strategy =
        await withRetry(() =>
          generateMarketingStrategy({
            campaignGoal:
              recommendation.campaignGoal,

            product:
              selectedProduct.name,

            occasion:
              recommendation.occasion,

            audience:
              recommendation.audience,

            trafficSource:
              recommendation.trafficSource,

            platforms:
              recommendation.platforms,

            priority:
              recommendation.priority,

            additionalContext: `
Recommended automatically from the live GreatFlowers catalog.

VERIFIED LIVE PRODUCT DATA:

Product ID:
${selectedProduct.id}

Product Name:
${selectedProduct.name}

Product URL:
${selectedProduct.url}

Product Image:
${selectedProduct.image}

Price:
${selectedProduct.price}

Stock Status:
${selectedProduct.stockStatus}

Categories:
${selectedProduct.categories.join(", ")}

Product Description:
${selectedProduct.description}

IMPORTANT:
The information above came directly from the live GreatFlowers product API.
Treat it as verified product information.

Do not put these supplied facts inside needsVerification.

Recommendation Reason:
${recommendation.reasonForSelection}

Customer Intent:
${recommendation.customerIntent}

Suggested Marketing Angle:
${recommendation.marketingAngle}

${recommendation.additionalContext}
`.trim(),
          })
        );

      console.log("⑥ Strategy complete");

      await recordRecommendation({
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        occasion:
          recommendation.occasion,
      });

      console.log(
        "⑦ Recommendation added to rotation history"
      );

      return res.json({
        success: true,

        recommendation,

        selectedProduct,

        strategy,

        evidence: {
          catalog: {
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            price: selectedProduct.price,
            stockStatus:
              selectedProduct.stockStatus,
            categories:
              selectedProduct.categories,
            image: selectedProduct.image,
            url: selectedProduct.url,
          },

          decisionSummary:
            recommendation.decisionSummary,

          websiteEvidence:
            recommendation.websiteEvidence,

          catalogEvidence:
            recommendation.catalogEvidence,

          analyticsEvidence:
            recommendation.analyticsEvidence,

          rotationEvidence:
            recommendation.rotationEvidence,

          assumptions:
            recommendation.assumptions,

          websitePagesChecked:
            websiteContext.map((page) => ({
              title: page.title,
              url: page.url,
            })),

          recentCampaigns:
            recentRecommendations.map(
              (item) => ({
                productName:
                  item.productName,
                occasion:
                  item.occasion,
                recommendedAt:
                  item.recommendedAt,
              })
            ),

          analytics:
            selectedProductAnalytics,

          analyticsAvailable:
            productAnalytics.length > 0,
        },
      });
    } catch (error) {
      console.error(
        "❌ Recommendation pipeline failed:",
        error
      );

      return res.status(500).json({
        success: false,

        error:
          "Failed to generate campaign recommendation",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

app.post(
  "/api/creatives/generate",
  async (req, res) => {
    try {
      const { productImageUrl, creativeBrief } =
        req.body;

      if (
        !productImageUrl ||
        typeof productImageUrl !== "string"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "productImageUrl is required and must be a string",
        });
      }

      if (
        !creativeBrief ||
        typeof creativeBrief !== "object"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "creativeBrief is required and must be an object",
        });
      }

      console.log(
        "\n🎨 AI Creative Generation Request"
      );
      console.log(
        `Product: ${productImageUrl}`
      );

      const { generateAllCreatives } = await import(
        "./codex.creative.js"
      );

      const creatives =
        await generateAllCreatives(
          productImageUrl,
          creativeBrief
        );

      return res.json({
        success: true,
        creatives,
      });
    } catch (error) {
      console.error(
        "❌ Creative generation failed:",
        error
      );

      return res.status(500).json({
        success: false,
        error: "Failed to generate creatives",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

app.get(
  "/api/greatflowers/website-context",
  async (_req, res) => {
    try {
      const pages =
        await getGreatFlowersWebsiteContext();

      return res.json({
        success: true,
        count: pages.length,
        pages,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        success: false,
        error:
          "Failed to fetch GreatFlowers website context",
      });
    }
  }
);

app.get(
  "/api/analytics/products",
  async (_req, res) => {
    try {
      const products =
        await getProductAnalytics();

      return res.json({
        success: true,
        count: products.length,
        products,
      });
    } catch (error) {
      console.error(
        "GA4 analytics failed:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to fetch GA4 analytics",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

app.get(
  "/api/meta/status",
  async (_req, res) => {
    try {
      const accounts =
        await getMetaConnectionStatus();

      return res.json({
        success: true,
        accounts,
      });
    } catch (error) {
      console.error(
        "Meta connection failed:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Failed to connect to Meta",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

app.get(
  "/api/campaigns/:id/meta-preview",
  async (req, res) => {
    try {
      const campaign =
        await getCampaignById(req.params.id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
      }

      if (campaign.status !== "approved") {
        return res.status(400).json({
          success: false,
          error:
            "Campaign must be approved before publishing",
        });
      }

      const facebook =
        campaign.strategy.platformContent.facebook;

      const instagram =
        campaign.strategy.platformContent.instagram;

      return res.json({
        success: true,

        campaignId: campaign.id,

        product: campaign.selectedProduct
          ? {
              id: campaign.selectedProduct.id,
              name: campaign.selectedProduct.name,
              url: campaign.selectedProduct.url,
              image: campaign.selectedProduct.image,
            }
          : null,

        facebook: facebook
          ? {
              message: [
                facebook.post,
                facebook.cta || "",
              ]
                .filter(Boolean)
                .join("\n\n"),
            }
          : null,

        instagram: instagram
          ? {
              caption: [
                instagram.caption,
                instagram.hashtags.join(" "),
                campaign.selectedProduct?.url || "",
              ]
                .filter(Boolean)
                .join("\n\n"),

              image:
                campaign.selectedProduct?.image ||
                null,
            }
          : null,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: "Failed to create Meta preview",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

app.post(
  "/api/campaigns/:id/publish/facebook",
  async (req, res) => {
    try {
      const campaign =
        await getCampaignById(req.params.id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
      }

      if (campaign.status !== "approved") {
        return res.status(400).json({
          success: false,
          error:
            "Campaign must be approved before publishing",
        });
      }

      const result =
        await publishFacebook(campaign);

      return res.json({
        success: true,
        result,
      });
    } catch (error) {
      console.error(
        "Facebook publishing failed:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Facebook publishing failed",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

app.post(
  "/api/campaigns/:id/publish/instagram",
  async (req, res) => {
    try {
      const campaign =
        await getCampaignById(req.params.id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: "Campaign not found",
        });
      }

      if (campaign.status !== "approved") {
        return res.status(400).json({
          success: false,
          error:
            "Campaign must be approved before publishing",
        });
      }

      const result =
        await publishInstagram(campaign);

      return res.json({
        success: true,
        result,
      });
    } catch (error) {
      console.error(
        "Instagram publishing failed:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Instagram publishing failed",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }
);

app.post(
  "/api/campaigns/:id/schedule",
  async (req, res) => {
    try {
      const campaign =
        await getCampaignById(
          req.params.id
        );

      if (!campaign) {
        return res
          .status(404)
          .json({
            success: false,
            error:
              "Campaign not found",
          });
      }

      if (
        campaign.status !==
        "approved"
      ) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Only approved campaigns can be scheduled",
          });
      }

      const {
        scheduledAt,
        timezone =
          "America/Los_Angeles",
        platforms = [
          "facebook",
          "instagram",
        ],
        recurrence =
          "none",
        maxAttempts = 3,
      } = req.body;

      if (!scheduledAt) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "scheduledAt is required",
          });
      }

      const scheduledDate =
        new Date(scheduledAt);

      if (
        Number.isNaN(
          scheduledDate.getTime()
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Invalid scheduledAt",
          });
      }

      if (
        scheduledDate.getTime() <=
        Date.now()
      ) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Schedule must be in the future",
          });
      }

      const allowedPlatforms = [
        "facebook",
        "instagram",
      ];

      const selectedPlatforms =
        platforms.filter(
          (platform: string) =>
            allowedPlatforms.includes(
              platform
            )
        );

      if (
        selectedPlatforms.length === 0
      ) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Select at least one platform",
          });
      }

      if (
        ![
          "none",
          "daily",
          "weekly",
        ].includes(recurrence)
      ) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Invalid recurrence",
          });
      }

      const updated =
        await updateCampaign(
          campaign.id,
          {
            scheduledAt:
              scheduledDate.toISOString(),

            scheduledTimezone:
              timezone,

            scheduledPlatforms:
              selectedPlatforms,

            scheduleRecurrence:
              recurrence,

            publishStatus:
              "scheduled",

            publishAttempts: 0,

            maxPublishAttempts:
              maxAttempts,
          }
        );

      return res.json({
        success: true,
        campaign: updated,
      });
    } catch (error) {
      console.error(
        "Schedule failed:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          error:
            "Failed to schedule campaign",
        });
    }
  }
);

app.patch(
  "/api/campaigns/:id/schedule",
  async (req, res) => {
    try {
      const campaign =
        await getCampaignById(
          req.params.id
        );

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error:
            "Campaign not found",
        });
      }

      if (
        campaign.status !==
        "approved"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Only approved campaigns can be scheduled",
        });
      }

      const {
        scheduledAt,
        timezone,
        platforms,
        recurrence,
      } = req.body;

      const updates: Partial<
        typeof campaign
      > = {
        publishStatus:
          "scheduled",
      };

      if (scheduledAt) {
        const date =
          new Date(scheduledAt);

        if (
          Number.isNaN(
            date.getTime()
          ) ||
          date.getTime() <=
            Date.now()
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Invalid schedule time",
          });
        }

        updates.scheduledAt =
          date.toISOString();
      }

      if (timezone) {
        updates.scheduledTimezone =
          timezone;
      }

      if (platforms) {
        updates.scheduledPlatforms =
          platforms;
      }

      if (recurrence) {
        updates.scheduleRecurrence =
          recurrence;
      }

      const updated =
        await updateCampaign(
          campaign.id,
          updates
        );

      return res.json({
        success: true,
        campaign: updated,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error:
          "Failed to reschedule campaign",
      });
    }
  }
);

app.post(
  "/api/campaigns/:id/schedule/cancel",
  async (req, res) => {
    try {
      const campaign =
        await getCampaignById(
          req.params.id
        );

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error:
            "Campaign not found",
        });
      }

      const updated =
        await updateCampaign(
          campaign.id,
          {
            publishStatus:
              "cancelled",
          }
        );

      return res.json({
        success: true,
        campaign: updated,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error:
          "Failed to cancel schedule",
      });
    }
  }
);

app.get("/api/meta/test-image", async (req, res) => {
  try {
    const originalImage =
      "https://greatflowers.s3.us-west-2.amazonaws.com/products/img/european-meadow.webp";

    const instagramImage =
      await prepareInstagramImage(originalImage);

    return res.json({
      success: true,
      originalImage,
      instagramImage,
    });
  } catch (error) {
    console.error("Instagram image test failed:", error);

    return res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
});

const PORT = process.env.PORT || 3000;

startCampaignScheduler();

app.listen(PORT, () => {
  console.log(
    `🌸 GreatFlowers AI Marketing API running on http://localhost:${PORT}`
  );
});
