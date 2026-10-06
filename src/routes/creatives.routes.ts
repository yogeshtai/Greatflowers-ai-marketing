import { storyCreativePlanSchema } from "../strategy.schema.js";
import { z } from "zod";
import { generateStoryCreativePlan } from "../hermes.js";
import { singleFlight, abortOnDisconnect } from "../http.helpers.js";
import { campaignSchema } from "./campaign.schema.js";
import express from "express";

const router = express.Router();

router.post(
  "/api/creatives/generate",
  singleFlight("codex", async (req, res) => {
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

    try {
      console.log(
        "\n🎨 AI Creative Generation Request"
      );
      console.log(
        `Product: ${productImageUrl}`
      );

      const { generateAllCreatives } = await import(
        "../codex.creative.js"
      );

      const creatives =
        await generateAllCreatives(
          productImageUrl,
          creativeBrief,
          undefined,
          abortOnDisconnect(res)
        );

      return res.json({
        success: true,
        creatives,
        productImageUrl,
      });
    } catch (error) {
      console.error(
        "❌ Creative generation failed completely:",
        error
      );

      return res.json({
        success: true,
        creatives: [],
        productImageUrl,
        error: "Creative generation unavailable",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  })
);

router.post(
  "/api/creatives/generate/stream",
  singleFlight("codex", async (req, res) => {
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

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    console.log(
      "\n🎨 AI Creative Generation Stream Request"
    );
    console.log(
      `Product: ${productImageUrl}`
    );

    try {
      const { generateAllCreatives } = await import(
        "../codex.creative.js"
      );

      // Send initial event
      res.write(
        `data: ${JSON.stringify({
          type: "start",
          productImageUrl,
          total: creativeBrief.variants.length,
        })}\n\n`
      );

      await generateAllCreatives(
        productImageUrl,
        creativeBrief,
        (result, index, total) => {
          // Send progress event for each completed creative
          res.write(
            `data: ${JSON.stringify({
              type: "progress",
              creative: result,
              index,
              total,
              productImageUrl,
            })}\n\n`
          );
        },
        abortOnDisconnect(res)
      );

      // Send completion event
      res.write(
        `data: ${JSON.stringify({
          type: "complete",
        })}\n\n`
      );

      res.end();
    } catch (error) {
      console.error(
        "❌ Creative generation stream failed:",
        error
      );

      res.write(
        `data: ${JSON.stringify({
          type: "error",
          error: "Creative generation unavailable",
          productImageUrl,
          details:
            error instanceof Error
              ? error.message
              : String(error),
        })}\n\n`
      );

      res.end();
    }
  })
);

router.post("/api/creatives/story/plan", singleFlight("story-plan", async (req, res) => {
  const parsed = z.object({
    input: campaignSchema,
    selectedProduct: z.object({ name: z.string().min(1), image: z.string().url() }).passthrough(),
    // Existing campaigns may predate the current creativeBrief schema.
    strategy: z.object({ campaignObjective: z.string() }).passthrough(),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: "Invalid story planning input", details: parsed.error.issues });
  }
  const { input, selectedProduct, strategy } = parsed.data;
  if (input.product !== selectedProduct.name) {
    return res.status(400).json({ success: false, error: "Selected product does not match the campaign" });
  }
  try {
    const storyPlan = await generateStoryCreativePlan(input, selectedProduct, strategy);
    return res.json({ success: true, storyPlan });
  } catch (error) {
    console.error("Story planning failed:", error);
    return res.status(502).json({ success: false, error: "Story planning failed. Please try again." });
  }
}));

router.post(
  "/api/creatives/generate/story/stream",
  singleFlight("codex", async (req, res) => {
    const { productImageUrl, creativeBrief, storyPlan } =
      req.body;

    const parsedPlan = storyCreativePlanSchema.safeParse(storyPlan);
    if (!parsedPlan.success) {
      return res.status(400).json({ success: false,
        error: "Invalid story plan. Generate a new recommendation with reveal and scene directions.",
        details: parsedPlan.error.issues });
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

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    console.log(
      "\n🎬 Story Creative Generation Stream Request"
    );
    console.log(
      `Story Concept: ${storyPlan.carouselConcept}`
    );
    console.log(
      `Slides: ${storyPlan.slides.length}`
    );

    try {
      const { generateStoryCreatives } = await import(
        "../codex.story.js"
      );

      // Send initial event
      res.write(
        `data: ${JSON.stringify({
          type: "start",
          storyConcept: storyPlan.carouselConcept,
          total: storyPlan.slides.length,
        })}\n\n`
      );

      const result = await generateStoryCreatives(
        parsedPlan.data,
        creativeBrief,
        productImageUrl || null,
        (message) => {
          // Send progress log events
          res.write(
            `data: ${JSON.stringify({
              type: "log",
              message,
            })}\n\n`
          );
        },
        (slide, index, total) => {
          // Send each slide result the moment it completes, without
          // waiting for the remaining slides.
          res.write(
            `data: ${JSON.stringify({
              type: "progress",
              slide,
              index,
              order: slide.order,
              total,
            })}\n\n`
          );
        },
        abortOnDisconnect(res)
      );

      // Send completion event
      res.write(
        `data: ${JSON.stringify({
          type: "complete",
          success: result.success,
          storyConcept: result.storyConcept,
          error: result.error,
        })}\n\n`
      );

      res.end();
    } catch (error) {
      console.error(
        "❌ Story creative generation stream failed:",
        error
      );

      res.write(
        `data: ${JSON.stringify({
          type: "error",
          error: "Story creative generation unavailable",
          details:
            error instanceof Error
              ? error.message
              : String(error),
        })}\n\n`
      );

      res.end();
    }
  })
);

router.post(
  "/api/creatives/generate/variant",
  singleFlight("codex", async (req, res) => {
    const { productImageUrl, creativeBrief, variantType } =
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
      typeof creativeBrief !== "object" ||
      !Array.isArray(creativeBrief.variants)
    ) {
      return res.status(400).json({
        success: false,
        error:
          "creativeBrief with variants array is required",
      });
    }

    if (!variantType || typeof variantType !== "string") {
      return res.status(400).json({
        success: false,
        error: "variantType is required and must be a string",
      });
    }

    const variant = creativeBrief.variants.find(
      (v: { type: string }) => v.type === variantType
    );

    if (!variant) {
      return res.status(400).json({
        success: false,
        error: `Variant ${variantType} not found in creativeBrief`,
      });
    }

    try {
      const { generateCreativeVariant } = await import(
        "../codex.creative.js"
      );

      const creative = await generateCreativeVariant(
        variant,
        productImageUrl,
        creativeBrief,
        abortOnDisconnect(res)
      );

      return res.json({
        success: true,
        creative,
        productImageUrl,
      });
    } catch (error) {
      console.error(
        "❌ Single variant creative generation failed:",
        error
      );

      return res.json({
        success: true,
        creative: null,
        productImageUrl,
        error: "Creative generation unavailable",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  })
);

export default router;
