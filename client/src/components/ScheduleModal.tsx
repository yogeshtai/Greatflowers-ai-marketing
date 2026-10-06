import type { SavedCampaign, ScheduleForm } from "../types";

export function ScheduleModal({
  scheduleCampaign,
  scheduleForm,
  setScheduleForm,
  setScheduleCampaign,
  handleScheduleSubmit,
}: {
  scheduleCampaign: SavedCampaign | null;
  scheduleForm: ScheduleForm;
  setScheduleForm: (form: ScheduleForm) => void;
  setScheduleCampaign: (campaign: SavedCampaign | null) => void;
  handleScheduleSubmit: () => void | Promise<void>;
}) {
  if (!scheduleCampaign) return null;

  return (
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
  );
}
