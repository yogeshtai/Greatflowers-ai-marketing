import { createRotationPlan, publishedRotationHistory } from "../campaign.rotation.js";
import { getGreatFlowersProducts } from "../greatflowers.products.js";
import { generateCampaignRecommendation } from "../campaign.recommender.js";
import { getProductAnalytics } from "../ga4.analytics.js";
import { getCampaigns } from "../campaign.store.js";
import { generateMarketingStrategy } from "../hermes.js";
import { getGreatFlowersWebsiteContext } from "../website.context.js";
import { getRecentRecommendations, recordRecommendation } from "../recommendation.store.js";
import { singleFlight, abortOnDisconnect, withRetry } from "../http.helpers.js";
import express from "express";

const router = express.Router();

router.post(
  "/api/recommendations/generate",
  singleFlight("recommendation", async (_req, res) => {
    const signal = abortOnDisconnect(res);

    try {
      console.log("① Fetching catalog + website...");

      // 1. Fetch real GreatFlowers products + website context
      const [
        products,
        websiteContext,
        recentRecommendations,
        rawAnalytics,
        savedCampaigns,
      ] = await Promise.all([
        getGreatFlowersProducts(),
        getGreatFlowersWebsiteContext(),
        getRecentRecommendations(20),

        // Use clean/new tracking initially.
        getProductAnalytics("today"),
        getCampaigns(),
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

      const rotationPlan = createRotationPlan(products, recentRecommendations, publishedRotationHistory(savedCampaigns));

      const recentHistory =
        recentRecommendations.map(
          (item) => `${item.productName} — ${item.occasion}`
        );

      console.log(
        "Recent campaign history:",
        recentHistory
      );

      console.log(
        "③ Hermes choosing campaign..."
      );

      const recommendation =
        await withRetry(() =>
          generateCampaignRecommendation(
            products,
            websiteContext,
            recentHistory,
            productAnalytics,
            signal,
            rotationPlan
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

      if (!selectedProduct || selectedProduct.stockStatus !== "in_stock" || !selectedProduct.image) {
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
            contentTheme: recommendation.contentTheme,
            visualTreatment: recommendation.visualTreatment,
            campaignGoal:
              recommendation.campaignGoal,

            product:
              selectedProduct.name,

            occasion:
              recommendation.occasion,

            creativeScenario:
              recommendation.creativeScenario,

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

Creative Scenario:
${recommendation.creativeScenario}

${recommendation.additionalContext}
`.trim(),
          }, signal)
        );

      console.log("⑥ Strategy complete");

      await recordRecommendation({
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        occasion: recommendation.occasion,
        contentTheme: recommendation.contentTheme,
        visualTreatment: recommendation.visualTreatment,
        creativeScenario: recommendation.creativeScenario,
        marketingAngle: recommendation.marketingAngle,
        visualDirection: strategy.creativeBrief?.backgroundDirection || "",
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
  })
);

export default router;
