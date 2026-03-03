import { NextRequest, NextResponse } from "next/server";
import { searchSkills, formatSkillContext } from "@/lib/skills";

export const runtime = "nodejs";

// ── Planner + Builder Agent System Prompt ─────────────────────────
const SYSTEM_PROMPT = {
  role: "system",
  content: `You are codemax-v3, an expert autonomous coding agent by Eburon AI. You operate in two phases: PLAN then BUILD.

## PHASE 1 — PLANNER (always run first)
When the user gives a task, IMMEDIATELY output a structured plan as a numbered todo checklist:

📋 **Build Plan**
1. [task description]
2. [task description]
...
⚡ **Mode: FAST** (single-file static HTML) or 🏗️ **Mode: FULL** (multi-file production app)

Then proceed directly to PHASE 2 — do NOT wait for confirmation.

**Mode selection rules:**
- Use **FAST** when: user says "quick", "fast", "test", "simple", "demo", "prototype", "static", OR the request is a single page (landing page, login, dashboard, portfolio)
- Use **FULL** when: user says "full", "production", "complete app", "multi-page", OR the request needs routing, state management, API calls, or multiple views

## PHASE 2 — BUILDER

### Output format — CRITICAL
Every file MUST use this EXACT fence format:

\`\`\`language filepath
code here
\`\`\`

Example: \`\`\`html index.html

### ⚡ FAST MODE — Single Static HTML
Generate ONE complete index.html file with ALL CSS and JS embedded inline. Requirements:
- Use Bootstrap 5 CDN + Google Fonts (Inter or Lato) + Tailwind CDN
- PWA meta tags: viewport, theme-color, apple-mobile-web-app-capable
- Smooth loading animation / preloader on page load
- AOS (Animate On Scroll) for scroll animations: fade-up, fade-in, zoom-in
- Mobile-first responsive: works perfectly on 375px phone screens
- Touch-friendly: 44px+ tap targets, proper spacing
- Beautiful modern UI following these design patterns:
  * Gradient backgrounds (linear-gradient with 2-3 colors)
  * Glassmorphism cards (backdrop-blur, semi-transparent backgrounds, subtle borders)
  * Rounded corners (border-radius: 12-20px), soft shadows (box-shadow with opacity)
  * Smooth CSS transitions and hover effects on all interactive elements
  * Bottom tab navigation bar for mobile app feel (fixed bottom, 5 icon tabs)
  * Floating action button (FAB) for primary action
  * Card-based layouts with proper padding (16-24px) and gaps (12-16px)
  * Swiper/carousel for featured content with autoplay
  * Badge indicators, status dots, progress bars
  * Avatar circles for user profiles, icon circles for features
  * Pull-to-refresh style header, sticky top navigation
  * Skeleton loading placeholders (animated pulse backgrounds)
  * Dark mode support via CSS variables / prefers-color-scheme
- For e-commerce: product cards with image, price, rating stars, add-to-cart button, category chips
- For fintech: balance cards with gradient, transaction list, quick-action buttons grid
- For education: course cards with progress bar, lesson list, certificate badges
- For landing pages: hero section with gradient overlay + CTA, features grid with icons, pricing table, testimonials carousel, FAQ accordion, footer with social links
- Include 50+ lines of realistic sample data (products, users, transactions, courses etc.)
- Total output should be 800-2000 lines of clean, complete HTML
- The page must be fully functional with working JavaScript interactions (tabs, modals, filters, form validation, local storage)

### 🏗️ FULL MODE — Production React App
Generate a complete multi-file project:
- package.json (all deps), tsconfig.json, tailwind.config.js, postcss.config.js
- src/main.tsx, src/App.tsx, src/index.css (@tailwind directives)
- src/components/ — one file per component, fully implemented
- src/types/ — TypeScript interfaces
- src/lib/ or src/utils/ — helper functions
- TypeScript + React 18 + Tailwind CSS + Lucide React icons
- React Router for multi-page apps
- Zustand or useState for state management
- Same beautiful UI patterns as FAST mode
- Loading skeletons, error boundaries, empty states
- Form validation, localStorage persistence
- Every component fully implemented — no stubs, no TODOs, no "add more here"

## ABSOLUTE RULES
1. NEVER output placeholder code. Write every single line.
2. NEVER say "you can add more" or "extend this with". Just write it.
3. NEVER skip sections. If a landing page needs 6 sections, write all 6.
4. Include realistic sample data: names, descriptions, prices, images (use picsum.photos or ui-avatars.com).
5. Every interactive element must have working JavaScript/React logic.
6. Output the plan checklist FIRST, then immediately output all code files.
7. Follow the fence format strictly: \`\`\`language filepath

You are codemax-v3. Plan fast. Build complete. Ship production-ready.`,
};

