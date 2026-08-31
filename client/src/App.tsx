import { useEffect, useState } from "react";
import {
  generateStrategy,
  saveCampaign,
  getCampaigns,
  updateCampaignStatus,
  recommendCampaign,
} from "./api/marketing";
import "./App.css";

type RecommendationEvidence = {
  catalog: {
    productId: number;
    productName: string;
    price: number | null;
    stockStatus: string;
    categories: string[];
    image: string | null;
    url: string;
  };

  catalogEvidence: string[];

  websitePagesChecked: {
    title: string;
    url: string;
  }[];

  recentCampaigns: {
    productName: string;
    occasion: string;
    recommendedAt: string;
  }[];

  analytics: {
    itemId: string;
    itemName: string;
    views: number;
    addToCarts: number;
    checkouts: number;
    purchases: number;
  } | null;

  analyticsAvailable: boolean;

  assumptions: string[];
};

type Strategy = {
  campaignObjective: string;
  targetCustomer: string;
  customerIntent: string[];
  customerProblemOrDesire: string;
  emotionalTriggers: string[];
  marketingAngle: string;
  valueProposition: string;

  cta: {
    primary: string;
    secondary?: string;
    destinationUrl?: string;
  };

  whyThisCouldWork: string;

  platformContent: {
    instagram?: {
      visualConcept: string;
      caption: string;
      hashtags: string[];
    };

    facebook?: {
      post: string;
      cta?: string;
    };

    pinterest?: {
      titles: string[];
      description: string;
      keywords: string[];
      destinationUrl?: string;
    };

    x?: {
      post: string;
    };

    youtubeShorts?: {
      hook: string;
      scenes: string[];
      voiceoverOrText: string;
      cta: string;
      length?: string;
    };
  };

  abTests: {
    name: string;
    angle: string;
    focus: string;
    measure: string[];
  }[];

  assumptions: string[];
  needsVerification: string[];
};

type CampaignStatus = "draft" | "approved" | "rejected";

type SavedCampaign = {
  id: string;

  input: {
    campaignGoal: string;
    product: string;
    occasion?: string;
    audience: string;
    trafficSource: string;
    platforms: string[];
    priority: string;
    additionalContext?: string;
  };

  strategy: Strategy;

  status: CampaignStatus;

  createdAt: string;
  updatedAt: string;

  publishStatus?: "draft" | "scheduled" | "published" | "failed";
  scheduledAt?: string;
  scheduledPlatforms?: string[];
  scheduledTimezone?: string;
  scheduleRecurrence?: string;
  publishedAt?: string;
  publishAttempts?: number;
  publishError?: string;
};

const availablePlatforms = [
  "Instagram",
  "Facebook",
  "Pinterest",
  "X",
  "YouTube Shorts",
];

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function scheduleCampaignPost(campaignId: string, payload: any) {
  const response = await fetch(
    `${API_BASE}/api/campaigns/${campaignId}/schedule`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Scheduling failed");
  }

  return data;
}

async function rescheduleCampaignPost(campaignId: string, payload: any) {
  const response = await fetch(
    `${API_BASE}/api/campaigns/${campaignId}/schedule`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Rescheduling failed");
  }

  return data;
}

