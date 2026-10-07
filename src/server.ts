import "dotenv/config";
import cors from "cors";
import express from "express";
import { startCampaignScheduler } from "./campaign.scheduler.js";
import { startBlogScheduler } from "./blog.scheduler.js";
import blogsRoutes from "./routes/blogs.routes.js";
import campaignsRoutes from "./routes/campaigns.routes.js";
import recommendationsRoutes from "./routes/recommendations.routes.js";
import creativesRoutes from "./routes/creatives.routes.js";
import infoRoutes from "./routes/info.routes.js";
import publishingRoutes from "./routes/publishing.routes.js";

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

// Serve generated creative images
app.use('/test-creatives', express.static('test-creatives'));

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    service: "GreatFlowers AI Marketing",
  });
});

app.use(campaignsRoutes);
app.use(recommendationsRoutes);
app.use(creativesRoutes);
app.use(infoRoutes);
app.use(publishingRoutes);
app.use(blogsRoutes);

const PORT = process.env.PORT || 3000;

startCampaignScheduler();
startBlogScheduler();

app.listen(PORT, () => {
  console.log(
    `🌸 GreatFlowers AI Marketing API running on http://localhost:${PORT}`
  );
});
