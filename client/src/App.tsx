import { useEffect, useState } from "react";
import {
  generateStrategy,
  saveCampaign,
  updateCampaign,
  getCampaigns,
  updateCampaignStatus,
  recommendCampaign,
  generateCreatives,
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

  decisionSummary?: string;

  websiteEvidence?: string[];

  catalogEvidence?: string[];

  analyticsEvidence?: string[];

  rotationEvidence?: string[];

  assumptions?: string[];

  websitePagesChecked?: {
    title: string;
    url: string;
  }[];

  recentCampaigns?: {
    productName: string;
    occasion: string;
    recommendedAt: string;
  }[];

  analytics?: {
    itemId: string;
    itemName: string;
    views: number;
    addToCarts: number;
    checkouts: number;
    purchases: number;
  } | null;

  analyticsAvailable?: boolean;
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
  
  creativeBrief?: {
    headline: string;
    subheadline: string;
    cta: string;
    mood: string;
    backgroundDirection: string;
    productTreatment: string;
    logoPlacement: string;
    textPlacement: string;
    creativeGoal: string;
    variants: CreativeVariant[];
  };
};

type CreativeVariant = {
  type: "emotional" | "product-focused" | "premium-minimal";
  headline: string;
  subheadline: string;
  cta: string;
  visualDirection: string;
};

type Creative = {
  type: string;
  localPath: string;
  headline: string;
  subheadline: string;
  cta: string;
  success: boolean;
  error?: string;
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
  
  selectedProduct?: {
    id: number;
    name: string;
    url: string;
    image: string | null;
  };
  
  creatives?: Creative[];
  selectedCreative?: {
    type: string;
    imageUrl: string;
    headline: string;
    subheadline: string;
    cta: string;
    isFallback: boolean;
  };
};

