// Readiness check for one project (brand): settings, storefront, admin API, Meta, GA4, S3, Hermes.
//
//   npm run check:project -- onepriceflowers
//   npm run check:project -- onepriceflowers --s3-write-test
//
// Every check is read-only except --s3-write-test, which uploads one tiny image to the project's
// marketing prefix, confirms Meta could download it from its public URL, and deletes it again.
// Setting values are never printed, only whether they are present.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { getProject, PROJECTS, type ProjectConfig } from "../projects/index.js";
import { missingSettings, OPTIONAL_SETTINGS, REQUIRED_SETTINGS } from "../projects/readiness.js";
import { contentAutomation, isSafeMode } from "../projects/automation.js";
import { createProjectS3Client, s3Settings, uploadProjectImage } from "../projects/storage.js";
import { getCatalogProducts } from "../catalog.products.js";
import { getWebsiteContext } from "../website.context.js";
import { withGfClient } from "../gf.admin.client.js";
import { getMetaConnectionStatus } from "../meta.service.js";
import { ensureInstagramPostingGap, InstagramCooldownError } from "../meta.publisher.js";
import { getProductAnalytics } from "../ga4.analytics.js";
import { ownedCampaignAsset } from "../campaign.assets.js";
import { errorDetail } from "../http.helpers.js";

type Status = "ok" | "warn" | "fail" | "info";
const ICON: Record<Status, string> = { ok: "✅", warn: "⚠️ ", fail: "❌", info: "ℹ️ " };
const results: Array<{ status: Status; area: string; detail: string }> = [];
const report = (status: Status, area: string, detail: string) => {
  results.push({ status, area, detail });
  console.log(`${ICON[status]} ${area}: ${detail}`);
};

async function check(area: string, run: () => Promise<string> | string, onError: Status = "fail") {
  try {
    report("ok", area, await run());
  } catch (error) {
    report(onError, area, errorDetail(error).slice(0, 300));
  }
}

const hasAll = (project: ProjectConfig, names: readonly string[]) => names.every((name) => !!project.env(name)?.trim());

