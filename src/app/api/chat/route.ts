import { NextRequest, NextResponse } from "next/server";
import { searchSkills, formatSkillContext } from "@/lib/skills";

export const runtime = "nodejs";

// ── System prompt — concise, format-strict, code-focused ──────────
const SYSTEM_PROMPT = {
  role: "system",
  content: `You are codemax-v3, an expert full-stack coding agent by Eburon AI.

RULES:
1. Output ONLY code. No explanations before or after unless the user asks a question.
2. Every file MUST use this EXACT fence format — language then space then filepath:

\`\`\`tsx src/App.tsx
// full code here
\`\`\`

3. Generate ALL files needed for a complete, runnable app. Never use placeholder comments like "// TODO", "// add more here", or "...". Write every line.
4. Use TypeScript + React + Tailwind CSS by default.
5. Use Lucide React for icons: import { IconName } from "lucide-react"
6. Make it beautiful: gradients, shadows, rounded corners, hover effects, transitions, proper spacing.
7. Mobile-first responsive design. Every page must look good on phone, tablet, and desktop.
8. Always include: package.json, tsconfig.json, tailwind.config.js, src/index.css (with @tailwind directives), src/main.tsx, src/App.tsx
9. For landing pages: hero with gradient + CTA, features grid with icons, pricing cards, testimonials, FAQ, footer. Use intersection observer fade-in animations.
10. For apps: proper routing, state management, loading skeletons, error states, localStorage persistence.
11. When generating HTML-only: produce a single index.html with embedded CSS and JS that is fully functional.
12. Write production-quality code. Handle edge cases, validate inputs, use proper TypeScript types.

You MUST follow the fence format in rule 2. This is critical — the editor parses it to display files.`,
};

export async function POST(req: NextRequest) {
  const { messages, endpointUrl, stream, model } = await req.json();

  const ollamaBase = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/+$/, "");
  const targetUrl = endpointUrl || `${ollamaBase}/api/chat`;

  // Prepend system prompt
  let enrichedMessages = messages?.[0]?.role === "system"
    ? messages
    : [SYSTEM_PROMPT, ...(messages ?? [])];

  // Augment the latest user message with format enforcement
  const lastIdx = enrichedMessages.length - 1;
  if (enrichedMessages[lastIdx]?.role === "user") {
    const original = enrichedMessages[lastIdx].content;
    const isCodeRequest = /\b(create|build|make|generate|write|implement|design|develop|code)\b/i.test(original);
    if (isCodeRequest) {
      enrichedMessages = [
        ...enrichedMessages.slice(0, lastIdx),
        {
          role: "user",
          content: `${original}\n\nIMPORTANT: Output complete, production-ready code. Use the exact fence format: \`\`\`language filepath\n(code)\n\`\`\` for every file. Include ALL files (package.json, config files, components, styles). No placeholders, no TODOs — write every line of code. Make the UI beautiful with Tailwind CSS.`,
        },
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
    // If the target wasn't localhost, retry via localhost as fallback
    const localhostChat = `${(process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/+$/, "")}/api/chat`;
    if (targetUrl !== localhostChat) {
      try {
        const ctrl2 = new AbortController();
        const t2 = setTimeout(() => ctrl2.abort(), 30000);
        const fallback = await fetch(localhostChat, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyObj),
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