const availablePlatforms = [
  "Instagram",
  "Facebook",
  "Pinterest",
  "X",
  "YouTube Shorts",
];

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3005";

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
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  // Campaign management state
  const [campaigns, setCampaigns] = useState<SavedCampaign[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedCampaignId, setSavedCampaignId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [, setRecommendationReason] = useState<string | null>(null);
  
  // Form state
  const [form, setForm] = useState({
    campaignGoal: "Generate orders",
    product: "Build Your Bouquet",
    occasion: "Birthday",
    audience: "US customers",
    trafficSource: "Organic Social",
    priority: "Conversions",
    additionalContext: "",
  });
  
  // Scheduling state
  const [scheduleCampaign, setScheduleCampaign] = useState<SavedCampaign | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    date: "",
    time: "",
    timezone: "Asia/Kolkata",
    facebook: true,
    instagram: true,
    recurrence: "none",
  });
  
  // Strategy state
  const [platforms, setPlatforms] = useState<string[]>([
    "Instagram",
    "Facebook",
    "Pinterest",
  ]);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recommendationEvidence, setRecommendationEvidence] = useState<RecommendationEvidence | null>(null);
  const [recommendedProduct, setRecommendedProduct] = useState<any | null>(null);
  
  // Creative state (separate from recommendation)
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [creativesLoading, setCreativesLoading] = useState(false);
  const [creativesError, setCreativesError] = useState("");
  const [creativeFallbackImage, setCreativeFallbackImage] = useState<string | null>(null);
  const [selectedCreative, setSelectedCreative] = useState<{
    type: string;
    imageUrl: string;
    headline: string;
    subheadline: string;
    cta: string;
    isFallback: boolean;
  } | null>(null);
  
  // Check if already authenticated on mount
  useEffect(() => {
    const auth = sessionStorage.getItem("gf_auth");
    if (auth === "authenticated") {
      setIsAuthenticated(true);
    }
  }, []);
  
  // Load campaigns when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadCampaigns();
    }
  }, [isAuthenticated]);
  
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simple password check - in production, use proper authentication
    const correctPassword = import.meta.env.VITE_APP_PASSWORD || "greatflowers2026";
    
    if (password === correctPassword) {
      setIsAuthenticated(true);
      sessionStorage.setItem("gf_auth", "authenticated");
      setAuthError("");
    } else {
      setAuthError("Incorrect password");
      setPassword("");
    }
  };
  
  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem("gf_auth");
    setPassword("");
  };
  
  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
      }}>
        <div style={{
          background: "white",
          padding: "2rem",
          borderRadius: "8px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          width: "100%",
          maxWidth: "400px"
        }}>
          <h2 style={{ marginBottom: "1.5rem", textAlign: "center" }}>
            🌸 GreatFlowers AI Marketing
          </h2>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 500 }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    paddingRight: "3rem",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    fontSize: "1rem"
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "0.25rem",
                    display: "flex",
                    alignItems: "center",
                    color: "#666"
                  }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {authError && (
              <div style={{
                color: "#dc2626",
                marginBottom: "1rem",
                fontSize: "0.875rem"
              }}>
                {authError}
              </div>
            )}
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "0.75rem",
                background: "#667eea",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: "pointer"
              }}
            >
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

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
    
    // Load saved creatives if they exist
    if (campaign.creatives && campaign.creatives.length > 0) {
      setCreatives(campaign.creatives);
      setCreativesError("");
      // Set fallback image from selectedProduct if available
      if (campaign.selectedProduct?.image) {
        setCreativeFallbackImage(campaign.selectedProduct.image);
      }
    } else {
      setCreatives([]);
      setCreativesError("");
    }
    
    // Load selectedProduct if it exists (for fallback and display)
    if (campaign.selectedProduct) {
      setRecommendedProduct(campaign.selectedProduct);
    }

    // Load selectedCreative if it exists
    if (campaign.selectedCreative) {
      setSelectedCreative(campaign.selectedCreative);
    } else {
      setSelectedCreative(null);
    }

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

      let response;

      if (savedCampaignId) {
        response = await updateCampaign(
          savedCampaignId,
          input,
          strategy,
          recommendedProduct,
          creatives.length > 0 ? creatives : undefined,
          selectedCreative || undefined
        );
      } else {
        response = await saveCampaign(
          input,
          strategy,
          recommendedProduct,
          creatives.length > 0 ? creatives : undefined,
          selectedCreative || undefined
        );

        setSavedCampaignId(response.campaign.id);
      }

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
      
      // Clear previous creatives when new recommendation is generated
      setCreatives([]);
      setCreativesError("");
      setCreativeFallbackImage(null);
      setSelectedCreative(null);
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

  const handleSelectCreative = (creative: Creative) => {
    // Only allow selection of completed creatives (not placeholders)
    if (!creative.success && !creative.localPath && !creativeFallbackImage) {
      return;
    }

    // Check if localPath is already a full S3 URL or a local path
    const isS3Url = creative.localPath?.startsWith('http');
    const imageUrl = creative.success && creative.localPath
      ? (isS3Url 
          ? creative.localPath 
          : `${API_BASE}/${creative.localPath.replace(/^.*test-creatives\//, 'test-creatives/')}`)
      : (creativeFallbackImage || recommendedProduct?.image || '');

    setSelectedCreative({
      type: creative.type,
      imageUrl,
      headline: creative.headline,
      subheadline: creative.subheadline,
      cta: creative.cta,
      isFallback: !creative.success || !creative.localPath,
    });
  };

  const handleGenerateCreatives = async () => {
    if (!strategy?.creativeBrief || !recommendedProduct?.image) {
      setCreativesError("Missing creative brief or product image");
      return;
    }

    // Validate that the product hasn't been manually changed
    if (form.product !== recommendedProduct.name) {
      setCreativesError(
        `Product mismatch: You selected "${form.product}" but the recommendation is for "${recommendedProduct.name}". ` +
        `Please generate a new recommendation for "${form.product}" first.`
      );
      return;
    }

    try {
      setCreativesLoading(true);
      setCreativesError("");
      setCreatives([]);
      setSelectedCreative(null);

      // Use fetch to POST and get SSE stream
      const response = await fetch(`${API_BASE}/api/creatives/generate/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productImageUrl: recommendedProduct.image,
          creativeBrief: strategy.creativeBrief,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start creative generation');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response stream');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'start') {
              setCreativeFallbackImage(data.productImageUrl);
            } else if (data.type === 'progress') {
              // Add or update the creative immediately
              setCreatives(prev => {
                const newCreatives = [...prev];
                const existingIndex = newCreatives.findIndex(c => c.type === data.creative.type);
                
                if (existingIndex >= 0) {
                  newCreatives[existingIndex] = data.creative;
                } else {
                  newCreatives.push(data.creative);
                }
                
                return newCreatives;
              });
              setCreativeFallbackImage(data.productImageUrl);
            } else if (data.type === 'error') {
              setCreativesError(data.error || 'Creative generation failed');
              setCreativeFallbackImage(data.productImageUrl);
            }
          }
        }
      }
    } catch (error) {
      console.error("Creative generation failed:", error);
      setCreativesError("Failed to generate creatives");
      setCreatives([]);
    } finally {
      setCreativesLoading(false);
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

  return (
    <main className="app">
      <header className="header" style={{ position: "relative" }}>
        <button
          onClick={handleLogout}
          style={{
            position: "absolute",
            top: "0",
            right: "0",
            padding: "0.5rem 1rem",
            background: "#667eea",
            border: "1px solid #667eea",
            color: "white",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: 500
          }}
        >
          Logout
        </button>
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
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : savedCampaignId
                    ? "Update Campaign"
                    : "Save Campaign"}
              </button>
            </div>
          </div>

          {recommendationEvidence && (
            <section className="ai-evidence-section">
              <div className="ai-evidence-header">
                <span className="step">
                  Why AI Recommended This
                </span>

                <h2>
                  Why AI Recommended This
                </h2>

                <p>
                  Data and signals used to choose this campaign.
                </p>
              </div>

              {recommendationEvidence.decisionSummary && (
                <div className="ai-decision-summary">
                  <h3>AI Decision Summary</h3>
                  <p>{recommendationEvidence.decisionSummary}</p>
                </div>
              )}

              <div className="ai-evidence-groups">
                <EvidenceGroup
                  title="Website Evidence"
                  items={recommendationEvidence.websiteEvidence}
                />

                <EvidenceGroup
                  title="Product / Catalog Evidence"
                  items={recommendationEvidence.catalogEvidence}
                />

                <EvidenceGroup
                  title="GA4 Analytics Evidence"
                  items={recommendationEvidence.analyticsEvidence}
                />

                <EvidenceGroup
                  title="Campaign History & Rotation"
                  items={recommendationEvidence.rotationEvidence}
                />
              </div>

              {(recommendationEvidence.assumptions?.length ?? 0) > 0 && (
                <div className="ai-assumptions-box">
                  <h3>⚠ Assumptions / Needs Validation</h3>
                  <ul>
                    {recommendationEvidence.assumptions!.map((item, i) => (
                      <li key={`assumption-${i}`}>⚠ {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(recommendationEvidence.websitePagesChecked?.length ?? 0) > 0 && (
                <SourcesChecked pages={recommendationEvidence.websitePagesChecked!} />
              )}
            </section>
          )}

          {strategy?.creativeBrief && recommendedProduct && (
            <section className="campaign-creatives-section">
              <div className="creatives-header">
                <h2>🎨 Campaign Creatives</h2>
                <p>AI-generated social media creatives for this campaign</p>
              </div>

              {!creativesLoading && creatives.length === 0 && !creativesError && (
                <div className="creatives-generate-prompt">
                  <button
                    onClick={handleGenerateCreatives}
                    className="btn-generate-creatives"
                    disabled={creativesLoading}
                  >
                    Generate Creatives
                  </button>
                  <p className="creatives-hint">
                    Generate 3 AI creative variants (Emotional, Product-Focused, Premium-Minimal)
                  </p>
                </div>
              )}

              {creativesLoading && (
                <div className="creatives-loading">
                  <p className="loading-message">
                    🎨 AI creatives are being generated. This may take several minutes.
                    <br />
                    <strong>{creatives.length} of 3 completed</strong>
                  </p>
                  
                  {/* Show completed creatives immediately */}
                  {creatives.length > 0 && (
                    <div className="creatives-grid">
                      {creatives.map((creative, index) => {
                        const isSelected = selectedCreative?.type === creative.type;
                        return (
                          <div 
                            key={`creative-${index}`} 
                            className={`creative-card selectable ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleSelectCreative(creative)}
                          >
                            <div className="creative-image-container">
                              {creative.success && creative.localPath ? (
                                <img
                                  src={creative.localPath.startsWith('http') 
                                    ? creative.localPath 
                                    : `${API_BASE}/${creative.localPath.replace(/^.*test-creatives\//, 'test-creatives/')}`}
                                  alt={creative.headline}
                                  className="creative-image"
                                />
                              ) : (
                                <>
                                  <img
                                    src={creativeFallbackImage || recommendedProduct.image}
                                    alt={creative.headline}
                                    className="creative-image fallback"
                                  />
                                  <div className="fallback-badge">
                                    Using original product image
                                  </div>
                                </>
                              )}
                              {isSelected && (
                                <div className="selected-badge">
                                  ✓ Selected
                                </div>
                              )}
                            </div>
                            <div className="creative-details">
                              <span className="creative-type-badge">
                                {creative.type}
                              </span>
                              <h3 className="creative-headline">{creative.headline}</h3>
                              {creative.subheadline && (
                                <p className="creative-subheadline">{creative.subheadline}</p>
                              )}
                              <p className="creative-cta">CTA: {creative.cta}</p>
                              {!creative.success && creative.error && (
                                <p className="creative-error-note">⚠ {creative.error}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Show placeholders for remaining variants */}
                  <div className="creatives-placeholders" style={{ marginTop: creatives.length > 0 ? '24px' : '0' }}>
                    {!creatives.some(c => c.type === 'emotional') && (
                      <div className={`creative-placeholder ${creatives.length === 0 ? 'generating' : 'waiting'}`}>
                        {creatives.length === 0 ? (
                          <div className="placeholder-spinner"></div>
                        ) : (
                          <div className="placeholder-waiting">⏳</div>
                        )}
                        <p>
                          {creatives.length === 0 
                            ? 'Generating Emotional Creative...' 
                            : 'Emotional Creative - Waiting'}
                        </p>
                      </div>
                    )}
                    {!creatives.some(c => c.type === 'product-focused') && (
                      <div className={`creative-placeholder ${creatives.length === 1 ? 'generating' : 'waiting'}`}>
                        {creatives.length === 1 ? (
                          <div className="placeholder-spinner"></div>
                        ) : (
                          <div className="placeholder-waiting">⏳</div>
                        )}
                        <p>
                          {creatives.length === 1 
                            ? 'Generating Product-Focused Creative...' 
                            : 'Product-Focused Creative - Waiting'}
                        </p>
                      </div>
                    )}
                    {!creatives.some(c => c.type === 'premium-minimal') && (
                      <div className={`creative-placeholder ${creatives.length === 2 ? 'generating' : 'waiting'}`}>
                        {creatives.length === 2 ? (
                          <div className="placeholder-spinner"></div>
                        ) : (
                          <div className="placeholder-waiting">⏳</div>
                        )}
                        <p>
                          {creatives.length === 2 
                            ? 'Generating Premium-Minimal Creative...' 
                            : 'Premium-Minimal Creative - Waiting'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!creativesLoading && creatives.length > 0 && (
                <>
                  <div className="creatives-grid">
                    {creatives.map((creative, index) => {
                      const isSelected = selectedCreative?.type === creative.type;
                      return (
                        <div 
                          key={`creative-${index}`} 
                          className={`creative-card selectable ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleSelectCreative(creative)}
                        >
                          <div className="creative-image-container">
                            {creative.success && creative.localPath ? (
                              <img
                                src={creative.localPath.startsWith('http') 
                                  ? creative.localPath 
                                  : `${API_BASE}/${creative.localPath.replace(/^.*test-creatives\//, 'test-creatives/')}`}
                                alt={creative.headline}
                                className="creative-image"
                              />
                            ) : (
                              <>
                                <img
                                  src={creativeFallbackImage || recommendedProduct.image}
                                  alt={creative.headline}
                                  className="creative-image fallback"
                                />
                                <div className="fallback-badge">
                                  Using original product image
                                </div>
                              </>
                            )}
                            {isSelected && (
                              <div className="selected-badge">
                                ✓ Selected
                              </div>
                            )}
                          </div>
                          <div className="creative-details">
                            <span className="creative-type-badge">
                              {creative.type}
                            </span>
                            <h3 className="creative-headline">{creative.headline}</h3>
                            {creative.subheadline && (
                              <p className="creative-subheadline">{creative.subheadline}</p>
                            )}
                            <p className="creative-cta">CTA: {creative.cta}</p>
                            {!creative.success && creative.error && (
                              <p className="creative-error-note">⚠ {creative.error}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Selection Summary */}
                  {selectedCreative && (
                    <div className="creative-selection-summary">
                      <h3>Selected Creative</h3>
                      <div className="selection-info">
                        <p className="selection-type"><strong>{selectedCreative.type}</strong></p>
                        <p className="selection-headline">{selectedCreative.headline}</p>
                        <p className="selection-cta">CTA: {selectedCreative.cta}</p>
                        {selectedCreative.isFallback && (
                          <p className="selection-fallback-note">⚠ Using original product image</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {!creativesLoading && creatives.length === 0 && creativesError && (
                <div className="creatives-fallback">
                  <div className="fallback-message">
                    <p>⚠ {creativesError}</p>
                    <p>Using original product image as fallback creative.</p>
                    <button 
                      className="retry-button"
                      onClick={handleGenerateCreatives}
                    >
                      🔄 Retry Creative Generation
                    </button>
                  </div>
                  <div className="creative-card fallback-card">
                    <div className="creative-image-container">
                      <img
                        src={creativeFallbackImage || recommendedProduct.image}
                        alt={strategy.creativeBrief.headline}
                        className="creative-image fallback"
                      />
                      <div className="fallback-badge">
                        AI creative generation was unavailable. Using the original product image instead.
                      </div>
                    </div>
                    <div className="creative-details">
                      <h3 className="creative-headline">{strategy.creativeBrief.headline}</h3>
                      {strategy.creativeBrief.subheadline && (
                        <p className="creative-subheadline">{strategy.creativeBrief.subheadline}</p>
                      )}
                      <p className="creative-cta">CTA: {strategy.creativeBrief.cta}</p>
                    </div>
                  </div>
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

function EvidenceGroup({
  title,
  items,
}: {
  title: string;
  items?: string[];
}) {
  if (!items || items.length === 0) return null;

  return (
    <div className="ai-evidence-group">
      <h4>{title}</h4>
      <ul>
        {items.map((item, i) => (
          <li key={`${title}-${i}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function SourcesChecked({
  pages,
}: {
  pages: { title: string; url: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="ai-sources-checked">
      <button
        type="button"
        className="ai-sources-toggle"
        onClick={() => setOpen(!open)}
      >
        {open ? "▾" : "▸"} Sources Checked ({pages.length})
      </button>

      {open && (
        <div className="ai-sources-list">
          {pages.map((page) => (
            <div className="ai-source-item" key={page.url}>
              <span>{page.title}</span>
              <a
                href={page.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {page.url}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;