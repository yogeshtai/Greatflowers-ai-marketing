import { getProductAnalytics } from "../ga4.analytics.js";
import { getGreatFlowersWebsiteContext } from "../website.context.js";
import { getMetaConnectionStatus } from "../meta.service.js";
import express from "express";

const router = express.Router();

router.get(
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

router.get(
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

router.get(
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

export default router;
