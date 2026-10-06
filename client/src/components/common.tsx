import { useState } from "react";

export function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="card">
      <h3>{title}</h3>
      {children}
    </article>
  );
}

export function BulletList({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

export function CopyButton({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <button
      type="button"
      className="copy-button"
      onClick={handleCopy}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

export function EvidenceGroup({
  title,
  items,
}: {
  title: string;
  items?: string[];
}) {
  if (!items || items.length === 0) return null;

  return (
    <div className="ai-evidence-group">
      <h4>{title}</h4>
      <ul>
        {items.map((item, i) => (
          <li key={`${title}-${i}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function SourcesChecked({
  pages,
}: {
  pages: { title: string; url: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="ai-sources-checked">
      <button
        type="button"
        className="ai-sources-toggle"
        onClick={() => setOpen(!open)}
      >
        {open ? "▾" : "▸"} Sources Checked ({pages.length})
      </button>

      {open && (
        <div className="ai-sources-list">
          {pages.map((page) => (
            <div className="ai-source-item" key={page.url}>
              <span>{page.title}</span>
              <a
                href={page.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {page.url}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
