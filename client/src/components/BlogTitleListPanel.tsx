import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addBlogTitles,
  deleteBlogTitle,
  getBlogTitles,
  previewBlogTitlePick,
  updateBlogTitle,
  type AddTitlesResult,
  type BlogTitle,
  type BlogTitleList,
  type TitlePickPreview,
} from "../api/blogTitles";
import { generateBlogFromList, generateBlogFromTitle } from "../api/blogs";

const message = (error: unknown) => (error instanceof Error ? error.message : "Action failed");
const shortDate = (isoDate: string) => new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Being written, pinned, ready, waiting for its season, needs attention, skipped, written.
const rank = (title: BlogTitle) =>
  title.status === "writing" ? 0
    : title.status === "queued" ? (title.pinned ? 1 : title.season.ready ? 2 : 3)
      : title.status === "failed" ? 4 : title.status === "skipped" ? 5 : 6;

function statusChip(title: BlogTitle): { label: string; tone: string } {
  switch (title.status) {
    case "writing": return { label: "Writing now", tone: "writing" };
    case "used": return { label: "Written", tone: "used" };
    case "skipped": return { label: "Skipped", tone: "skipped" };
    case "failed": return { label: "Needs attention", tone: "failed" };
    default:
      if (title.pinned) return { label: "Pinned: next", tone: "pinned" };
      if (!title.season.ready && title.season.occasion) {
        return { label: `Waits for ${title.season.occasion.name} (${shortDate(title.season.occasion.date)})`, tone: "waiting" };
      }
      return { label: "Ready", tone: "ready" };
  }
}

const pickLabel: Record<TitlePickPreview["method"], string> = {
  ai: "The AI would pick",
  pinned: "Next up (pinned)",
  only: "Next up (the only ready title)",
  fallback: "Next up (the AI was unavailable, so the soonest seasonal or oldest title)",
};

