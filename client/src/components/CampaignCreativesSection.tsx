import { API_BASE } from "../constants";
import type { Strategy, Creative, SelectedCreative } from "../types";

export function CampaignCreativesSection({
  strategy,
  recommendedProduct,
  creatives,
  creativesLoading,
  creativesError,
  creativeFallbackImage,
  selectedCreatives,
  storyLoading,
  handleGenerateCreatives,
  handleGenerateStoryCreatives,
  handleStopGeneration,
  handleSelectCreative,
  handleRegenerateVariant,
}: {
  strategy: Strategy;
  recommendedProduct: any;
  creatives: Creative[];
  creativesLoading: boolean;
  creativesError: string;
  creativeFallbackImage: string | null;
  selectedCreatives: SelectedCreative[];
  storyLoading: boolean;
  handleGenerateCreatives: () => void | Promise<void>;
  handleGenerateStoryCreatives: () => void | Promise<void>;
  handleStopGeneration: () => void;
  handleSelectCreative: (creative: Creative) => void;
  handleRegenerateVariant: (variantType: string) => void | Promise<void>;
}) {
  if (!(strategy?.creativeBrief && recommendedProduct)) return null;

  return (
    <section className="campaign-creatives-section">
      <div className="creatives-header">
        <h2>🎨 Campaign Creatives</h2>
        <p>AI-generated social media creatives for this campaign</p>
      </div>

      {!creativesLoading && creatives.length === 0 && !creativesError && (
        <div className="creatives-generate-prompt">
          <div className="creatives-generate-actions">
            <button
              onClick={handleGenerateCreatives}
              className="btn-generate-creatives"
              disabled={creativesLoading}
            >
              Generate Creatives
            </button>
            <button
              onClick={() => {
                document
                  .getElementById("story-creatives-section")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
                void handleGenerateStoryCreatives();
              }}
              className="btn-generate-creatives btn-generate-story-creatives"
              disabled={storyLoading}
            >
              Generate Story Creatives
            </button>
          </div>
          <p className="creatives-hint">
            Generate 3 AI creative variants with strategic concepts, or scroll down for a connected 4-slide Story Creative
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

          {creatives.length > 0 && (
            <button
              onClick={handleStopGeneration}
              className="btn-stop-generation"
            >
              ⏹ Stop Generation (Use Current Creative)
            </button>
          )}

          {/* Show completed creatives immediately */}
          {creatives.length > 0 && (
            <div className="creatives-grid">
              {creatives.map((creative, index) => {
                const selectedItem = selectedCreatives.find(c => c.type === creative.type);
                const isSelected = !!selectedItem;
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
                      {isSelected && selectedItem && (
                        <div className="selected-badge">
                          {selectedItem.order} ✓
                        </div>
                      )}
                    </div>
                    <div className="creative-details">
                      <span className="creative-type-badge">
                        {creative.type.toUpperCase().replace(/-/g, ' ')}
                      </span>
                      <h3 className="creative-headline">{creative.headline}</h3>
                      {creative.subheadline && (
                        <p className="creative-subheadline">{creative.subheadline}</p>
                      )}

                      {/* Strategic metadata */}
                      {creative.sceneStrategy && (
                        <p className="creative-meta">
                          <strong>Scene Strategy:</strong> {creative.sceneStrategy.replace(/_/g, ' ')}
                        </p>
                      )}
                      {creative.productRole && (
                        <p className="creative-meta">
                          <strong>Product Role:</strong> {creative.productRole.charAt(0).toUpperCase() + creative.productRole.slice(1)}
                        </p>
                      )}
                      {creative.occasionContext && (
                        <p className="creative-meta">
                          <strong>Occasion:</strong> {creative.occasionContext}
                        </p>
                      )}
                      {creative.locationContext && (
                        <p className="creative-meta">
                          <strong>Location:</strong> {creative.locationContext}
                        </p>
                      )}
                      {creative.concept && (
                        <div className="creative-concept">
                          <strong>AI Concept</strong>
                          <p>{creative.concept}</p>
                        </div>
                      )}

                      {!creative.success && creative.error && (
                        <>
                          <p className="creative-error-note">⚠ {creative.error}</p>
                          {creative.error !== 'Regenerating...' && (
                            <button
                              className="retry-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRegenerateVariant(creative.type);
                              }}
                            >
                              🔄 Retry
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Show placeholders for remaining variants */}
          <div className="creatives-placeholders" style={{ marginTop: creatives.length > 0 ? '24px' : '0' }}>
            {Array.from({ length: 3 - creatives.length }).map((_, index) => {
              const placeholderIndex = creatives.length + index;
              const isGenerating = placeholderIndex === creatives.length;
              return (
                <div 
                  key={`placeholder-${placeholderIndex}`}
                  className={`creative-placeholder ${isGenerating ? 'generating' : 'waiting'}`}
                >
                  {isGenerating ? (
                    <div className="placeholder-spinner"></div>
                  ) : (
                    <div className="placeholder-waiting">⏳</div>
                  )}
                  <p>
                    {isGenerating 
                      ? `Generating Creative ${placeholderIndex + 1}...` 
                      : `Creative ${placeholderIndex + 1} - Waiting`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!creativesLoading && creatives.length > 0 && (
        <>
          <div className="creatives-grid">
            {creatives.map((creative, index) => {
              const selectedItem = selectedCreatives.find(c => c.type === creative.type);
              const isSelected = !!selectedItem;
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
                    {isSelected && selectedItem && (
                      <div className="selected-badge">
                        {selectedItem.order} ✓
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
                      <>
                        <p className="creative-error-note">⚠ {creative.error}</p>
                        {creative.error !== 'Regenerating...' && (
                          <button
                            className="retry-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRegenerateVariant(creative.type);
                            }}
                          >
                            🔄 Retry
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selection Summary */}
          {selectedCreatives.length > 0 && (
            <div className="creative-selection-summary">
              <h3>Selected Creative{selectedCreatives.length > 1 ? 's' : ''} ({selectedCreatives.length})</h3>
              {selectedCreatives.sort((a, b) => a.order - b.order).map((selected) => (
                <div key={selected.type} className="selection-info">
                  <p className="selection-type">
                    <strong>{selected.order}. {selected.type.toUpperCase().replace(/-/g, ' ')}</strong>
                  </p>
                  <p className="selection-headline">{selected.headline}</p>
                  <p className="selection-cta">CTA: {selected.cta}</p>
                  {selected.isFallback && (
                    <p className="selection-fallback-note">⚠ Using original product image</p>
                  )}
                </div>
              ))}
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
  );
}
