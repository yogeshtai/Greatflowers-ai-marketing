import { useCallback, useEffect, useState } from "react";
import type { GenerationState } from "../api/blogs";
import { approveWiki, deleteWiki, editWiki, generateWiki, getWikis, getWikiStatus, publishWikiNow, regenerateWikiImage, rejectWiki, wikiImageUrl, type WikiDraft, type WikiEdit } from "../api/wikis";

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");

export function WikiQueueSection() {
  const [wikis, setWikis] = useState<WikiDraft[]>([]);
  const [liveMode, setLiveMode] = useState(false);
  const [publishMode, setPublishMode] = useState<"immediate" | "scheduled">("immediate");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generation, setGeneration] = useState<GenerationState>({ running: false });
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, WikiEdit>>({});
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWikis();
      setWikis(data.wikis);
      setLiveMode(data.liveMode);
      setPublishMode(data.publishMode ?? "immediate");
      setGeneration(data.generation);
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not load wiki drafts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);
  useEffect(() => {
    if (!generation.running) return;
    const poll = setInterval(() => {
      getWikiStatus().then(({ generation: next }) => {
        setGeneration(next);
        if (!next.running) void load();
      }).catch(() => undefined);
    }, 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [generation.running, load]);

  const elapsedSeconds = generation.running && generation.startedAt ? Math.max(0, Math.floor((now - Date.parse(generation.startedAt)) / 1000)) : 0;
  const elapsedLabel = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
  const run = async (id: string | null, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError("");
    try {
      await action();
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };
  const imageBusy = (wiki: WikiDraft) => generation.running && !!generation.startedAt && wiki.createdAt >= generation.startedAt;
  const awaiting = wikis.filter((wiki) => wiki.status === "draft" || wiki.status === "failed").length;
  const value = <K extends keyof WikiEdit>(wiki: WikiDraft, key: K) => (editing[wiki.id]?.[key] ?? wiki[key]) as string;
  const change = (id: string, key: keyof WikiEdit, next: string) => setEditing((current) => ({ ...current, [id]: { ...current[id], [key]: next } }));
  const confirmDelete = (wiki: WikiDraft) => {
    if (!window.confirm(`Permanently delete “${wiki.title}”? This removes the queue entry and its local AI image. It does not delete an already published wiki page.`)) return;
    void run(wiki.id, () => deleteWiki(wiki.id));
  };

  return (
    <section className="history-section">
      <div className="history-header">
        <div>
          <span className="step">Daily Flower Wiki</span>
          <h2>Wiki Queue{awaiting > 0 ? ` (${awaiting} waiting for approval)` : ""}</h2>
          <p style={{ margin: "6px 0 0", color: "#70706a", fontSize: 13 }}>
            A new flower encyclopedia draft is written daily at 7:00 PM IST. {publishMode === "immediate" ? "Approving an entry publishes it right away." : "Approved entries publish at 10:00 AM ET."} {liveMode ? "Live mode: entries are public." : "Safe mode: entries are created hidden."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="secondary-button" onClick={load} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button>
          <button className="primary-action-button" disabled={generation.running} onClick={() => run(null, generateWiki)}>
            {generation.running ? "Writing wiki draft..." : "Generate wiki draft now"}
          </button>
        </div>
      </div>

      {generation.running && (
        <div role="status" style={{ margin: "0 0 16px", padding: "14px 18px", borderRadius: 12, background: "#eef7ed", border: "1px solid #c9dfc5", color: "#275b2a" }}>
          <strong>Writing a new wiki draft... {elapsedLabel}</strong>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {generation.trigger === "schedule" ? "Started by the daily 7:00 PM IST run. " : "Started from this page. "}
            The article is written first, followed by its 4:3 botanical image. You may leave this page while it runs.
            {elapsedSeconds > 15 * 60 && " It is taking unusually long; check the server logs if it does not finish soon."}
          </div>
        </div>
      )}
      {error && <p role="alert" className="creative-error-note">{error}</p>}
      {!generation.running && generation.error && <p role="alert" className="creative-error-note">The last wiki draft attempt failed: {generation.error}</p>}

      {wikis.length === 0 ? (
        <div className="empty-state"><h3>No wiki drafts yet</h3><p>The first draft appears after the next 7:00 PM IST run, or generate one now.</p></div>
      ) : (
        <div className="campaign-list">
          {wikis.map((wiki) => {
            const editable = wiki.status === "draft" || wiki.status === "failed";
            const open = openId === wiki.id;
            const makingImage = editable && imageBusy(wiki);
            const pendingEdit = editing[wiki.id];
            return (
              <article className="campaign-item" key={wiki.id} style={{ display: "block" }}>
                <div className="campaign-meta">
                  <span className={`status status-${wiki.status}`}>{wiki.status}</span>
                  {makingImage && <span>making the wiki image...</span>}
                  <span>{when(wiki.createdAt)}</span>
                  <span>{wiki.botanicalName}</span>
                  <span>{wiki.productIds.length} related product{wiki.productIds.length === 1 ? "" : "s"}</span>
                  <span>{wiki.environment}</span>
                </div>
                <h3 style={{ marginBottom: 6 }}>{wiki.title}</h3>
                <p style={{ margin: "0 0 8px" }}>{wiki.description}</p>
                {wiki.status === "approved" && <div className="schedule-info">{publishMode === "immediate" ? `Publishing${wiki.error ? ` failed, retrying: ${wiki.error}` : " now or retrying after a failure..."}` : `Publishes: ${when(wiki.publishAfter)}${wiki.error ? ` (last error: ${wiki.error})` : ""}`}</div>}
                {wiki.status === "published" && <div className="schedule-info">Published {when(wiki.publishedAt)} ({wiki.remoteStatus === 1 ? "visible" : "hidden"}){wiki.url && <> - <a href={wiki.url} target="_blank" rel="noreferrer">view</a></>}</div>}
                {wiki.status === "failed" && <div className="schedule-error">Failed after {wiki.attempts} attempts: {wiki.error}</div>}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                  <button className="secondary-button" onClick={() => setOpenId(open ? null : wiki.id)}>{open ? "Hide preview" : "Preview / edit"}</button>
                  {editable && <button className="primary-action-button" disabled={busyId === wiki.id || makingImage} onClick={() => run(wiki.id, () => approveWiki(wiki.id))}>{publishMode === "immediate" ? "Approve & publish" : "Approve"}</button>}
                  {(wiki.status === "approved" || (editable && publishMode === "scheduled")) && <button className="secondary-button" disabled={busyId === wiki.id || makingImage} onClick={() => window.confirm("Publish this wiki entry right now?") && run(wiki.id, () => publishWikiNow(wiki.id))}>Publish now</button>}
                  {wiki.status !== "published" && wiki.status !== "rejected" && <button className="secondary-button" disabled={busyId === wiki.id} onClick={() => window.confirm("Reject this wiki draft?") && run(wiki.id, () => rejectWiki(wiki.id))}>Reject</button>}
                  {wiki.status !== "published" && <button className="delete-button" disabled={busyId === wiki.id || makingImage} onClick={() => confirmDelete(wiki)}>{busyId === wiki.id ? "Working..." : "Delete permanently"}</button>}
                </div>

                {open && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ marginBottom: 12 }}>
                      {wiki.imageSource === "ai" ? (
                        <img src={wikiImageUrl(wiki)} alt={`Wiki image for ${wiki.title}`} style={{ width: "100%", maxWidth: 560, aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 10, border: "1px solid #e0e0d8" }} />
                      ) : <div style={{ fontSize: 12, color: "#70706a" }}>Wiki image: related product photo fallback.</div>}
                      {(editable || wiki.status === "approved") && <div style={{ marginTop: 8 }}><button className="secondary-button" disabled={busyId === wiki.id || makingImage} onClick={() => run(wiki.id, () => regenerateWikiImage(wiki.id))}>{busyId === wiki.id ? "Making image..." : wiki.imageSource === "ai" ? "New AI image" : "Make AI image"}</button></div>}
                    </div>

                    {editable && (
                      <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                        <label style={{ fontSize: 12, color: "#70706a" }}>Title</label>
                        <input value={value(wiki, "title")} onChange={(event) => change(wiki.id, "title", event.target.value)} style={{ padding: 8 }} />
                        <label style={{ fontSize: 12, color: "#70706a" }}>Botanical name</label>
                        <input value={value(wiki, "botanicalName")} onChange={(event) => change(wiki.id, "botanicalName", event.target.value)} style={{ padding: 8 }} />
                        <label style={{ fontSize: 12, color: "#70706a" }}>Description</label>
                        <textarea value={value(wiki, "description")} onChange={(event) => change(wiki.id, "description", event.target.value)} rows={3} style={{ padding: 8 }} />
                        <label style={{ fontSize: 12, color: "#70706a" }}>SEO title</label>
                        <input value={value(wiki, "metaTitle")} onChange={(event) => change(wiki.id, "metaTitle", event.target.value)} style={{ padding: 8 }} />
                        <label style={{ fontSize: 12, color: "#70706a" }}>SEO description</label>
                        <textarea value={value(wiki, "metaDescription")} onChange={(event) => change(wiki.id, "metaDescription", event.target.value)} rows={2} style={{ padding: 8 }} />
                        <label style={{ fontSize: 12, color: "#70706a" }}>Article HTML</label>
                        <textarea value={value(wiki, "html")} onChange={(event) => change(wiki.id, "html", event.target.value)} rows={12} style={{ padding: 8, fontFamily: "monospace", fontSize: 12 }} />
                        <div><button className="secondary-button" disabled={busyId === wiki.id || !pendingEdit || Object.keys(pendingEdit).length === 0} onClick={() => run(wiki.id, async () => { await editWiki(wiki.id, pendingEdit ?? {}); setEditing((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== wiki.id))); })}>Save changes</button></div>
                      </div>
                    )}
                    <iframe title={wiki.title} sandbox="" srcDoc={`<style>body{font-family:sans-serif;max-width:900px;margin:16px auto;padding:0 14px;line-height:1.7}h2{margin-top:1.4em}a{color:#701888}</style>${wiki.html}`} style={{ width: "100%", height: 580, border: "1px solid #e0e0d8", borderRadius: 10, background: "white" }} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
