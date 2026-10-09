import { useCallback, useEffect, useState } from "react";
import { approveBlog, blogHeroUrl, deleteBlog, editBlog, generateBlog, getBlogStatus, getBlogs, publishBlogNow, regenerateBlogHero, rejectBlog, type BlogDraft, type GenerationState } from "../api/blogs";

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");

export function BlogQueueSection() {
  const [blogs, setBlogs] = useState<BlogDraft[]>([]);
  const [liveMode, setLiveMode] = useState(false);
  const [publishMode, setPublishMode] = useState<"immediate" | "scheduled">("immediate");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generation, setGeneration] = useState<GenerationState>({ running: false });
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBlogs();
      setBlogs(data.blogs);
      setLiveMode(data.liveMode);
      setPublishMode(data.publishMode ?? "immediate");
      setGeneration(data.generation);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load blogs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!generation.running) return;
    const poll = setInterval(() => {
      getBlogStatus().then(({ generation: next }) => {
        setGeneration(next);
        if (!next.running) void load();
      }).catch(() => undefined);
    }, 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [generation.running, load]);

  const elapsedSeconds = generation.running && generation.startedAt ? Math.max(0, Math.floor((now - Date.parse(generation.startedAt)) / 1000)) : 0;
  const elapsedLabel = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  const run = async (id: string | null, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const imageBusy = (blog: BlogDraft) => generation.running && !!generation.startedAt && blog.createdAt >= generation.startedAt;
  const awaiting = blogs.filter((b) => b.status === "draft" || b.status === "failed").length;
  const confirmDelete = (blog: BlogDraft) => {
    if (!window.confirm(`Permanently delete “${blog.title}”? This removes the queue entry and its local AI hero file. This cannot be undone.`)) return;
    void run(blog.id, () => deleteBlog(blog.id));
  };

  return (
    <section className="history-section">
      <div className="history-header">
        <div>
          <span className="step">Daily Blog</span>
          <h2>Blog Queue{awaiting > 0 ? ` (${awaiting} waiting for approval)` : ""}</h2>
          <p style={{ margin: "6px 0 0", color: "#70706a", fontSize: 13 }}>
            A draft is written daily at 6:00 PM IST.{" "}
            {publishMode === "immediate" ? "Approving a post publishes it right away." : "Approved posts go live at 10:00 AM ET."}{" "}
            {liveMode ? "Live mode: posts are published." : "Safe mode: posts are created hidden (not visible to readers)."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="secondary-button" onClick={load} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button>
          <button className="primary-action-button" disabled={generation.running} onClick={() => run(null, generateBlog)}>
            {generation.running ? "Writing draft (up to 10 minutes)..." : "Generate draft now"}
          </button>
        </div>
      </div>

      {generation.running && (
        <div role="status" style={{ margin: "0 0 16px", padding: "14px 18px", borderRadius: 12, background: "#eef3ff", border: "1px solid #c9d6ff", color: "#1f3a8a" }}>
          <strong>Writing a new blog draft... {elapsedLabel}</strong>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {generation.trigger === "schedule" ? "Started by the daily 6:00 PM IST run. " : "Started from this page. "}
            This takes about 5 to 10 minutes (the writing, then the hero image). You can leave this page; the draft appears here by itself when it is ready.
            {elapsedSeconds > 15 * 60 && " It is taking unusually long. Check the server logs if it does not finish soon."}
          </div>
        </div>
      )}
      {error && <p role="alert" className="creative-error-note">{error}</p>}
      {!generation.running && generation.error && <p role="alert" className="creative-error-note">The last draft attempt failed: {generation.error}</p>}

      {blogs.length === 0 ? (
        <div className="empty-state"><h3>No blog drafts yet</h3><p>The first draft appears after the next 6:00 PM IST run, or generate one now.</p></div>
      ) : (
        <div className="campaign-list">
          {blogs.map((blog) => {
            const editable = blog.status === "draft" || blog.status === "failed";
            const open = openId === blog.id;
            const makingImage = editable && imageBusy(blog);
            const title = editing[blog.id] ?? blog.title;
            return (
              <article className="campaign-item" key={blog.id} style={{ display: "block" }}>
                <div className="campaign-meta">
                  <span className={`status status-${blog.status}`}>{blog.status}</span>
                  {makingImage && <span>making the hero image...</span>}
                  <span>{when(blog.createdAt)}</span>
                  <span>categories: {blog.categorySlug === "none" ? "none (no category fits)" : [blog.categorySlug, blog.secondCategorySlug].filter(Boolean).join(" + ")}</span>
                  <span>{blog.environment}</span>
                </div>
                <h3 style={{ marginBottom: 6 }}>{blog.title}</h3>
                <p style={{ margin: "0 0 8px" }}>{blog.summary}</p>
                {blog.status === "approved" && <div className="schedule-info">{publishMode === "immediate" ? `Publishing${blog.error ? ` failed, retrying: ${blog.error}` : " now or retrying after a failure..."}` : `Goes live: ${when(blog.publishAfter)}${blog.error ? ` (last error: ${blog.error})` : ""}`}</div>}
                {blog.status === "published" && <div className="schedule-info">Published {when(blog.publishedAt)} ({blog.remoteStatus === 1 ? "visible" : "hidden"}){blog.url && <> - <a href={blog.url} target="_blank" rel="noreferrer">view</a></>}</div>}
                {(blog.status === "failed") && <div className="schedule-error">Failed after {blog.attempts} attempts: {blog.error}</div>}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                  <button className="secondary-button" onClick={() => setOpenId(open ? null : blog.id)}>{open ? "Hide preview" : "Preview / edit"}</button>
                  {editable && <button className="primary-action-button" disabled={busyId === blog.id || makingImage} title={makingImage ? "Wait for the hero image to finish" : undefined} onClick={() => run(blog.id, () => approveBlog(blog.id))}>{publishMode === "immediate" ? "Approve & publish" : "Approve"}</button>}
                  {(blog.status === "approved" || (editable && publishMode === "scheduled")) && <button className="secondary-button" disabled={busyId === blog.id || makingImage} onClick={() => window.confirm("Publish this post right now?") && run(blog.id, () => publishBlogNow(blog.id))}>Publish now</button>}
                  {blog.status !== "published" && blog.status !== "rejected" && <button className="secondary-button" disabled={busyId === blog.id} onClick={() => window.confirm("Reject this draft?") && run(blog.id, () => rejectBlog(blog.id))}>Reject</button>}
                  {blog.status !== "published" && (
                    <button
                      className="delete-button"
                      disabled={busyId === blog.id || makingImage}
                      title={makingImage ? "Wait for the hero image to finish" : "Permanently delete this queue entry"}
                      onClick={() => confirmDelete(blog)}
                    >
                      {busyId === blog.id ? "Working..." : "Delete permanently"}
                    </button>
                  )}
                </div>

                {open && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ marginBottom: 12 }}>
                      {blog.heroSource === "ai" ? (
                        <img src={blogHeroUrl(blog)} alt={`Hero for ${blog.title}`} style={{ width: "100%", maxWidth: 600, aspectRatio: "1712 / 624", objectFit: "cover", borderRadius: 10, border: "1px solid #e0e0d8" }} />
                      ) : (
                        <div style={{ fontSize: 12, color: "#70706a" }}>Post image: the product photo (no AI image was made).</div>
                      )}
                      {(editable || blog.status === "approved") && (
                        <div style={{ marginTop: 8 }}>
                          <button className="secondary-button" disabled={busyId === blog.id} onClick={() => run(blog.id, () => regenerateBlogHero(blog.id))}>
                            {busyId === blog.id ? "Making image (a few minutes)..." : blog.heroSource === "ai" ? "New AI image" : "Make AI image"}
                          </button>
                        </div>
                      )}
                    </div>
                    {editable && (
                      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                        <label style={{ fontSize: 12, color: "#70706a" }}>Title</label>
                        <input value={title} onChange={(e) => setEditing({ ...editing, [blog.id]: e.target.value })} style={{ padding: 8 }} />
                        <div>
                          <button className="secondary-button" disabled={busyId === blog.id || title === blog.title} onClick={() => run(blog.id, async () => {
                            await editBlog(blog.id, { title });
                            setEditing((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== blog.id)));
                          })}>Save title</button>
                        </div>
                        <div style={{ fontSize: 12, color: "#70706a" }}>SEO: {blog.metaTitle} | Great Flowers - {blog.metaDescription}</div>
                      </div>
                    )}
                    <iframe title={blog.title} sandbox="" srcDoc={`<style>body{font-family:sans-serif;max-width:720px;margin:16px auto;padding:0 12px;line-height:1.6}.blog-product-embed{border:1px dashed #999;padding:10px;margin:12px 0;color:#666}.blog-product-embed:before{content:'[Product card shown on the live site]'}</style>${blog.html}`} style={{ width: "100%", height: 520, border: "1px solid #e0e0d8", borderRadius: 10, background: "white" }} />
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