async function cancelCampaignSchedule(campaignId: string) {
  const response = await fetch(
    `${API_BASE}/api/campaigns/${campaignId}/schedule/cancel`,
    {
      method: "POST",
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Cancel failed");
  }

  return data;
}

function App() {
  const [campaigns, setCampaigns] = useState<SavedCampaign[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedCampaignId, setSavedCampaignId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [, setRecommendationReason] = useState<string | null>(null);
  const [form, setForm] = useState({
    campaignGoal: "Generate orders",
    product: "Build Your Bouquet",
    occasion: "Birthday",
    audience: "US customers",
    trafficSource: "Organic Social",
    priority: "Conversions",
    additionalContext: "",
  });
  const [
    scheduleCampaign,
    setScheduleCampaign,
  ] = useState<SavedCampaign | null>(null);
  const [
    scheduleForm,
    setScheduleForm,
  ] = useState({
    date: "",
    time: "",
    timezone: "Asia/Kolkata",
    facebook: true,
    instagram: true,
    recurrence: "none",
  });

  const [platforms, setPlatforms] = useState<string[]>([
    "Instagram",
    "Facebook",
    "Pinterest",
  ]);

  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [
    recommendationEvidence,
    setRecommendationEvidence,
  ] = useState<RecommendationEvidence | null>(null);
  const [recommendedProduct, setRecommendedProduct] =
    useState<any | null>(null);

  const updateField = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const togglePlatform = (platform: string) => {
    setPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((item) => item !== platform)
        : [...prev, platform]
    );
  };

  const handleGenerate = async () => {
    if (!form.product.trim()) {
      setError("Product or feature is required.");
      return;
    }

    if (platforms.length === 0) {
      setError("Select at least one platform.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSavedCampaignId(null);
      setStrategy(null);
      setRecommendationEvidence(null);
      setRecommendedProduct(null);

      const response = await generateStrategy({
        ...form,
        platforms,
      });

      setStrategy(response.strategy);
    } catch (err) {
      console.error(err);

      setError(
        "Could not generate the strategy. Make sure the Node API and Hermes are running."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCampaign = (
    campaign: SavedCampaign
  ) => {
    setForm({
      campaignGoal: campaign.input.campaignGoal,
      product: campaign.input.product,
      occasion: campaign.input.occasion || "",
      audience: campaign.input.audience,
      trafficSource: campaign.input.trafficSource,
      priority: campaign.input.priority,
      additionalContext:
        campaign.input.additionalContext || "",
    });

    setPlatforms(campaign.input.platforms);

    setStrategy(campaign.strategy);

    setSavedCampaignId(campaign.id);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const handleStatusChange = async (
    id: string,
    status: CampaignStatus
  ) => {
    try {
      await updateCampaignStatus(id, status);

      await loadCampaigns();
    } catch (error) {
      console.error(
        "Failed to update campaign:",
        error
      );
    }
  };

  const loadCampaigns = async () => {
    try {
      setHistoryLoading(true);

      const response = await getCampaigns();

      setCampaigns(response.campaigns);
    } catch (error) {
      console.error("Failed to load campaigns:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSaveCampaign = async () => {
    if (!strategy) return;

    try {
      setSaving(true);

      const input = {
        ...form,
        platforms,
      };

      const response = await saveCampaign(
        input,
        strategy,
        recommendedProduct
      );

      setSavedCampaignId(response.campaign.id);

      await loadCampaigns();
    } catch (error) {
      console.error("Save failed:", error);

      setError("Could not save campaign.");
    } finally {
      setSaving(false);
    }
  };

  const handleRecommendCampaign = async () => {
    try {
      setRecommending(true);
      setError("");
      setSavedCampaignId(null);

      const response =
        await recommendCampaign();

      const {
        recommendation,
        selectedProduct,
        strategy,
        evidence,
      } = response;

      setRecommendedProduct(selectedProduct);
      setRecommendationEvidence(evidence);

      setForm({
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

        priority:
          recommendation.priority,

        additionalContext:
          recommendation.additionalContext || "",
      });

      setPlatforms(
        recommendation.platforms
      );

      setRecommendationReason(
        recommendation.reasonForSelection
      );

      setStrategy(strategy);
    } catch (error) {
      console.error(
        "Recommendation failed:",
        error
      );

      setError(
        "Could not generate an automatic campaign recommendation."
      );
    } finally {
      setRecommending(false);
    }
  };

  const handleScheduleSubmit = async () => {
    if (!scheduleCampaign) {
      return;
    }

    if (
      !scheduleForm.date ||
      !scheduleForm.time
    ) {
      alert("Select date and time");
      return;
    }

    const platforms: string[] = [];

    if (scheduleForm.facebook) {
      platforms.push("facebook");
    }

    if (scheduleForm.instagram) {
      platforms.push("instagram");
    }

    if (!platforms.length) {
      alert("Select at least one platform");
      return;
    }

    try {
      const scheduledAt =
        new Date(
          `${scheduleForm.date}T${scheduleForm.time}`
        ).toISOString();

      if (
        scheduleCampaign.publishStatus ===
        "scheduled" ||
        scheduleCampaign.publishStatus ===
        "failed"
      ) {
        await rescheduleCampaignPost(
          scheduleCampaign.id,
          {
            scheduledAt,
            timezone:
              scheduleForm.timezone,
            platforms,
            recurrence:
              scheduleForm.recurrence,
          }
        );
      } else {
        await scheduleCampaignPost(
          scheduleCampaign.id,
          {
            scheduledAt,
            timezone:
              scheduleForm.timezone,
            platforms,
            recurrence:
              scheduleForm.recurrence,
            maxAttempts: 3,
          }
        );
      }

      setScheduleCampaign(null);

      setScheduleForm({
        date: "",
        time: "",
        timezone: "Asia/Kolkata",
        facebook: true,
        instagram: true,
        recurrence: "none",
      });

      await loadCampaigns();
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Scheduling failed"
      );
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  return (
    <main className="app">
      <header className="header">
        <div>
          <span className="eyebrow">GreatFlowers</span>
          <h1>AI Marketing Strategist</h1>
          <p>
            Build conversion-focused campaigns using customer intent,
            emotional positioning and GreatFlowers brand knowledge.
          </p>
        </div>
      </header>

      <section className="panel form-panel">
        <div className="section-heading">
          <div>
            <span className="step">Campaign Input</span>
            <h2>Create a new strategy</h2>
          </div>
        </div>

        <div className="form-grid">
          <label>
            Campaign Goal
            <input
              name="campaignGoal"
              value={form.campaignGoal}
              onChange={updateField}
            />
          </label>

          <label>
            Product / Feature
            <input
              name="product"
              value={form.product}
              onChange={updateField}
            />
          </label>

          <label>
            Occasion
            <input
              name="occasion"
              value={form.occasion}
              onChange={updateField}
            />
          </label>

          <label>
            Audience
            <input
              name="audience"
              value={form.audience}
              onChange={updateField}
            />
          </label>

          <label>
            Traffic Source
            <input
              name="trafficSource"
              value={form.trafficSource}
              onChange={updateField}
            />
          </label>

          <label>
            Priority
            <input
              name="priority"
              value={form.priority}
              onChange={updateField}
            />
          </label>
        </div>

        <div className="platform-section">
          <span className="label-title">Platforms</span>

          <div className="platforms">
            {availablePlatforms.map((platform) => (
              <button
                type="button"
                key={platform}
                className={
                  platforms.includes(platform)
                    ? "platform active"
                    : "platform"
                }
                onClick={() => togglePlatform(platform)}
              >
                {platform}
              </button>
            ))}
          </div>
        </div>

        <label>
          Additional Context
          <textarea
            name="additionalContext"
            value={form.additionalContext}
            onChange={updateField}
            rows={4}
            placeholder="Example: Focus on personalization and avoid aggressive urgency."
          />
        </label>

        {error && <div className="error">{error}</div>}

        <button
          className="generate-button"
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading
            ? "Generating strategy..."
            : "Generate Marketing Strategy"}
        </button>

        <button
          type="button"
          className="recommend-button"
          onClick={handleRecommendCampaign}
          disabled={recommending || loading}
        >
          {recommending
            ? "Analyzing GreatFlowers Catalog..."
            : "✨ Recommend Campaign"}
        </button>

        {loading && (
          <p className="loading-note">
            Hermes is analyzing customer intent and preparing the campaign.
            This may take around a minute.
          </p>
        )}
      </section>

      {strategy && (
        <section className="results">
          <div className="result-header">
            <span className="step">Generated Strategy</span>
            <h2>
              {form.occasion || "Campaign"} — {form.product}
            </h2>

            <div className="result-actions">
              <button
                className="secondary-button"
                onClick={handleGenerate}
                disabled={loading}
              >
                {loading
                  ? "Regenerating..."
                  : "Regenerate Strategy"}
              </button>

              <button
                className="primary-action-button"
                onClick={handleSaveCampaign}
                disabled={saving || !!savedCampaignId}
              >
                {saving
                  ? "Saving..."
                  : savedCampaignId
                    ? "Saved ✓"
                    : "Save Campaign"}
              </button>
            </div>
          </div>

          {recommendationEvidence && (
            <section className="evidence-panel">
              <div className="evidence-heading">
                <span className="step">
                  Recommendation Evidence
                </span>

                <h2>
                  Why was this campaign recommended?
                </h2>

                <p>
                  Data and context checked before creating
                  this campaign.
                </p>
              </div>

              <div className="evidence-grid">
                <div className="evidence-card">
                  <h3>Product / Catalog</h3>

                  <strong>
                    {
                      recommendationEvidence.catalog
                        .productName
                    }
                  </strong>

                  <p>
                    $
                    {
                      recommendationEvidence.catalog
                        .price
                    }{" "}
                    ·{" "}
                    {
                      recommendationEvidence.catalog
                        .stockStatus
                    }
                  </p>

                  <div className="tags">
                    {recommendationEvidence.catalog.categories
                      .slice(0, 6)
                      .map((category) => (
                        <span key={category}>
                          {category}
                        </span>
                      ))}
                  </div>

                  <BulletList
                    items={
                      recommendationEvidence.catalogEvidence
                    }
                  />
                </div>

                <div className="evidence-card">
                  <h3>Live Website Checked</h3>

                  {recommendationEvidence.websitePagesChecked.map(
                    (page) => (
                      <div
                        className="evidence-row"
                        key={page.url}
                      >
                        <span>✓</span>

                        <a
                          href={page.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {page.title}
                        </a>
                      </div>
                    )
                  )}
                </div>

                <div className="evidence-card">
                  <h3>Recent Campaigns</h3>

                  {recommendationEvidence.recentCampaigns
                    .length === 0 ? (
                    <p>
                      No previous recommendation history.
                    </p>
                  ) : (
                    recommendationEvidence.recentCampaigns.map(
                      (campaign, index) => (
                        <div
                          className="history-evidence-row"
                          key={`${campaign.productName}-${index}`}
                        >
                          <strong>
                            {campaign.productName}
                          </strong>

                          <span>
                            {campaign.occasion}
                          </span>
                        </div>
                      )
                    )
                  )}
                </div>

                <div className="evidence-card">
                  <h3>GA4 Customer Behavior</h3>

                  {recommendationEvidence.analytics ? (
                    <div className="analytics-grid">
                      <Metric
                        label="Views"
                        value={
                          recommendationEvidence.analytics
                            .views
                        }
                      />

                      <Metric
                        label="Add to Cart"
                        value={
                          recommendationEvidence.analytics
                            .addToCarts
                        }
                      />

                      <Metric
                        label="Checkout"
                        value={
                          recommendationEvidence.analytics
                            .checkouts
                        }
                      />

                      <Metric
                        label="Purchases"
                        value={
                          recommendationEvidence.analytics
                            .purchases
                        }
                      />
                    </div>
                  ) : (
                    <p className="muted">
                      No clean GA4 behavior data is
                      available for this product yet.
                      Recommendation was not based on
                      performance data.
                    </p>
                  )}
                </div>
              </div>

              {recommendationEvidence.assumptions.length >
                0 && (
                  <div className="hypothesis-box">
                    <h3>AI Hypotheses to Test</h3>

                    <BulletList
                      items={
                        recommendationEvidence.assumptions
                      }
                    />
                  </div>
                )}
            </section>
          )}

          <div className="strategy-grid">
            <Card title="Campaign Objective">
              <p>{strategy.campaignObjective}</p>
            </Card>

            <Card title="Target Customer">
              <p>{strategy.targetCustomer}</p>
            </Card>

            <Card title="Marketing Angle">
              <p>{strategy.marketingAngle}</p>
            </Card>

            <Card title="Customer Intent">
              <BulletList items={strategy.customerIntent} />
            </Card>

            <Card title="Emotional Triggers">
              <div className="tags">
                {strategy.emotionalTriggers.map((trigger) => (
                  <span key={trigger}>{trigger}</span>
                ))}
              </div>
            </Card>

            <Card title="Customer Problem / Desire">
              <p>{strategy.customerProblemOrDesire}</p>
            </Card>

            <Card title="Value Proposition">
              <p>{strategy.valueProposition}</p>
            </Card>

            <Card title="Primary CTA">
              <strong>{strategy.cta.primary}</strong>

              {strategy.cta.secondary && (
                <p>{strategy.cta.secondary}</p>
              )}

              {strategy.cta.destinationUrl && (
                <a
                  href={strategy.cta.destinationUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {strategy.cta.destinationUrl}
                </a>
              )}
            </Card>

            <Card title="Why This Could Work">
              <p>{strategy.whyThisCouldWork}</p>
            </Card>
          </div>

          <h2 className="content-title">Platform Content</h2>

          <div className="platform-content">
            {strategy.platformContent.instagram && (
              <Card title="Instagram">
                <h4>Visual Concept</h4>
                <p>
                  {strategy.platformContent.instagram.visualConcept}
                </p>

                <h4>Caption</h4>
                <p className="content-copy">
                  {strategy.platformContent.instagram.caption}
                </p>

                <div className="tags">
                  {strategy.platformContent.instagram.hashtags.map(
                    (tag) => (
                      <span key={tag}>{tag}</span>
                    )
                  )}
                </div>

                <CopyButton
                  text={`${strategy.platformContent.instagram.caption}

${strategy.platformContent.instagram.hashtags.join(" ")}`}
                  label="Copy Instagram Content"
                />
              </Card>
            )}

            {strategy.platformContent.facebook && (
              <Card title="Facebook">
                <p className="content-copy">
                  {strategy.platformContent.facebook.post}
                </p>

                {strategy.platformContent.facebook.cta && (
                  <>
                    <h4>CTA</h4>
                    <p>
                      {strategy.platformContent.facebook.cta}
                    </p>
                  </>
                )}

                <CopyButton
                  text={`${strategy.platformContent.facebook.post}

${strategy.platformContent.facebook.cta || ""}`}
                  label="Copy Facebook Post"
                />
              </Card>
            )}

            {strategy.platformContent.pinterest && (
              <Card title="Pinterest">
                <h4>Pin Titles</h4>

                <BulletList
                  items={strategy.platformContent.pinterest.titles}
                />

                <h4>Description</h4>

                <p>
                  {strategy.platformContent.pinterest.description}
                </p>

                <h4>Keywords</h4>

                <div className="tags">
                  {strategy.platformContent.pinterest.keywords.map(
                    (keyword) => (
                      <span key={keyword}>{keyword}</span>
                    )
                  )}
                </div>

                <CopyButton
                  text={`${strategy.platformContent.pinterest.titles.join("\n")}

${strategy.platformContent.pinterest.description}

Keywords:
${strategy.platformContent.pinterest.keywords.join(", ")}`}
                  label="Copy Pinterest Content"
                />
              </Card>
            )}

            {strategy.platformContent.x && (
              <Card title="X">
                <p className="content-copy">
                  {strategy.platformContent.x.post}
                </p>
                <CopyButton
                  text={strategy.platformContent.x.post}
                  label="Copy X Post"
                />
              </Card>
            )}

            {strategy.platformContent.youtubeShorts && (
              <Card title="YouTube Shorts / Reel">
                <h4>Hook</h4>
                <p>{strategy.platformContent.youtubeShorts.hook}</p>

                <h4>Scenes</h4>
                <BulletList
                  items={strategy.platformContent.youtubeShorts.scenes}
                />

                <h4>Voiceover / Text</h4>
                <p>
                  {
                    strategy.platformContent.youtubeShorts
                      .voiceoverOrText
                  }
                </p>

                <h4>CTA</h4>
                <p>{strategy.platformContent.youtubeShorts.cta}</p>
                <CopyButton
                  text={`${strategy.platformContent.youtubeShorts.hook}

Scenes:
${strategy.platformContent.youtubeShorts.scenes.join("\n")}

${strategy.platformContent.youtubeShorts.voiceoverOrText}

CTA:
${strategy.platformContent.youtubeShorts.cta}`}
                  label="Copy YouTube Content"
                />
              </Card>
            )}
          </div>

          <h2 className="content-title">A/B Tests</h2>

          <div className="strategy-grid">
            {strategy.abTests.map((test) => (
              <Card key={test.name} title={test.name}>
                <h4>Angle</h4>
                <p>{test.angle}</p>

                <h4>Focus</h4>
                <p>{test.focus}</p>

                <h4>Measure</h4>
                <BulletList items={test.measure} />
              </Card>
            ))}
          </div>

          {strategy.assumptions.length > 0 && (
            <>
              <h2 className="content-title">Assumptions</h2>

              <Card title="Marketing hypotheses">
                <BulletList items={strategy.assumptions} />
              </Card>
            </>
          )}

          {strategy.needsVerification.length > 0 && (
            <>
              <h2 className="content-title">
                Needs Verification
              </h2>

              <div className="warning-card">
                <BulletList
                  items={strategy.needsVerification}
                />
              </div>
            </>
          )}
        </section>
      )}

      <section className="history-section">
        <div className="history-header">
          <div>
            <span className="step">Campaign Library</span>
            <h2>Campaign History</h2>
          </div>

          <button
            className="secondary-button"
            onClick={loadCampaigns}
            disabled={historyLoading}
          >
            {historyLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {campaigns.length === 0 ? (
          <div className="empty-state">
            <h3>No saved campaigns yet</h3>

            <p>
              Generate a marketing strategy and save it to
              build your campaign history.
            </p>
          </div>
        ) : (
          <div className="campaign-list">
            {campaigns.map((campaign) => (
              <article
                className="campaign-item"
                key={campaign.id}
              >
                <div className="campaign-main">
                  <div className="campaign-meta">
                    <span
                      className={`status status-${campaign.status}`}
                    >
                      {campaign.status}
                    </span>

                    <span>
                      {new Date(
                        campaign.createdAt
                      ).toLocaleString()}
                    </span>
                  </div>

                  <h3>
                    {campaign.input.occasion ||
                      "General"}{" "}
                    — {campaign.input.product}
                  </h3>

                  <p>
                    {campaign.strategy.campaignObjective}
                  </p>

                  <div className="tags">
                    {campaign.input.platforms.map(
                      (platform) => (
                        <span key={platform}>
                          {platform}
                        </span>
                      )
                    )}
                  </div>
                  {campaign.publishStatus && (
                    <div className="schedule-status">
                      <strong>Publish status:</strong>{" "}
                      {campaign.publishStatus}
                    </div>
                  )}
                  {campaign.publishStatus === "scheduled" &&
                    campaign.scheduledAt && (
                      <div className="schedule-info">
                        <div>
                          Scheduled:{" "}
                          {new Date(
                            campaign.scheduledAt
                          ).toLocaleString()}
                        </div>

                        <div>
                          Platforms:{" "}
                          {campaign.scheduledPlatforms?.join(
                            ", "
                          )}
                        </div>

                        <div>
                          Repeat:{" "}
                          {campaign.scheduleRecurrence ||
                            "none"}
                        </div>
                      </div>
                    )}
                  {campaign.publishStatus === "published" &&
                    campaign.publishedAt && (
                      <div className="schedule-info">
                        Published:{" "}
                        {new Date(
                          campaign.publishedAt
                        ).toLocaleString()}
                      </div>
                    )}
                  {campaign.publishStatus === "failed" && (
                    <div className="schedule-error">
                      Failed after{" "}
                      {campaign.publishAttempts || 0} attempts.

                      {campaign.publishError && (
                        <div>
                          {campaign.publishError}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="campaign-actions">
                  {campaign.status === "approved" && (
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setScheduleCampaign(campaign);

                        if (campaign.scheduledAt) {
                          const existing = new Date(
                            campaign.scheduledAt
                          );

                          setScheduleForm({
                            date: existing
                              .toISOString()
                              .slice(0, 10),

                            time: existing
                              .toISOString()
                              .slice(11, 16),

                            timezone:
                              campaign.scheduledTimezone ||
                              "Asia/Kolkata",

                            facebook:
                              campaign.scheduledPlatforms?.includes(
                                "facebook"
                              ) ?? true,

                            instagram:
                              campaign.scheduledPlatforms?.includes(
                                "instagram"
                              ) ?? true,

                            recurrence:
                              campaign.scheduleRecurrence ||
                              "none",
                          });
                        }
                      }}
                    >
                      {campaign.publishStatus === "scheduled"
                        ? "Reschedule"
                        : "Schedule Post"}
                    </button>
                  )}
                  {campaign.publishStatus === "scheduled" && (
                    <button
                      className="reject-button"
                      onClick={async () => {
                        await cancelCampaignSchedule(
                          campaign.id
                        );

                        await loadCampaigns();
                      }}
                    >
                      Cancel Schedule
                    </button>
                  )}
                  <button
                    className="secondary-button"
                    onClick={() =>
                      handleOpenCampaign(campaign)
                    }
                  >
                    Open
                  </button>

                  {campaign.status !== "approved" && (
                    <button
                      className="approve-button"
                      onClick={() =>
                        handleStatusChange(
                          campaign.id,
                          "approved"
                        )
                      }
                    >
                      Approve
                    </button>
                  )}

                  {campaign.status !== "rejected" && (
                    <button
                      className="reject-button"
                      onClick={() =>
                        handleStatusChange(
                          campaign.id,
                          "rejected"
                        )
                      }
                    >
                      Reject
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {scheduleCampaign && (
        <div className="schedule-overlay">
          <div className="schedule-modal">
            <h2>
              {scheduleCampaign.publishStatus ===
                "scheduled"
                ? "Reschedule Post"
                : "Schedule Post"}
            </h2>

            <p>
              {scheduleCampaign.input.product}
            </p>

            <label>
              Date
              <input
                type="date"
                value={scheduleForm.date}
                onChange={(e) =>
                  setScheduleForm({
                    ...scheduleForm,
                    date: e.target.value,
                  })
                }
              />
            </label>

            <label>
              Time
              <input
                type="time"
                value={scheduleForm.time}
                onChange={(e) =>
                  setScheduleForm({
                    ...scheduleForm,
                    time: e.target.value,
                  })
                }
              />
            </label>

            <label>
              Timezone

              <select
                value={scheduleForm.timezone}
                onChange={(e) =>
                  setScheduleForm({
                    ...scheduleForm,
                    timezone:
                      e.target.value,
                  })
                }
              >
                <option value="Asia/Kolkata">
                  India — IST
                </option>

                <option value="America/Los_Angeles">
                  US — Pacific
                </option>

                <option value="America/Denver">
                  US — Mountain
                </option>

                <option value="America/Chicago">
                  US — Central
                </option>

                <option value="America/New_York">
                  US — Eastern
                </option>
              </select>
            </label>

            <div className="schedule-platforms">
              <label>
                <input
                  type="checkbox"
                  checked={
                    scheduleForm.facebook
                  }
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      facebook:
                        e.target.checked,
                    })
                  }
                />

                Facebook
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={
                    scheduleForm.instagram
                  }
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      instagram:
                        e.target.checked,
                    })
                  }
                />

                Instagram
              </label>
            </div>

            <label>
              Repeat

              <select
                value={
                  scheduleForm.recurrence
                }
                onChange={(e) =>
                  setScheduleForm({
                    ...scheduleForm,
                    recurrence:
                      e.target.value,
                  })
                }
              >
                <option value="none">
                  Do not repeat
                </option>

                <option value="daily">
                  Every day
                </option>

                <option value="weekly">
                  Every week
                </option>
              </select>
            </label>

            <div className="schedule-actions">
              <button
                type="button"
                onClick={() =>
                  setScheduleCampaign(null)
                }
              >
                Close
              </button>

              <button
                type="button"
                onClick={
                  handleScheduleSubmit
                }
              >
                {scheduleCampaign.publishStatus ===
                  "scheduled"
                  ? "Update Schedule"
                  : "Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="card">
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

function CopyButton({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <button
      type="button"
      className="copy-button"
      onClick={handleCopy}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export default App;