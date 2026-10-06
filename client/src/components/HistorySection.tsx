import type { SavedCampaign, CampaignStatus, ScheduleForm } from "../types";
import { cancelCampaignSchedule } from "../api/schedule";

export function HistorySection({
  campaigns,
  historyLoading,
  deleteError,
  deletingCampaignId,
  loadCampaigns,
  handleDeleteCampaign,
  handleOpenCampaign,
  handleStatusChange,
  setScheduleCampaign,
  setScheduleForm,
}: {
  campaigns: SavedCampaign[];
  historyLoading: boolean;
  deleteError: string;
  deletingCampaignId: string | null;
  loadCampaigns: () => void | Promise<void>;
  handleDeleteCampaign: (campaign: SavedCampaign) => void | Promise<void>;
  handleOpenCampaign: (campaign: SavedCampaign) => void;
  handleStatusChange: (id: string, status: CampaignStatus) => void | Promise<void>;
  setScheduleCampaign: (campaign: SavedCampaign | null) => void;
  setScheduleForm: (form: ScheduleForm) => void;
}) {
  return (
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

      {deleteError && <p role="alert" className="creative-error-note">{deleteError}</p>}
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
                <button className="secondary-button campaign-delete-button"
                  disabled={deletingCampaignId !== null || campaign.publishStatus === "publishing"}
                  onClick={() => void handleDeleteCampaign(campaign)}>
                  {deletingCampaignId === campaign.id ? "Deleting…" : "Delete"}
                </button>
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
  );
}