async function main() {
  const [id = "greatflowers", ...flags] = process.argv.slice(2);
  const project = getProject(id);
  if (!project) {
    console.error(`Unknown project "${id}". Known: ${PROJECTS.map((p) => p.id).join(", ")}`);
    process.exit(2);
  }
  console.log(`\nReadiness check for ${project.brand.displayName} (${project.id})\n`);

  // ---- configuration --------------------------------------------------------------------
  report(project.enabled() ? "ok" : "warn", "Enabled",
    project.enabled() ? "yes" : project.isDefault ? "no" : `no - set ${project.envName("ENABLED")}=true when ready`);
  const missing = missingSettings(project);
  if (missing.length) {
    for (const [area] of Object.entries(REQUIRED_SETTINGS)) {
      const names = missing.filter((item) => item.area === area).map((item) => item.variable);
      if (names.length) report("fail", `Settings: ${area}`, `missing ${names.join(", ")}`);
    }
  } else {
    report("ok", "Settings", "all required settings are present");
  }
  for (const item of missingSettings(project, OPTIONAL_SETTINGS)) report("warn", `Settings: ${item.area}`, `${item.variable} not set (optional)`);

  for (const kind of ["BLOG", "WIKI", "ARTICLE"] as const) {
    const automation = contentAutomation(project, kind);
    report("info", `${kind[0]}${kind.slice(1).toLowerCase()} automation`,
      `autogenerate=${automation.autogenerate}, autoapprove=${automation.autoapprove}, publishLive=${automation.publishLive}, publishMode=${automation.publishMode}`);
  }
  report(isSafeMode(project) ? "ok" : (project.isDefault ? "info" : "warn"), "Safe mode",
    isSafeMode(project) ? "no timed drafts and published content stays hidden" : "automation or live publishing is on");
  const schedule = project.schedule;
  report("info", "Schedule", `blog "${schedule.blogDraftCron}", wiki "${schedule.wikiDraftCron}" (+${schedule.wikiRecoveryCrons.length} retry), article "${schedule.articleDraftCron}" (+retry "${schedule.articleRecoveryCron}"), ${schedule.timezone}`);

  // ---- public storefront ----------------------------------------------------------------
  await check("Catalog API", async () => {
    const products = await getCatalogProducts(project);
    const usable = products.filter((product) => product.stockStatus === "in_stock" && product.image);
    if (!usable.length) throw new Error(`${products.length} products, none in stock with an image`);
    return `${products.length} products (${usable.length} in stock with images), e.g. ${usable[0]!.url}`;
  });
  await check("Storefront pages", async () => {
    const pages = await getWebsiteContext(project);
    if (pages.length !== project.storefront.websiteContextPages.length) throw new Error(`only ${pages.length}/${project.storefront.websiteContextPages.length} pages loaded`);
    return pages.map((page) => page.title || page.url).join(" | ").slice(0, 200);
  });

  // ---- storefront admin API -------------------------------------------------------------
  if (hasAll(project, REQUIRED_SETTINGS["Storefront admin API (blogs, wikis, articles)"])) {
    await check("Admin API", () => withGfClient(project, async (client) => {
      const [blogs, wikis, articles, categories, topics, products] = await Promise.all([
        client.listBlogs(), client.listWikis(), client.listArticles(), client.listBlogCategories(), client.listArticleTopics(), client.searchProducts("", 5),
      ]);
      if (!categories.length) throw new Error("login works but no blog categories exist");
      if (!topics.length) throw new Error("login works but no Article Topics are configured");
      if (!products.length) throw new Error("login works but the admin product search is empty");
      return `login ok - ${blogs.length} blogs, ${wikis.length} wikis, ${articles.length} articles, ${categories.length} blog categories, ${topics.length} article topics`;
    }));
  } else report("info", "Admin API", "skipped until its settings are present");

  // ---- Meta -------------------------------------------------------------------------------
  if (hasAll(project, REQUIRED_SETTINGS["Meta publishing (Facebook + Instagram)"])) {
    await check("Meta accounts", async () => {
      const status = await getMetaConnectionStatus(project);
      return `Facebook page "${status.facebook.name}", Instagram @${status.instagram.username}`;
    });
    await check("Instagram posting gap", async () => {
      try {
        await ensureInstagramPostingGap(project);
        return "free to post now";
      } catch (error) {
        if (error instanceof InstagramCooldownError) return `last post was recent; next slot ${error.retryAt.toISOString()}`;
        throw error;
      }
    });
  } else report("info", "Meta accounts", "skipped until its settings are present");

  // ---- GA4 ------------------------------------------------------------------------------
  if (project.env("GA4_PROPERTY_ID")) {
    await check("GA4", async () => `${(await getProductAnalytics(project, "7daysAgo")).length} product rows in the last 7 days`, "warn");
  }

  // ---- S3 -------------------------------------------------------------------------------
  await check("S3 settings", () => {
    const settings = s3Settings(project);
    if (!settings.bucket || !settings.region) throw new Error("bucket or region missing");
    return `bucket ${settings.bucket} (${settings.region}), creative prefix ${settings.creativePrefix}/, campaign prefix ${settings.campaignPrefix}/`;
  });
  if (flags.includes("--s3-write-test")) {
    await check("S3 write + public read + delete", async () => {
      const settings = s3Settings(project);
      const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
      const url = await uploadProjectImage(project, "campaign", `readiness-check-${randomUUID()}.jpg`, image, "image/jpeg");
      const owned = ownedCampaignAsset(project, url);
      if (!owned || !("key" in owned)) throw new Error(`uploaded ${url} but it is outside the project's marketing prefix`);
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(`uploaded, but the public URL returned ${response.status}; Meta needs public read on ${settings.campaignPrefix}/*`);
        return `uploaded, publicly readable and removed (${owned.key})`;
      } finally {
        const client = createProjectS3Client(settings, "us-east-1");
        await client.send(new DeleteObjectCommand({ Bucket: settings.bucket!, Key: owned.key })).finally(() => client.destroy());
      }
    });
  } else report("info", "S3 write test", "skipped (run with --s3-write-test)");

  // ---- Hermes -----------------------------------------------------------------------------
  report("info", "Hermes skills", [project.brand.hermesSkill, project.brand.contentSkill].filter(Boolean).join(", ") + " (installed on the Hermes host)");
  await check("Hermes API", async () => {
    const chatUrl = process.env.HERMES_API_URL || "http://127.0.0.1:8642/v1/chat/completions";
    const response = await fetch(chatUrl.replace(/\/chat\/completions\/?$/, "/models"), {
      headers: { Authorization: `Bearer ${process.env.HERMES_API_KEY ?? ""}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`models endpoint returned ${response.status}`);
    return "reachable";
  }, "warn");

  const failures = results.filter((result) => result.status === "fail").length;
  const warnings = results.filter((result) => result.status === "warn").length;
  console.log(`\n${failures ? "❌" : "✅"} ${failures} failing, ${warnings} warnings\n`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
