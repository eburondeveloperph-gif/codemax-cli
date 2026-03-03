"use client";

import { useEffect, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import "highlight.js/styles/github-dark.css";

/* ── Table of Contents extractor ─────────────────────────── */
interface TocEntry {
  id: string;
  text: string;
  level: number;
}

function extractToc(md: string): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^(#{1,3})\s+(.+)/);
    if (!m) continue;
    const text = m[2].replace(/[`*_~[\]]/g, "").trim();
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    entries.push({ id, text, level: m[1].length });
  }
  return entries;
}

/* ── Slug helper (matches rehype heading ids) ────────────── */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/* ── Custom components for ReactMarkdown ─────────────────── */
const mdComponents: Components = {
  h1: ({ children, ...props }) => {
    const text = String(children);
    const id = slugify(text);
    return (
      <h1
        id={id}
        className="text-3xl font-bold text-white mt-12 mb-4 pb-3 border-b border-gray-800 scroll-mt-20 first:mt-0"
        {...props}
      >
        {children}
      </h1>
    );
  },
  h2: ({ children, ...props }) => {
    const text = String(children);
    const id = slugify(text);
    return (
      <h2
        id={id}
        className="text-2xl font-semibold text-white mt-10 mb-3 pb-2 border-b border-gray-800/60 scroll-mt-20"
        {...props}
      >
        {children}
      </h2>
    );
  },
  h3: ({ children, ...props }) => {
    const text = String(children);
    const id = slugify(text);
    return (
      <h3
        id={id}
        className="text-xl font-semibold text-gray-200 mt-8 mb-2 scroll-mt-20"
        {...props}
      >
        {children}
      </h3>
    );
  },
  h4: ({ children, ...props }) => (
    <h4 className="text-lg font-medium text-gray-300 mt-6 mb-2" {...props}>
      {children}
    </h4>
  ),
  p: ({ children, ...props }) => (
    <p className="text-gray-400 leading-7 mb-4" {...props}>
      {children}
    </p>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    >
      {children}
    </a>
  ),
  strong: ({ children, ...props }) => (
    <strong className="text-gray-200 font-semibold" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="text-gray-400 italic" {...props}>
      {children}
    </em>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-4 border-indigo-500/50 pl-4 py-1 my-4 bg-indigo-500/5 rounded-r-lg text-gray-400 italic"
      {...props}
    >
      {children}
    </blockquote>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc list-outside ml-6 mb-4 space-y-1 text-gray-400" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal list-outside ml-6 mb-4 space-y-1 text-gray-400" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-7" {...props}>
      {children}
    </li>
  ),
  hr: () => <hr className="border-gray-800 my-8" />,
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-4 rounded-lg border border-gray-800">
      <table className="w-full text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-gray-900/80 text-gray-300 text-left" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th className="px-4 py-2.5 font-semibold border-b border-gray-800 whitespace-nowrap" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-4 py-2 border-b border-gray-800/50 text-gray-400" {...props}>
      {children}
    </td>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = className?.includes("language-") || className?.includes("hljs");
    if (isBlock) {
      return (
        <code className={`${className ?? ""} !p-0 text-sm`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="bg-gray-800/80 text-indigo-300 px-1.5 py-0.5 rounded text-[0.85em] font-mono"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre
      className="!bg-[#0d1117] border border-gray-800 rounded-lg p-4 my-4 overflow-x-auto text-sm leading-6 [&>code]:!p-0 [&>code]:!bg-transparent"
      {...props}
    >
      {children}
    </pre>
  ),
};

/* ── Page Component ──────────────────────────────────────── */
export default function OverviewPage() {
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState("");

  // Override global overflow:hidden so this page can scroll
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = "auto";
    html.style.height = "auto";
    body.style.overflow = "auto";
    body.style.height = "auto";
    return () => {
      html.style.overflow = "";
      html.style.height = "";
      body.style.overflow = "";
      body.style.height = "";
    };
  }, []);

  // Fetch development.md at build/runtime
  useEffect(() => {
    fetch("/api/overview")
      .then((r) => r.text())
      .then((md) => {
        setMarkdown(md);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toc = useMemo(() => extractToc(markdown), [markdown]);

  // Intersection observer for active TOC tracking
  useEffect(() => {
    if (!toc.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );
    for (const t of toc) {
      const el = document.getElementById(t.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [toc]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading documentation…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-50 bg-gray-950/80 backdrop-blur-xl border-b border-gray-800/60">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
              </svg>
            </div>
            <span className="text-white font-semibold tracking-tight">Eburon Codemax</span>
            <span className="text-gray-600 mx-1">/</span>
            <span className="text-gray-400 text-sm">Developer Guide</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/eburondeveloperph-gif/codemax-cli"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </a>
            <a
              href="/"
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-md transition-colors"
            >
              ← Back to App
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">
        {/* ── Sidebar TOC ── */}
        <aside className="hidden lg:block w-64 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto border-r border-gray-800/40 py-6 px-4">
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-3 px-2">
            On this page
          </p>
          <nav className="space-y-0.5">
            {toc.map((entry) => (
              <a
                key={entry.id}
                href={`#${entry.id}`}
                className={`block text-[13px] leading-6 rounded-md px-2 py-0.5 transition-colors truncate ${
                  entry.level === 1
                    ? "font-semibold"
                    : entry.level === 2
                    ? "pl-4"
                    : "pl-7 text-[12px]"
                } ${
                  activeId === entry.id
                    ? "text-indigo-400 bg-indigo-500/10"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {entry.text}
              </a>
            ))}
          </nav>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 min-w-0 px-6 lg:px-12 py-10">
          <article className="max-w-3xl mx-auto">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={mdComponents}
            >
              {markdown}
            </ReactMarkdown>
          </article>

          {/* Footer */}
          <footer className="max-w-3xl mx-auto mt-16 pt-6 border-t border-gray-800/60 text-center text-gray-600 text-xs pb-12">
            Eburon Codemax — Developer Documentation
            <br />
            © {new Date().getFullYear()} Eburon Technologies / Jo Lernout
          </footer>
        </main>
      </div>
    </div>
  );
}
