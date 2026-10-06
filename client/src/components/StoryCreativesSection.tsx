import type { Strategy, StoryCreativePlan, StorySlideResult } from "../types";

export function StoryCreativesSection({
  strategy,
  recommendedProduct,
  storyPlan,
  storySlides,
  storyLoading,
  storyError,
  selectedStoryCarousel,
  handleGenerateStoryCreatives,
  handleStopStoryGeneration,
  handleSelectStoryCarousel,
}: {
  strategy: Strategy;
  recommendedProduct: any;
  storyPlan: StoryCreativePlan | null;
  storySlides: StorySlideResult[];
  storyLoading: boolean;
  storyError: string;
  selectedStoryCarousel: boolean;
  handleGenerateStoryCreatives: () => void | Promise<void>;
  handleStopStoryGeneration: () => void;
  handleSelectStoryCarousel: () => void;
}) {
  if (!(strategy?.creativeBrief && recommendedProduct)) return null;

  return (
    <section id="story-creatives-section" className="campaign-creatives-section story-creatives-section">
      <div className="creatives-header">
        <h2>📖 Story Creative</h2>
        <p>A connected 4-slide visual story for this campaign</p>
      </div>

      {storyPlan && (
        <details className="story-concept-box" open>
          <summary>Story plan · Reveal slide {storyPlan.revealSlide}</summary>
          {[...storyPlan.slides].sort((a, b) => (a.order || 0) - (b.order || 0)).map(slide => (
            <div key={slide.order}>
              <p><strong>Slide {slide.order}: {slide.storyRole}</strong> — {slide.storyBeat}</p>
              <p>Product: {slide.productRole} · Brand: {slide.brandRole ?? "unspecified"}</p>
              <p>{slide.sceneChange} · {slide.cameraDirection}</p>
            </div>
          ))}
        </details>
      )}

      {storyError && <p className="creative-error-note">⚠ {storyError}</p>}

      {storySlides.length === 0 && !storyLoading && (
        <div className="creatives-generate-prompt">
          <button
            onClick={handleGenerateStoryCreatives}
            className="btn-generate-creatives"
            disabled={storyLoading}
          >
            Generate Story Creatives
          </button>
          <p className="creatives-hint">
            Generate 4 connected slides that tell one coherent story
          </p>

        </div>
      )}

      {(storySlides.length > 0 || storyLoading) && (
        <>
          {storyPlan?.carouselConcept && (
            <div className="story-concept-box">
              <h3>"{storyPlan.carouselConcept}"</h3>
            </div>
          )}

          {storyLoading && (
            <div className="creatives-loading">
              <p className="loading-message">
                {storyPlan ? "🎬 Generating story slides in order. This may take several minutes." : "Planning your four-slide story…"}
                <br />
                <strong>{storySlides.filter(s => s.success).length} of 4 completed</strong>
              </p>
              <button
                onClick={handleStopStoryGeneration}
                className="btn-stop-generation"
              >
                ⏹ Stop Generation
              </button>
            </div>
          )}

          <div className="story-slides-grid">
            {storySlides.map((slide, index) => {
              const priorSlidesSucceeded = storySlides
                .slice(0, index)
                .every(s => s.success);
              const isGeneratingThis =
                storyLoading &&
                !slide.success &&
                !slide.error &&
                priorSlidesSucceeded;

              return (
                <div
                  key={`story-slide-${slide.order}`}
                  className={`creative-card story-slide-card ${selectedStoryCarousel ? 'selected' : ''}`}
                >
                  <div className="story-slide-label">Slide {slide.order}</div>
                  <div className="creative-image-container">
                    {slide.success && slide.imageUrl ? (
                      <img
                        src={slide.imageUrl}
                        alt={slide.headline}
                        className="creative-image"
                      />
                    ) : slide.error ? (
                      <div className="story-slide-status story-slide-error">
                        ⚠ Failed
                      </div>
                    ) : isGeneratingThis ? (
                      <div className="placeholder-spinner"></div>
                    ) : (
                      <div className="placeholder-waiting">⏳</div>
                    )}
                  </div>
                  <div className="creative-details">
                    {slide.storyRole && (
                      <span className="creative-type-badge">
                        {slide.storyRole}
                      </span>
                    )}
                    <h3 className="creative-headline">{slide.headline}</h3>
                    {slide.storyBeat && (
                      <p className="creative-subheadline">{slide.storyBeat}</p>
                    )}
                    {slide.error && (
                      <p className="creative-error-note">⚠ {slide.error}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!storyLoading && storySlides.length === 4 && storySlides.every(s => s.success) && (
            <div className="creative-selection-summary">
              <button
                className={`btn-generate-creatives ${selectedStoryCarousel ? 'story-selected' : ''}`}
                onClick={handleSelectStoryCarousel}
              >
                {selectedStoryCarousel ? '✓ Story Carousel Selected' : 'Select Story Carousel'}
              </button>
              {selectedStoryCarousel && (
                <p className="selection-fallback-note">
                  This story will publish as one 4-image Instagram carousel / Facebook post.
                </p>
              )}
            </div>
          )}

          {!storyLoading && storySlides.length > 0 && storySlides.some(s => !s.success) && (
            <div className="creatives-fallback">
              <div className="fallback-message">
                <p>⚠ Some slides failed. A story can only be selected once all 4 slides succeed.</p>
                <button
                  className="retry-button"
                  onClick={handleGenerateStoryCreatives}
                >
                  🔄 Retry Story Generation
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