// ── Detect mode from user message ─────────────────────────────────
function detectMode(text: string): "fast" | "full" | "auto" {
  const lower = text.toLowerCase();
  if (/\b(quick|fast|test|simple|demo|prototype|static|html only|single.?file)\b/.test(lower)) return "fast";
  if (/\b(full|production|complete app|multi.?page|multi.?file|react app|next\.?js)\b/.test(lower)) return "full";
  return "auto";
}

export async function POST(req: NextRequest) {
  const { messages, endpointUrl, stream, model } = await req.json();

  const ollamaBase = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/+$/, "");
  let targetUrl = endpointUrl || `${ollamaBase}/api/chat`;
  const isOpenCodeBridge = targetUrl === "/api/opencode/chat" || targetUrl.includes("/api/opencode/chat");

  // For OpenCode bridge: call OpenCode server directly to avoid Next.js self-fetch deadlock
  if (isOpenCodeBridge) {
    const ocBase = (process.env.OPENCODE_URL ?? "http://127.0.0.1:3333").replace(/\/+$/, "");
    const ocProvider = process.env.OPENCODE_PROVIDER ?? "ollama";
    const ocModel = process.env.OPENCODE_MODEL ?? "codemax-v3";
    try {
      // Create fresh session
      const sesRes = await fetch(`${ocBase}/session`, { method: "POST", signal: AbortSignal.timeout(5000) });
      if (!sesRes.ok) throw new Error(`OpenCode session create failed: ${sesRes.status}`);
      const sesData = await sesRes.json();
      const sessionId = sesData.id;

      // Extract last user message content
      const lastUserMsg = [...(messages ?? [])].reverse().find((m: { role: string }) => m.role === "user");
      const userText = lastUserMsg?.content ?? "";

      // Send prompt (synchronous — waits for full response)
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 180000);
      const promptRes = await fetch(`${ocBase}/session/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parts: [{ type: "text", text: userText }],
          model: { providerID: ocProvider, modelID: ocModel },
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (!promptRes.ok) {
        const errText = await promptRes.text().catch(() => "");
        return NextResponse.json({ error: `OpenCode: ${promptRes.status}`, detail: errText.slice(0, 500) }, { status: 502 });
      }

      const result = await promptRes.json();
      const parts = (result.parts ?? []) as Array<{ type: string; text?: string }>;
      const assistantText = parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n");

      if (stream) {
        const encoder = new TextEncoder();
        const readable = new ReadableStream({
          start(c) {
            c.enqueue(encoder.encode(JSON.stringify({ model: `opencode/${ocModel}`, message: { role: "assistant", content: assistantText }, done: false }) + "\n"));
            c.enqueue(encoder.encode(JSON.stringify({ model: `opencode/${ocModel}`, message: { role: "assistant", content: "" }, done: true }) + "\n"));
            c.close();
          },
        });
        return new Response(readable, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache", "Transfer-Encoding": "chunked" } });
      }
      return NextResponse.json({ model: `opencode/${ocModel}`, message: { role: "assistant", content: assistantText }, done: true });
    } catch {
      // OpenCode not reachable (e.g. on Vercel) — fall back to default Ollama endpoint
      targetUrl = `${ollamaBase}/api/chat`;
    }
  }

  // Resolve other relative bridge URLs to absolute for server-side fetch
  if (targetUrl.startsWith("/")) {
    const origin = req.nextUrl.origin || `http://localhost:${process.env.PORT || 3000}`;
    targetUrl = `${origin}${targetUrl}`;
  }

  // Prepend system prompt (preserve images field on user messages for Ollama vision)
  let enrichedMessages = messages?.[0]?.role === "system"
    ? messages
    : [SYSTEM_PROMPT, ...(messages ?? [])];

  // Strip data URL prefixes from image base64 for Ollama compatibility
  enrichedMessages = enrichedMessages.map((m: { role: string; content: string; images?: string[] }) => {
    if (m.images?.length) {
      return { ...m, images: m.images.map((img: string) => img.replace(/^data:image\/\w+;base64,/, "")) };
    }
    return m;
  });

  // Augment the latest user message with mode-aware format enforcement
  const lastIdx = enrichedMessages.length - 1;
  if (enrichedMessages[lastIdx]?.role === "user") {
    const original = enrichedMessages[lastIdx].content;
    const isCodeRequest = /\b(create|build|make|generate|write|implement|design|develop|code|landing|page|app|dashboard|portal|website)\b/i.test(original);
    if (isCodeRequest) {
      const mode = detectMode(original);
      const modeHint = mode === "fast"
        ? `\n\nMODE: ⚡ FAST — Generate a SINGLE index.html file with all CSS/JS embedded. Use Bootstrap 5 CDN + Tailwind CDN + Google Fonts. Include AOS animations, realistic sample data (50+ items), working JavaScript interactions, mobile bottom tab bar. Make it 800-2000 lines. Output plan checklist first, then the code.`
        : mode === "full"
        ? `\n\nMODE: 🏗️ FULL — Generate a complete multi-file React + TypeScript + Tailwind project. Include package.json, all config files, all components fully implemented. Output plan checklist first, then all code files.`
        : `\n\nFirst output a 📋 Build Plan with numbered tasks and pick ⚡ FAST (single HTML file) or 🏗️ FULL (multi-file React) mode. Then immediately generate ALL the code. Use exact fence format: \`\`\`language filepath for every file. No placeholders — write every line. Beautiful modern UI with gradients, glassmorphism, animations. Include realistic sample data.`;
      enrichedMessages = [
        ...enrichedMessages.slice(0, lastIdx),
        { role: "user", content: original + modeHint },
      ];
    }
  }

  // Inject skill context
  const lastUserMsg = [...(messages ?? [])].reverse().find((m: { role: string }) => m.role === "user");
  if (lastUserMsg?.content) {
    const skillResults = searchSkills(lastUserMsg.content, { maxResults: 3 });
    if (skillResults.length > 0) {
      const skillContext = formatSkillContext(skillResults);
      enrichedMessages = enrichedMessages.map((m: { role: string; content: string }) =>
        m.role === "system"
          ? { ...m, content: m.content + skillContext }
          : m
      );
    }
  }

  // Inject context memory (long-term facts + codebase knowledge)
  if (lastUserMsg?.content) {
    try {
      const { searchAllMemory, formatMemoryContext } = await import("@/lib/memory");
      const memResults = await searchAllMemory(lastUserMsg.content, { topK: 5, threshold: 0.35 });
      if (memResults.length > 0) {
        const memContext = formatMemoryContext(memResults);
        enrichedMessages = enrichedMessages.map((m: { role: string; content: string }) =>
          m.role === "system"
            ? { ...m, content: m.content + "\n\n" + memContext }
            : m
        );
      }
    } catch (e) {
      console.warn("[chat] Memory search failed (non-critical):", e instanceof Error ? e.message : e);
    }
  }

  // Build body with optimized generation parameters for code output
  const bodyObj: Record<string, unknown> = {
    messages: enrichedMessages,
    stream: stream ?? true,
    options: {
      temperature: 0.3,       // Low temp = precise, consistent code
      top_p: 0.85,
      top_k: 30,
      repeat_penalty: 1.02,   // Minimal — code has legitimate repetition
      num_predict: 16384,     // Allow long outputs for complete apps
      num_ctx: 32768,         // Reasonable context window
    },
  };
  if (model) bodyObj.model = model;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      const text = await upstream.text();
      return NextResponse.json(
        { error: `Upstream error: ${upstream.status}`, detail: text, ollamaUrl: targetUrl },
        { status: upstream.status }
      );
    }

    if (stream && upstream.body) {
      return new NextResponse(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const json = await upstream.json();
    return NextResponse.json(json);
  } catch (err) {
    // If the target failed, retry via localhost Ollama as fallback
    const localhostChat = "http://localhost:11434/api/chat";
    if (targetUrl !== localhostChat) {
      try {
        // Ensure model is set for fallback (Ollama requires it)
        const fallbackBody = { ...bodyObj };
        if (!fallbackBody.model) fallbackBody.model = "eburonmax/codemax-v3";
        const ctrl2 = new AbortController();
        const t2 = setTimeout(() => ctrl2.abort(), 120000);
        const fallback = await fetch(localhostChat, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fallbackBody),
          signal: ctrl2.signal,
        });
        clearTimeout(t2);
        if (fallback.ok && stream && fallback.body) {
          return new NextResponse(fallback.body, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "X-Accel-Buffering": "no",
            },
          });
        }
        if (fallback.ok) return NextResponse.json(await fallback.json());
      } catch { /* fallback also failed */ }
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message, hint: `Check if Ollama is reachable at ${targetUrl}` },
      { status: 502 }
    );
  }
}