export function BlogTitleListPanel({ generationRunning, refreshKey, onStarted, onListChange }: {
  generationRunning: boolean;
  /** Called with the list each time it loads, so the queue header can mention it. */
  onListChange?: (list: BlogTitleList) => void;
  /** Changes when a generation starts or ends, so the list reloads its statuses. */
  refreshKey: string;
  onStarted: () => void | Promise<void>;
}) {
  const [list, setList] = useState<BlogTitleList | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AddTitlesResult | null>(null);
  const [preview, setPreview] = useState<TitlePickPreview | null>(null);
  const [showWritten, setShowWritten] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await getBlogTitles();
      setList(next);
      onListChange?.(next);
      setError("");
    } catch (e) {
      setError(message(e));
    }
  }, [onListChange]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const lines = useMemo(() => text.split("\n").map((line) => line.trim()).filter(Boolean), [text]);
  const titles = useMemo(() => [...(list?.titles ?? [])].sort((a, b) => rank(a) - rank(b) || a.addedAt.localeCompare(b.addedAt)), [list]);
  const writtenCount = titles.filter((title) => title.status === "used").length;
  const visible = showWritten ? titles : titles.filter((title) => title.status !== "used");
  const ready = list?.stats.ready ?? 0;
  const perWeek = list?.runsPerWeek ?? 3;
  const weeks = Math.round(ready / perWeek);
  const supply = ready === 0 ? "no ready titles yet" : ready < perWeek ? "less than a week of posts" : `about ${weeks} week${weeks === 1 ? "" : "s"} of posts`;

  const act = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const add = () => act("add", async () => {
    const outcome = await addBlogTitles(lines);
    setResult(outcome);
    // Rejected lines stay in the box so they can be reworded and added again.
    setText(outcome.rejected.map((item) => item.title).join("\n"));
  });
  const write = (key: string, start: () => Promise<unknown>) => act(key, async () => {
    await start();
    setPreview(null);
    await onStarted();
  });
  const remove = (title: BlogTitle) => {
    if (!window.confirm(`Remove “${title.title}” from the title list?${title.status === "used" ? " Its blog post is not affected." : ""}`)) return;
    void act(title.id, () => deleteBlogTitle(title.id));
  };

  return (
    <div className="title-list-panel">
      <div className="title-list-head">
        <div>
          <h3>Title list</h3>
          {list && (
            <p className="title-list-summary">
              {ready} ready · {list.stats.waiting} waiting for their season · {writtenCount} written
              {list.stats.failed ? ` · ${list.stats.failed} need attention` : ""}
            </p>
          )}
          <p className="title-list-hint">
            {!list ? "Loading..."
              : list.usedBySchedule ? `Scheduled runs use this list first (${perWeek} posts a week): ${supply}. When nothing is ready, they plan a post from the occasion calendar as before.`
                : list.listSwitchedOff ? "Scheduled runs ignore this list (BLOG_TITLE_LIST=false). Use the buttons to write from it."
                  : "Timed drafts are off for this brand. Use the buttons to write from the list."}
          </p>
        </div>
        <div className="title-list-actions">
          <button className="secondary-button" disabled={!ready || busy !== null || generationRunning} onClick={() => act("preview", async () => setPreview(await previewBlogTitlePick()))}>
            {busy === "preview" ? "Asking the AI (1-3 min)..." : "Preview AI pick"}
          </button>
          <button className="primary-action-button" disabled={!ready || busy !== null || generationRunning} onClick={() => write("pick", generateBlogFromList)}>
            {generationRunning ? "Writing a draft..." : "Let AI pick & write"}
          </button>
        </div>
      </div>

      {preview && (
        <div className="schedule-note title-list-preview" role="status">
          <strong>{pickLabel[preview.method]}:</strong> “{preview.title}”. {preview.reason}
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button className="primary-action-button" disabled={busy !== null || generationRunning} onClick={() => write(preview.titleId, () => generateBlogFromTitle(preview.titleId))}>Write it</button>
            <button className="secondary-button" onClick={() => setPreview(null)}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="title-list-add">
        <label htmlFor="blog-title-input">Add titles, one per line</label>
        <textarea
          id="blog-title-input"
          rows={4}
          value={text}
          disabled={busy === "add"}
          placeholder={"Christmas Centerpieces That Leave Room for Dinner\n5 Best Winter Bouquets for a Cozy Home"}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="title-list-add-row">
          <button className="secondary-button" disabled={!lines.length || busy !== null} onClick={add}>
            {busy === "add" ? "Checking titles..." : lines.length ? `Add ${lines.length} title${lines.length === 1 ? "" : "s"}` : "Add titles"}
          </button>
          <span>Each title is checked against the site's existing blogs, wiki entries and articles.</span>
        </div>
      </div>

      {result && (
        <div className="title-list-result" role="status">
          <span>Added {result.added.length} title{result.added.length === 1 ? "" : "s"}.</span>
          {result.rejected.length > 0 && (
            <>
              <span> Not added ({result.rejected.length}, left in the box to reword):</span>
              <ul>{result.rejected.map((item) => <li key={item.title}><strong>{item.title}</strong>: {item.reason}</li>)}</ul>
            </>
          )}
        </div>
      )}
      {error && <p role="alert" className="creative-error-note">{error}</p>}

      {titles.length > 0 && (
        <ul className="title-list">
          {visible.map((title) => {
            const chip = statusChip(title);
            const rowBusy = busy === title.id;
            const canWrite = (title.status === "queued" || title.status === "skipped" || title.status === "failed") && !generationRunning && busy === null;
            return (
              <li key={title.id} className="title-row">
                <div className="title-row-main">
                  <span className="title-row-text">{title.title}</span>
                  <div className="title-row-meta">
                    <span className={`title-chip title-chip-${chip.tone}`}>{chip.label}</span>
                    {title.status === "used" && title.draftTitle && title.draftTitle !== title.title && <span>written as “{title.draftTitle}”</span>}
                    {title.status === "used" && title.usedAt && <span>{new Date(title.usedAt).toLocaleDateString()}</span>}
                  </div>
                  {title.status === "queued" && title.warnings.length > 0 && (
                    <ul className="title-row-warnings">{title.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                  )}
                  {(title.status === "failed" || title.status === "skipped") && title.error && <div className="title-row-error">{title.error}</div>}
                  {title.status === "used" && title.selectionReason && <div className="title-row-reason">Why: {title.selectionReason}</div>}
                </div>
                <div className="title-row-actions">
                  {canWrite && <button className="secondary-button" onClick={() => write(title.id, () => generateBlogFromTitle(title.id))}>Write this one</button>}
                  {title.status === "queued" && (
                    <button className="secondary-button" disabled={busy !== null} onClick={() => act(title.id, () => updateBlogTitle(title.id, { pinned: !title.pinned }))}>{title.pinned ? "Unpin" : "Pin next"}</button>
                  )}
                  {title.status === "queued" && <button className="secondary-button" disabled={busy !== null} onClick={() => act(title.id, () => updateBlogTitle(title.id, { status: "skipped" }))}>Skip</button>}
                  {(title.status === "skipped" || title.status === "failed") && (
                    <button className="secondary-button" disabled={busy !== null} onClick={() => act(title.id, () => updateBlogTitle(title.id, { status: "queued" }))}>Restore</button>
                  )}
                  {title.status !== "writing" && (
                    <button className="delete-button" disabled={busy !== null} onClick={() => remove(title)}>{rowBusy ? "Working..." : "Remove"}</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {writtenCount > 0 && (
        <button className="title-list-toggle" onClick={() => setShowWritten(!showWritten)}>
          {showWritten ? "Hide written titles" : `Show written titles (${writtenCount})`}
        </button>
      )}
    </div>
  );
}
