import { Card, BulletList, CopyButton } from "./common";
import type { Strategy } from "../types";

export function StrategyDetails({
  strategy,
}: {
  strategy: Strategy;
}) {
  return (
    <>
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
                          <span key={tag}>
                            {tag.startsWith("#") ? tag : `#${tag}`}
                          </span>
                        )
                      )}
                    </div>

                    <CopyButton
                      text={`${strategy.platformContent.instagram.caption}

    ${strategy.platformContent.instagram.hashtags
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
      .join(" ")}`}
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
    </>
  );
}
