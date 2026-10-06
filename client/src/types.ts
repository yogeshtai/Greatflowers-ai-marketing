export type RecommendationEvidence = {
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

export type Strategy = {
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
    creativeMode?: "independent" | "story-carousel";
    headline: string;
    subheadline: string;
    cta: string;
    mood: string;
    backgroundDirection: string;
    productTreatment: string;
    logoPlacement: string;
    textPlacement: string;
    creativeGoal: string;
    carouselConcept?: string;
    revealSlide?: 2 | 3 | 4;
    visualContinuity?: {
      characterContinuity?: string;
      environmentContinuity?: string;
      colorContinuity?: string;
      stylingContinuity?: string;
    };
    variants: CreativeVariant[];
  };
};

export type StoryCreativePlan = {
  carouselConcept: string;
  revealSlide: 2 | 3 | 4;
  visualContinuity?: {
    characterContinuity?: string;
    environmentContinuity?: string;
    colorContinuity?: string;
    stylingContinuity?: string;
  };
  slides: CreativeVariant[];
};

export type CreativeVariant = {
  order?: number;
  creativeType:
    | "product"
    | "lifestyle"
    | "occasion"
    | "location"
    | "feature"
    | "informational"
    | "brand-awareness";
  sceneStrategy:
    | "PRODUCT_STUDIO"
    | "HUMAN_GIFTING_MOMENT"
    | "HUMAN_LIFESTYLE"
    | "OCCASION_SCENE"
    | "EDITORIAL_CONTENT"
    | "INFORMATIONAL_GRAPHIC"
    | "LOCATION_STORY"
    | "FEATURE_DEMO"
    | "BRAND_STORY";
  concept: string;
  headline: string;
  subheadline: string;
  cta: string;
  visualDirection: string;
  productRole: "hero" | "supporting" | "optional" | "none";
  locationContext?: string;
  occasionContext?: string;
  colorPalette: string;
  compositionStyle: string;
  lightingStyle: string;
  sceneType: string;
  brandRole?: "none" | "subtle" | "reveal";
  sceneChange?: string;
  cameraDirection?: string;
  storyRole?: string;
  storyBeat?: string;
};

export type StorySlideResult = {
  order: number;
  storyRole: string;
  storyBeat: string;
  imageUrl: string;
  headline: string;
  subheadline: string;
  cta: string;
  creativeType: string;
  sceneStrategy: string;
  productRole: string;
  success: boolean;
  error?: string;
};

export type Creative = {
  type: string;
  localPath: string;
  headline: string;
  subheadline: string;
  cta: string;
  success: boolean;
  error?: string;
  // New strategic metadata from Hermes
  sceneStrategy?: string;
  concept?: string;
  productRole?: "hero" | "supporting" | "optional" | "none";
  locationContext?: string;
  occasionContext?: string;
};

export type CampaignStatus = "draft" | "approved" | "rejected";

export type SavedCampaign = {
  id: string;

  input: {
    campaignGoal: string;
    product: string;
    occasion?: string;
    creativeScenario?: string;
    contentTheme?: string;
    visualTreatment?: string;
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

  publishStatus?: "draft" | "not_scheduled" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";
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
  selectedCreatives?: Array<{
    type: string;
    imageUrl: string;
    headline: string;
    subheadline: string;
    cta: string;
    isFallback: boolean;
    order: number;
  }>;

  storyPlan?: StoryCreativePlan | null;
  storyConcept?: string;
  storyVisualContinuity?: {
    characterContinuity?: string;
    environmentContinuity?: string;
    colorContinuity?: string;
    stylingContinuity?: string;
  };
  storyCreatives?: StorySlideResult[];
  selectedStoryCarousel?: boolean;
};
