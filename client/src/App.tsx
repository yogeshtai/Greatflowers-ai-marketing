import { useEffect, useState } from "react";
import {
  generateStrategy,
  saveCampaign,
  updateCampaign,
  getCampaigns,
  deleteCampaign,
  updateCampaignStatus,
  recommendCampaign,
  regenerateCreativeVariant,
} from "./api/marketing";
import "./App.css";

import type { RecommendationEvidence, Strategy, StoryCreativePlan, StorySlideResult, Creative, CampaignStatus, SavedCampaign, ScheduleForm, SelectedCreative } from "./types";
import { availablePlatforms, API_BASE } from "./constants";
import { scheduleCampaignPost, rescheduleCampaignPost } from "./api/schedule";
import { EvidenceSection } from "./components/EvidenceSection";
import { CampaignCreativesSection } from "./components/CampaignCreativesSection";
import { StoryCreativesSection } from "./components/StoryCreativesSection";
import { StrategyDetails } from "./components/StrategyDetails";
import { BlogQueueSection } from "./components/BlogQueueSection";
import { HistorySection } from "./components/HistorySection";
import { ScheduleModal } from "./components/ScheduleModal";
import { LoginScreen } from "./components/LoginScreen";

function App() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Campaign management state
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
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
    creativeScenario: "",
    contentTheme: "",
    visualTreatment: "",
    audience: "US customers",
    trafficSource: "Organic Social",
    priority: "Conversions",
    additionalContext: "",
  });
  
  // Scheduling state
  const [scheduleCampaign, setScheduleCampaign] = useState<SavedCampaign | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({
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
  const [selectedCreatives, setSelectedCreatives] = useState<SelectedCreative[]>([]);
  const [generationAbortController, setGenerationAbortController] = useState<AbortController | null>(null);

  // Story Creatives state (Stage 3) - separate workflow/state from normal creatives
  const [storyPlan, setStoryPlan] = useState<StoryCreativePlan | null>(null);
  const [storySlides, setStorySlides] = useState<StorySlideResult[]>([]);
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyError, setStoryError] = useState("");
  const [storyAbortController, setStoryAbortController] = useState<AbortController | null>(null);
  const [selectedStoryCarousel, setSelectedStoryCarousel] = useState(false);

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
  
  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem("gf_auth");
  };

  if (!isAuthenticated) {
    return <LoginScreen onSuccess={() => setIsAuthenticated(true)} />;
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
      setStoryPlan(null);
      setStorySlides([]);
      setSelectedStoryCarousel(false);
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

  const handleDeleteCampaign = async (campaign: SavedCampaign) => {
    if (!window.confirm(`Delete "${campaign.input.product}"? This permanently removes its saved strategy, story plan, linked generated images and schedule. Shared/catalog images and already-published social posts are preserved.`)) return;
    setDeletingCampaignId(campaign.id);
    setDeleteError("");
    try {
      await deleteCampaign(campaign.id);
      setCampaigns(current => current.filter(item => item.id !== campaign.id));
      if (scheduleCampaign?.id === campaign.id) setScheduleCampaign(null);
      if (savedCampaignId === campaign.id) {
        generationAbortController?.abort();
        storyAbortController?.abort();
        setSavedCampaignId(null);
        setStrategy(null);
        setRecommendedProduct(null);
        setRecommendationEvidence(null);
        setCreatives([]);
        setSelectedCreatives([]);
        setStoryPlan(null);
        setStorySlides([]);
        setSelectedStoryCarousel(false);
      }
    } catch (error) {
      const failure = error as { response?: { data?: { error?: string } } };
      setDeleteError(failure.response?.data?.error || "Could not delete campaign. Please try again.");
    } finally { setDeletingCampaignId(null); }
  };

  const handleOpenCampaign = (
    campaign: SavedCampaign
  ) => {
    setForm({
      campaignGoal: campaign.input.campaignGoal,
      product: campaign.input.product,
      occasion: campaign.input.occasion || "",
      creativeScenario: campaign.input.creativeScenario || "",
      contentTheme: campaign.input.contentTheme || "",
      visualTreatment: campaign.input.visualTreatment || "",
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

    // Load selectedCreatives with backward compatibility
    if (campaign.selectedCreatives && campaign.selectedCreatives.length > 0) {
      // New format: use selectedCreatives array
      setSelectedCreatives(campaign.selectedCreatives.sort((a, b) => a.order - b.order));
    } else if (campaign.selectedCreative) {
      // Old format: convert single selectedCreative to array
      setSelectedCreatives([{ ...campaign.selectedCreative, order: 1 }]);
    } else {
      setSelectedCreatives([]);
    }

    setStoryPlan(campaign.storyPlan ?? null);
    // Load Story Creatives (Stage 3) - old campaigns simply won't have these fields
    if (campaign.storyCreatives && campaign.storyCreatives.length > 0) {
      setStorySlides([...campaign.storyCreatives].sort((a, b) => a.order - b.order));
      setStoryError("");
    } else {
      setStorySlides([]);
      setStoryError("");
    }
    setSelectedStoryCarousel(!!campaign.selectedStoryCarousel);

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

      const storyData = {
        storyPlan,
        storyConcept: storyPlan?.carouselConcept ?? strategy.creativeBrief?.carouselConcept,
        storyVisualContinuity: storyPlan?.visualContinuity ?? strategy.creativeBrief?.visualContinuity,
        storyCreatives: storySlides.length > 0 ? storySlides : undefined,
        selectedStoryCarousel,
      };

      if (savedCampaignId) {
        response = await updateCampaign(
          savedCampaignId,
          input,
          strategy,
          recommendedProduct,
          creatives.length > 0 ? creatives : undefined,
          undefined, // old selectedCreative (deprecated)
          selectedCreatives.length > 0 ? selectedCreatives : undefined,
          storyData
        );
      } else {
        response = await saveCampaign(
          input,
          strategy,
          recommendedProduct,
          creatives.length > 0 ? creatives : undefined,
          undefined, // old selectedCreative (deprecated)
          selectedCreatives.length > 0 ? selectedCreatives : undefined,
          storyData
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
        creativeScenario: recommendation.creativeScenario || "",
        contentTheme: recommendation.contentTheme || "",
        visualTreatment: recommendation.visualTreatment || "",
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
      setSelectedCreatives([]);

      setStoryPlan(null);
      // Clear previous Story Creatives when new recommendation is generated
      setStorySlides([]);
      setStoryError("");
      setSelectedStoryCarousel(false);
    } catch (error) {
      console.error(
        "Recommendation failed:",
        error
      );

      setError(
        (error as { response?: { status?: number } })?.response?.status === 409
          ? "A recommendation is already being generated. Please wait a few minutes and try again."
          : "Could not generate an automatic campaign recommendation."
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

    // Selecting a normal creative clears the Story Carousel selection,
    // since publishing is either the normal creatives OR the Story
    // Carousel, never both at once.
    setSelectedStoryCarousel(false);

    // Check if localPath is already a full S3 URL or a local path
    const isS3Url = creative.localPath?.startsWith('http');
    const imageUrl = creative.success && creative.localPath
      ? (isS3Url 
          ? creative.localPath 
          : `${API_BASE}/${creative.localPath.replace(/^.*test-creatives\//, 'test-creatives/')}`)
      : (creativeFallbackImage || recommendedProduct?.image || '');

    setSelectedCreatives(prev => {
      const existing = prev.find(c => c.type === creative.type);
      
      if (existing) {
        // Deselect: remove and reorder remaining
        return prev
          .filter(c => c.type !== creative.type)
          .map((c, index) => ({ ...c, order: index + 1 }));
      } else {
        // Select: add with next order number
        const nextOrder = prev.length + 1;
        return [...prev, {
          type: creative.type,
          imageUrl,
          headline: creative.headline,
          subheadline: creative.subheadline,
          cta: creative.cta,
          isFallback: !creative.success || !creative.localPath,
          order: nextOrder,
        }];
      }
    });
  };

  const handleRegenerateVariant = async (variantType: string) => {
    if (!strategy?.creativeBrief || !recommendedProduct?.image) {
      return;
    }

    try {
      // Mark this variant as loading by updating its state
      setCreatives(prev => 
        prev.map(c => 
          c.type === variantType 
            ? { ...c, success: false, error: 'Regenerating...', localPath: '' }
            : c
        )
      );

      const result = await regenerateCreativeVariant(
        recommendedProduct.image,
        strategy.creativeBrief,
        variantType
      );

      if (result.success && result.creative) {
        // Update the specific creative
        setCreatives(prev =>
          prev.map(c =>
            c.type === variantType ? result.creative : c
          )
        );
      } else {
        // Keep the error state
        setCreatives(prev =>
          prev.map(c =>
            c.type === variantType
              ? { ...c, success: false, error: result.error || 'Regeneration failed' }
              : c
          )
        );
      }
    } catch (error) {
      console.error(`Failed to regenerate ${variantType}:`, error);
      setCreatives(prev =>
        prev.map(c =>
          c.type === variantType
            ? { ...c, success: false, error: 'Regeneration failed' }
            : c
        )
      );
    }
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
      setSelectedCreatives([]);

      // Create abort controller for this generation
      const abortController = new AbortController();
      setGenerationAbortController(abortController);

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
        signal: abortController.signal,
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
      if (error instanceof Error && error.name === 'AbortError') {
        console.log("Creative generation stopped by user");
        setCreativesError("");
      } else {
        console.error("Creative generation failed:", error);
        setCreativesError("Failed to generate creatives");
        setCreatives([]);
      }
    } finally {
      setCreativesLoading(false);
      setGenerationAbortController(null);
    }
  };

  const handleStopGeneration = () => {
    if (generationAbortController) {
      generationAbortController.abort();
      setCreativesLoading(false);
      setGenerationAbortController(null);
    }
  };

  const handleGenerateStoryCreatives = async () => {
    if (!strategy?.creativeBrief || !recommendedProduct?.image) {
      setStoryError("Missing creative brief or product image");
      return;
    }

    // Validate that the product hasn't been manually changed
    if (form.product !== recommendedProduct.name) {
      setStoryError(
        `Product mismatch: You selected "${form.product}" but the recommendation is for "${recommendedProduct.name}". ` +
        `Please generate a new recommendation for "${form.product}" first.`
      );
      return;
    }

    if (storyLoading) return;
    const abortController = new AbortController();
    try {
      setStoryLoading(true);
      setStoryError("");
      setStoryAbortController(abortController);
      setStoryPlan(null);
      setStorySlides([]);
      setSelectedStoryCarousel(false);
      const planResponse = await fetch(`${API_BASE}/api/creatives/story/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: { ...form, platforms }, selectedProduct: recommendedProduct, strategy }),
        signal: abortController.signal,
      });
      const planData = await planResponse.json();
      if (!planResponse.ok || !planData.storyPlan) {
        throw new Error(planData.error || "Failed to create story plan");
      }
      const storyPlan: StoryCreativePlan = planData.storyPlan;
      setStoryPlan(storyPlan);
      setStorySlides(
        storyPlan.slides.map((slide) => ({
          order: slide.order || 0,
          storyRole: slide.storyRole || "",
          storyBeat: slide.storyBeat || "",
          imageUrl: "",
          headline: slide.headline,
          subheadline: slide.subheadline,
          cta: slide.cta,
          creativeType: slide.creativeType,
          sceneStrategy: slide.sceneStrategy,
          productRole: slide.productRole,
          success: false,
        }))
      );
      setSelectedStoryCarousel(false);

      const response = await fetch(`${API_BASE}/api/creatives/generate/story/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productImageUrl: recommendedProduct.image,
          creativeBrief: strategy.creativeBrief,
          storyPlan,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to start story creative generation');
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

            if (data.type === 'progress') {
              // Update the specific slide the moment it completes
              setStorySlides(prev => {
                const updated = [...prev];
                const index = updated.findIndex(s => s.order === data.slide.order);

                if (index >= 0) {
                  updated[index] = data.slide;
                } else {
                  updated.push(data.slide);
                }

                return updated.sort((a, b) => a.order - b.order);
              });
            } else if (data.type === 'complete') {
              if (!data.success && data.error) {
                setStoryError(data.error);
              }
            } else if (data.type === 'error') {
              setStoryError(data.error || 'Story creative generation failed');
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log("Story creative generation stopped by user");
      } else {
        console.error("Story creative generation failed:", error);
        setStoryError(error instanceof Error ? error.message : "Failed to generate story creatives");
      }
    } finally {
      setStoryLoading(false);
      setStoryAbortController(null);
    }
  };

  const handleStopStoryGeneration = () => {
    if (storyAbortController) {
      storyAbortController.abort();
      setStoryLoading(false);
      setStoryAbortController(null);
    }
  };

  const handleSelectStoryCarousel = () => {
    // Only allow selecting a completed story (all 4 slides succeeded)
    const allSucceeded = storySlides.length === 4 && storySlides.every(s => s.success);

    if (!allSucceeded) {
      return;
    }

    // Selecting the Story Carousel clears normal creative selection,
    // since publishing is either the normal creatives OR the Story
    // Carousel, never both at once.
    setSelectedCreatives([]);
    setSelectedStoryCarousel(prev => !prev);
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
            Build sales, awareness and engagement campaigns using customer intent,
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
            Occasion / Topic
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

        {form.contentTheme && (
          <p>
            <strong>Content theme:</strong> {form.contentTheme.replaceAll("-", " ")}
            {form.visualTreatment && <> · <strong>Visual direction:</strong> {form.visualTreatment.replaceAll("-", " ")}</>}
          </p>
        )}

        <label>
          Creative Idea / Scenario
          <textarea
            name="creativeScenario"
            value={form.creativeScenario}
            onChange={updateField}
            rows={2}
            placeholder="A specific story, styling idea, care tip or conversation starter."
          />
        </label>

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

          <EvidenceSection
            recommendationEvidence={recommendationEvidence}
          />

          <CampaignCreativesSection
            strategy={strategy}
            recommendedProduct={recommendedProduct}
            creatives={creatives}
            creativesLoading={creativesLoading}
            creativesError={creativesError}
            creativeFallbackImage={creativeFallbackImage}
            selectedCreatives={selectedCreatives}
            storyLoading={storyLoading}
            handleGenerateCreatives={handleGenerateCreatives}
            handleGenerateStoryCreatives={handleGenerateStoryCreatives}
            handleStopGeneration={handleStopGeneration}
            handleSelectCreative={handleSelectCreative}
            handleRegenerateVariant={handleRegenerateVariant}
          />

          <StoryCreativesSection
            strategy={strategy}
            recommendedProduct={recommendedProduct}
            storyPlan={storyPlan}
            storySlides={storySlides}
            storyLoading={storyLoading}
            storyError={storyError}
            selectedStoryCarousel={selectedStoryCarousel}
            handleGenerateStoryCreatives={handleGenerateStoryCreatives}
            handleStopStoryGeneration={handleStopStoryGeneration}
            handleSelectStoryCarousel={handleSelectStoryCarousel}
          />

          <StrategyDetails
            strategy={strategy}
          />
        </section>
      )}

      <BlogQueueSection />

      <HistorySection
        campaigns={campaigns}
        historyLoading={historyLoading}
        deleteError={deleteError}
        deletingCampaignId={deletingCampaignId}
        loadCampaigns={loadCampaigns}
        handleDeleteCampaign={handleDeleteCampaign}
        handleOpenCampaign={handleOpenCampaign}
        handleStatusChange={handleStatusChange}
        setScheduleCampaign={setScheduleCampaign}
        setScheduleForm={setScheduleForm}
      />
      <ScheduleModal
        scheduleCampaign={scheduleCampaign}
        scheduleForm={scheduleForm}
        setScheduleForm={setScheduleForm}
        setScheduleCampaign={setScheduleCampaign}
        handleScheduleSubmit={handleScheduleSubmit}
      />
    </main>
  );
}

export default App;
