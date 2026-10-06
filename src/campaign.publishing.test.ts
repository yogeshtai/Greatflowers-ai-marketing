import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// This file runs in its own Node test process, with a disposable data directory.
test("publishing records successful platforms and preserves history after a partial failure", async () => {
  const originalCwd = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), "greatflowers-publishing-"));
  try {
    process.chdir(directory);
    await mkdir("data");
    await writeFile("data/campaigns.json", JSON.stringify([{
      id: "test", status: "approved", publishStatus: "scheduled",
      scheduledAt: "2026-12-01T12:00:00Z", scheduleRecurrence: "weekly",
      input: { product: "Bouquet" }, strategy: {}, createdAt: "2026-01-01", updatedAt: "2026-01-01",
    }]));
    const { withCampaignPublishing, getCampaignById } = await import("./campaign.store.js");
    await withCampaignPublishing("test", async () => ({ published: true }), "facebook");
    const successful = await getCampaignById("test");
    assert.ok(successful?.publishedAt);
    assert.deepEqual(successful.publishedPlatforms, ["facebook"]);
    assert.equal(successful.publishStatus, "scheduled");
    assert.equal(successful.scheduleRecurrence, "weekly");
    await assert.rejects(() => withCampaignPublishing("test", async () => { throw new Error("Instagram failed"); }, "instagram"), /Instagram failed/);
    assert.deepEqual(await getCampaignById("test"), successful);
    await withCampaignPublishing("test", async () => ({ published: true }), "instagram");
    await withCampaignPublishing("test", async () => ({ published: true }), "facebook");
    assert.deepEqual((await getCampaignById("test"))?.publishedPlatforms, ["facebook", "instagram"]);
  } finally {
    process.chdir(originalCwd);
    await rm(directory, { recursive: true, force: true });
  }
});
