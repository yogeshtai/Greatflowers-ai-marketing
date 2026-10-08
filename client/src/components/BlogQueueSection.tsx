import { useCallback, useEffect, useState } from "react";
import { approveBlog, editBlog, generateBlog, getBlogs, publishBlogNow, rejectBlog, type BlogDraft } from "../api/blogs";

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");

export function BlogQueueSection() {
  const [blogs, setBlogs] = useState<BlogDraft[]>([]);
  const [liveMode, setLiveMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBlogs();
      setBlogs(data.blogs);
      setLiveMode(data.liveMode);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load blogs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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

  const awaiting = blogs.filter((b) => b.status === "draft" || b.status === "failed").length;

  return (
    <section className="history-section">
      <div className="history-header">
        <div>
          <span className="step">Daily Blog</span>
          <h2>Blog Queue{awaiting > 0 ? ` (${awaiting} waiting for approval)` : ""}</h2>
          <p style={{ margin: "6px 0 0", color: "#70706a", fontSize: 13 }}>
            A draft is written daily at 7:00 PM IST. Approved posts go live at 10:00 AM ET.{" "}
            {liveMode ? "Live mode: posts are published." : "Safe mode: posts are created hidden (not visible to readers)."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="secondary-button" onClick={load} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button>
          <button className="primary-action-button" disabled={generating} onClick={async () => {
            setGenerating(true);
            await run(null, generateBlog);
            setGenerating(false);
          }}>{generating ? "Writing draft (a few minutes)..." : "Generate draft now"}</button>
        </div>
      </div>

      {error && <p role="alert" className="creative-error-note">{error}</p>}

      {blogs.length === 0 ? (
        <div className="empty-state"><h3>No blog drafts yet</h3><p>The first draft appears after the next 7:00 PM IST run, or generate one now.</p></div>
      ) : (
        <div className="campaign-list">
          {blogs.map((blog) => {
            const editable = blog.status === "draft" || blog.status === "failed";
            const open = openId === blog.id;
            const title = editing[blog.id] ?? blog.title;
            return (
              <article className="campaign-item" key={blog.id} style={{ display: "block" }}>
                <div className="campaign-meta">
                  <span className={`status status-${blog.status}`}>{blog.status}</span>
                  <span>{when(blog.createdAt)}</span>
                  <span>categories: {[blog.categorySlug, blog.secondCategorySlug].filter(Boolean).join(" + ")}</span>
                  <span>{blog.environment}</span>
                </div>
                <h3 style={{ marginBottom: 6 }}>{blog.title}</h3>
                <p style={{ margin: "0 0 8px" }}>{blog.summary}</p>
                {blog.status === "approved" && <div className="schedule-info">Goes live: {when(blog.publishAfter)}{blog.error ? ` (last error: ${blog.error})` : ""}</div>}
                {blog.status === "published" && <div className="schedule-info">Published {when(blog.publishedAt)} ({blog.remoteStatus === 1 ? "visible" : "hidden"}){blog.url && <> - <a href={blog.url} target="_blank" rel="noreferrer">view</a></>}</div>}
                {(blog.status === "failed") && <div className="schedule-error">Failed after {blog.attempts} attempts: {blog.error}</div>}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                  <button className="secondary-button" onClick={() => setOpenId(open ? null : blog.id)}>{open ? "Hide preview" : "Preview / edit"}</button>
                  {editable && <button className="primary-action-button" disabled={busyId === blog.id} onClick={() => run(blog.id, () => approveBlog(blog.id))}>Approve</button>}
                  {(editable || blog.status === "approved") && <button className="secondary-button" disabled={busyId === blog.id} onClick={() => window.confirm("Publish this post right now?") && run(blog.id, () => publishBlogNow(blog.id))}>Publish now</button>}
                  {blog.status !== "published" && blog.status !== "rejected" && <button className="secondary-button" disabled={busyId === blog.id} onClick={() => window.confirm("Reject this draft?") && run(blog.id, () => rejectBlog(blog.id))}>Reject</button>}
                </div>

                {open && (
                  <div style={{ marginTop: 16 }}>
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
