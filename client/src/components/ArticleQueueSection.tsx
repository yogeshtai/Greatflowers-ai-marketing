import { useCallback, useEffect, useState } from "react";
import { approveArticle, articleImageUrl, deleteArticle, editArticle, generateArticle, getArticles, getArticleStatus, publishArticleNow, regenerateArticleImage, rejectArticle, type ArticleDraft, type ArticleEdit, type ArticleGenerationState } from "../api/articles";

const when = (iso?: string) => iso ? new Date(iso).toLocaleString() : "";

export function ArticleQueueSection() {
  const [articles, setArticles] = useState<ArticleDraft[]>([]);
  const [liveMode, setLiveMode] = useState(false);
  const [topics, setTopics] = useState<string[]>([]);
  const [publishMode, setPublishMode] = useState<"immediate" | "scheduled">("immediate");
  const [generation, setGeneration] = useState<ArticleGenerationState>({ running: false });
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, ArticleEdit>>({});
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getArticles();
      setArticles(data.articles); setTopics(data.topics); setLiveMode(data.liveMode); setPublishMode(data.publishMode); setGeneration(data.generation); setError("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not load article drafts"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (!generation.running) return;
    const poll = setInterval(() => getArticleStatus().then(({ generation: next }) => { setGeneration(next); if (!next.running) void load(); }).catch(() => undefined), 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [generation.running, load]);

  const run = async (id: string | null, action: () => Promise<unknown>) => {
    setBusyId(id); setError("");
    try { await action(); await load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Action failed"); }
    finally { setBusyId(null); }
  };
  const elapsed = generation.running && generation.startedAt ? Math.max(0, Math.floor((now - Date.parse(generation.startedAt)) / 1000)) : 0;
  const imageBusy = (article: ArticleDraft) => generation.running && !!generation.startedAt && article.createdAt >= generation.startedAt;
  const awaiting = articles.filter((article) => article.status === "draft" || article.status === "failed").length;
  const value = <K extends keyof ArticleEdit>(article: ArticleDraft, key: K) => (editing[article.id]?.[key] ?? article[key]) as string;
  const change = (id: string, key: keyof ArticleEdit, next: string) => setEditing((current) => ({ ...current, [id]: { ...current[id], [key]: next } }));

  return <section className="history-section">
    <div className="history-header">
      <div><span className="step">Daily Editorial Article</span><h2>Article Queue{awaiting ? ` (${awaiting} waiting for approval)` : ""}</h2>
        <p style={{ margin: "6px 0 0", color: "#70706a", fontSize: 13 }}>A distinct long-form article is written daily at 6:30 PM IST. {publishMode === "immediate" ? "Approving publishes it right away." : "Approved articles publish at 10:00 AM ET."} {liveMode ? "Live mode: articles are public." : "Safe mode: articles are created hidden."}</p>
      </div>
      <div style={{ display: "flex", gap: 10 }}><button className="secondary-button" onClick={load} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button><button className="primary-action-button" disabled={generation.running} onClick={() => run(null, generateArticle)}>{generation.running ? (generation.phase === "image" ? "Creating article image..." : "Writing article...") : "Generate article draft now"}</button></div>
    </div>
    {generation.running && <div role="status" style={{ margin: "0 0 16px", padding: "14px 18px", borderRadius: 12, background: "#eef7ed", border: "1px solid #c9dfc5", color: "#275b2a" }}><strong>{generation.phase === "image" ? "Article ready — creating its image" : "Writing a new article"}... {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</strong><div style={{ fontSize: 13, marginTop: 4 }}>{generation.trigger === "schedule" ? "Started by the daily 6:30 PM IST run. " : "Started from this page. "}You may leave this page while it runs.</div></div>}
    {error && <p role="alert" className="creative-error-note">{error}</p>}
    {!generation.running && generation.error && <p role="alert" className="creative-error-note">The last article draft attempt failed: {generation.error}</p>}
    {!articles.length ? <div className="empty-state"><h3>No article drafts yet</h3><p>The first draft appears after the next 6:30 PM IST run, or generate one now.</p></div> : <div className="campaign-list">{articles.map((article) => {
      const editable = article.status === "draft" || article.status === "failed";
      const open = openId === article.id;
      const makingImage = editable && imageBusy(article);
      const pendingEdit = editing[article.id];
      return <article className="campaign-item" key={article.id} style={{ display: "block" }}>
        <div className="campaign-meta"><span className={`status status-${article.status}`}>{article.status}</span>{makingImage && <span>making the article image...</span>}<span>{when(article.createdAt)}</span><span>by {article.authorName}</span><span>{article.topic}</span><span>{article.format.replaceAll("_", " ").toLowerCase()}</span><span>{article.productIds.length} related products</span><span>{article.environment}</span></div>
        <h3 style={{ marginBottom: 6 }}>{article.title}</h3><p style={{ margin: "0 0 8px" }}>{article.description}</p>
        {article.status === "approved" && <div className="schedule-info">{publishMode === "immediate" ? `Publishing${article.error ? ` failed, retrying: ${article.error}` : " now..."}` : `Publishes: ${when(article.publishAfter)}`}</div>}
        {article.status === "published" && <div className="schedule-info">Published {when(article.publishedAt)} ({article.remoteStatus === 1 ? "visible" : "hidden"}){article.url && <> - <a href={article.url} target="_blank" rel="noreferrer">view</a></>}</div>}
        {article.status === "failed" && <div className="schedule-error">Failed after {article.attempts} attempts: {article.error}</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button className="secondary-button" onClick={() => setOpenId(open ? null : article.id)}>{open ? "Hide preview" : "Preview / edit"}</button>
          {editable && <button className="primary-action-button" disabled={busyId === article.id || makingImage} onClick={() => run(article.id, () => approveArticle(article.id))}>{publishMode === "immediate" ? "Approve & publish" : "Approve"}</button>}
          {(article.status === "approved" || (editable && publishMode === "scheduled")) && <button className="secondary-button" disabled={busyId === article.id || makingImage} onClick={() => window.confirm("Publish this article right now?") && run(article.id, () => publishArticleNow(article.id))}>Publish now</button>}
          {article.status !== "published" && article.status !== "rejected" && <button className="secondary-button" disabled={busyId === article.id} onClick={() => window.confirm("Reject this article draft?") && run(article.id, () => rejectArticle(article.id))}>Reject</button>}
          {article.status !== "published" && <button className="delete-button" disabled={busyId === article.id || makingImage} onClick={() => window.confirm(`Permanently delete “${article.title}”? This only removes the local queue entry and image.`) && run(article.id, () => deleteArticle(article.id))}>Delete permanently</button>}
        </div>
        {open && <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12 }}>{article.imageSource === "ai" ? <img src={articleImageUrl(article)} alt={`Article image for ${article.title}`} style={{ width: "100%", maxWidth: 640, aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 10, border: "1px solid #e0e0d8" }} /> : <div style={{ fontSize: 12, color: "#70706a" }}>Article image: related product photo fallback.</div>}{(editable || article.status === "approved") && <div style={{ marginTop: 8 }}><button className="secondary-button" disabled={busyId === article.id || makingImage} onClick={() => run(article.id, () => regenerateArticleImage(article.id))}>{busyId === article.id ? "Making image..." : article.imageSource === "ai" ? "New AI image" : "Make AI image"}</button></div>}</div>
          {editable && <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            {(["title", "topic", "authorName", "description", "metaTitle", "metaDescription", "html"] as const).map((key) => <label key={key} style={{ fontSize: 12, color: "#70706a" }}>{key === "authorName" ? "Author" : key === "metaTitle" ? "SEO title" : key === "metaDescription" ? "SEO description" : key === "html" ? "Article HTML" : key[0]!.toUpperCase() + key.slice(1)}{key === "topic" ? <select value={value(article, key)} onChange={(event) => change(article.id, key, event.target.value)} style={{ display: "block", width: "100%", padding: 8 }}>{topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select> : ["description", "metaDescription", "html"].includes(key) ? <textarea value={value(article, key)} onChange={(event) => change(article.id, key, event.target.value)} rows={key === "html" ? 14 : 3} style={{ display: "block", width: "100%", padding: 8, fontFamily: key === "html" ? "monospace" : undefined }} /> : <input value={value(article, key)} onChange={(event) => change(article.id, key, event.target.value)} style={{ display: "block", width: "100%", padding: 8 }} />}</label>)}
            <div><button className="secondary-button" disabled={busyId === article.id || !pendingEdit || !Object.keys(pendingEdit).length} onClick={() => run(article.id, async () => { await editArticle(article.id, pendingEdit ?? {}); setEditing((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== article.id))); })}>Save changes</button></div>
          </div>}
          <iframe title={article.title} sandbox="" srcDoc={`<style>body{font-family:sans-serif;max-width:900px;margin:16px auto;padding:0 14px;line-height:1.7}h2{margin-top:1.4em}a{color:#701888}</style>${article.html}`} style={{ width: "100%", height: 600, border: "1px solid #e0e0d8", borderRadius: 10, background: "white" }} />
        </div>}
      </article>;
    })}</div>}
  </section>;
}
