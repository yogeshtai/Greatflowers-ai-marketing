import { EvidenceGroup, SourcesChecked } from "./common";
import type { RecommendationEvidence } from "../types";

export function EvidenceSection({
  recommendationEvidence,
}: {
  recommendationEvidence: RecommendationEvidence | null;
}) {
  if (!(recommendationEvidence)) return null;

  return (
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
  );
}
