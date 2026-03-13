"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

type AskActionHref = string | null;
type AskStatus = "idle" | "loading" | "done" | "error";

export type AskMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  tone?: string | null;
  verdict?: string | null;
  actionHref?: AskActionHref;
};

type AskState = {
  open: boolean;
  status: AskStatus;
  draft: string;
  messages: AskMessage[];
  errorMessage: string | null;
  currentPath: string;
  currentScope: string | null;
};

type SubmitOptions = {
  keepOpen?: boolean;
};

type AskContextValue = AskState & {
  setDraft: (value: string) => void;
  openAsk: () => void;
  closeAsk: () => void;
  toggleAsk: () => void;
  clearAsk: () => void;
  submitAsk: (question?: string, options?: SubmitOptions) => Promise<void>;
  retryLast: () => Promise<void>;
};

const AskContext = createContext<AskContextValue | null>(null);

function makeId() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {}
  return `ask_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function scopeFromPath(pathname: string): string | null {
  if (!pathname) return null;
  if (pathname.startsWith("/money")) return "money";
  if (pathname.startsWith("/accounts")) return "accounts";
  if (pathname.startsWith("/transactions")) return "transactions";
  if (pathname.startsWith("/connections")) return "connections";
  if (pathname.startsWith("/decisions")) return "decisions";
  if (pathname.startsWith("/thinking")) return "thinking";
  if (pathname.startsWith("/capture")) return "capture";
  if (pathname.startsWith("/bills")) return "bills";
  if (pathname.startsWith("/family")) return "family";
  if (pathname.startsWith("/household")) return "household";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/home") || pathname.startsWith("/lifecfo-home")) return "home";
  return null;
}

async function getSignedInUserId(): Promise<string | null> {
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

type RunQuestionOptions = {
  appendUserMessage?: boolean;
};

export function AskProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AskStatus>("idle");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lastQuestionRef = useRef<string>("");

  const currentPath = pathname || "";
  const currentScope = scopeFromPath(currentPath);

  const openAsk = useCallback(() => setOpen(true), []);
  const closeAsk = useCallback(() => setOpen(false), []);
  const toggleAsk = useCallback(() => setOpen((v) => !v), []);

  const clearAsk = useCallback(() => {
    setDraft("");
    setStatus("idle");
    setMessages([]);
    setErrorMessage(null);
    lastQuestionRef.current = "";
  }, []);

  const runQuestion = useCallback(
    async (rawQuestion?: string, options?: RunQuestionOptions) => {
      const question = (rawQuestion ?? draft).trim();
      if (!question) return;

      const appendUserMessage = options?.appendUserMessage !== false;

      const questionMessage: AskMessage = {
        id: makeId(),
        role: "user",
        content: question,
        createdAt: new Date().toISOString(),
      };

      setOpen(true);
      setStatus("loading");
      setErrorMessage(null);
      lastQuestionRef.current = question;

      if (appendUserMessage) {
        setMessages((prev) => [...prev, questionMessage]);
      }

      setDraft("");

      try {
        const userId = await getSignedInUserId();
        if (!userId) {
          setStatus("error");
          setErrorMessage("Sign in to ask Life CFO.");
          return;
        }

        const isMoneyScope = currentScope === "money";
        const endpoint = isMoneyScope ? "/api/money/ask" : "/api/home/ask";
        const payload = isMoneyScope
          ? { q: question }
          : { userId, question, path: currentPath, scope: currentScope };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          setStatus("error");
          setErrorMessage(
            typeof json?.error === "string"
              ? json.error
              : "I couldn’t answer that right now."
          );
          return;
        }

        const actionMap: Record<string, string | null> = {
          open_bills: "/bills",
          open_money: "/money",
          open_decisions: "/decisions?tab=active",
          open_review: "/revisit",
          open_chapters: "/chapters",
          none: null,
        };

        let content = typeof json?.answer === "string" ? json.answer : "";
        let tone: string | null = typeof json?.tone === "string" ? json.tone : null;
        let verdict: string | null = typeof json?.verdict === "string" ? json.verdict : null;

        if (isMoneyScope && json?.mode === "snapshot") {
          const headline = typeof json?.explanation?.headline === "string" ? json.explanation.headline : "Money snapshot";
          const summary = typeof json?.explanation?.summary === "string" ? json.explanation.summary : "";
          const insights = Array.isArray(json?.explanation?.insights)
            ? (json.explanation.insights as string[]).filter((s) => typeof s === "string" && s.trim())
            : [];
          const pressures = json?.explanation?.pressure || {};
          const pressureLines = [
            typeof pressures.structural === "string" ? `Structural: ${pressures.structural}` : null,
            typeof pressures.discretionary === "string" ? `Discretionary: ${pressures.discretionary}` : null,
            typeof pressures.timing === "string" ? `Timing: ${pressures.timing}` : null,
            typeof pressures.stability === "string" ? `Stability: ${pressures.stability}` : null,
          ].filter(Boolean);

          const lines = [
            headline,
            summary,
            insights.length ? `Insights:\n- ${insights.join("\n- ")}` : null,
            pressureLines.length ? `Pressure:\n- ${pressureLines.join("\n- ")}` : null,
          ]
            .filter(Boolean)
            .join("\n\n");

          content = lines;
          tone = tone || "overview";
          verdict = verdict || null;
        } else if (isMoneyScope && json?.mode === "diagnosis") {
          const diag = json?.diagnosis || {};
          const headline =
            typeof diag?.headline === "string" ? diag.headline : "Money pressure overview";
          const summary =
            typeof diag?.summary === "string" ? diag.summary : "Current signals are summarised below.";

          const drivers = Array.isArray(diag?.drivers)
            ? (diag.drivers as string[]).filter((d) => typeof d === "string" && d.trim())
            : [];

          const sig = diag?.signals || {};
          const signalLines = [
            typeof sig.structural === "string" ? `Structural: ${sig.structural}` : null,
            typeof sig.discretionary === "string" ? `Discretionary: ${sig.discretionary}` : null,
            typeof sig.timing === "string" ? `Timing: ${sig.timing}` : null,
            typeof sig.stability === "string" ? `Stability: ${sig.stability}` : null,
          ].filter(Boolean);

          const lines = [
            headline,
            summary,
            drivers.length ? `Drivers:\n- ${drivers.join("\n- ")}` : null,
            signalLines.length ? `Signals:\n- ${signalLines.join("\n- ")}` : null,
          ]
            .filter(Boolean)
            .join("\n\n");

          content = lines;
          tone = tone || "overview";
          verdict = verdict || null;
        } else if (isMoneyScope && json?.mode === "planning") {
          const planning = json?.planning || {};
          const headline =
            typeof planning?.headline === "string" ? planning.headline : "What is coming up";
          const summary =
            typeof planning?.summary === "string"
              ? planning.summary
              : "Here is the current planning view.";

          const upcoming = Array.isArray(planning?.upcoming)
            ? (planning.upcoming as string[]).filter((u) => typeof u === "string" && u.trim())
            : [];
          const notes = Array.isArray(planning?.notes)
            ? (planning.notes as string[]).filter((n) => typeof n === "string" && n.trim())
            : [];

          const lines = [
            headline,
            summary,
            upcoming.length ? `Coming up:\n- ${upcoming.join("\n- ")}` : null,
            notes.length ? `Notes:\n- ${notes.join("\n- ")}` : null,
          ]
            .filter(Boolean)
            .join("\n\n");

          content = lines;
          tone = tone || "overview";
        } else if (isMoneyScope && json?.mode === "affordability") {
          const affordability = json?.affordability || {};
          const headline =
            typeof affordability?.headline === "string"
              ? affordability.headline
              : "Affordability baseline";
          const summary =
            typeof affordability?.summary === "string"
              ? affordability.summary
              : "Here is the current affordability context.";
          const signals = Array.isArray(affordability?.signals)
            ? (affordability.signals as string[]).filter((s) => typeof s === "string" && s.trim())
            : [];
          const caveat =
            typeof affordability?.caveat === "string" && affordability.caveat.trim()
              ? affordability.caveat
              : null;

          const lines = [
            headline,
            summary,
            signals.length ? `Signals:\n- ${signals.join("\n- ")}` : null,
            caveat ? `Caveat:\n- ${caveat}` : null,
          ]
            .filter(Boolean)
            .join("\n\n");

          content = lines;
          tone = tone || "overview";
        } else if (isMoneyScope && json?.mode === "scenario") {
          const scenario = json?.scenario || {};
          const headline =
            typeof scenario?.headline === "string"
              ? scenario.headline
              : "Scenario baseline";
          const summary =
            typeof scenario?.summary === "string"
              ? scenario.summary
              : "Here is the current scenario baseline.";
          const watch = Array.isArray(scenario?.watch)
            ? (scenario.watch as string[]).filter((s) => typeof s === "string" && s.trim())
            : [];
          const caveat =
            typeof scenario?.caveat === "string" && scenario.caveat.trim()
              ? scenario.caveat
              : null;

          const lines = [
            headline,
            summary,
            watch.length ? `Watch:\n- ${watch.join("\n- ")}` : null,
            caveat ? `Caveat:\n- ${caveat}` : null,
          ]
            .filter(Boolean)
            .join("\n\n");

          content = lines;
          tone = tone || "overview";
        } else if (isMoneyScope && json?.mode === "search") {
          const accounts = Array.isArray(json?.results?.accounts) ? json.results.accounts.length : 0;
          const bills = Array.isArray(json?.results?.bills) ? json.results.bills.length : 0;
          const txs = Array.isArray(json?.results?.transactions) ? json.results.transactions.length : 0;
          content = `Search results:\n- Accounts: ${accounts}\n- Bills: ${bills}\n- Transactions: ${txs}`;
          tone = tone || "overview";
        }

        const assistantMessage: AskMessage = {
          id: makeId(),
          role: "assistant",
          content,
          createdAt: new Date().toISOString(),
          tone,
          verdict,
          actionHref: actionMap[String(json?.action ?? "none")] ?? null,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setStatus("done");
        setErrorMessage(null);
      } catch {
        setStatus("error");
        setErrorMessage("I couldn’t answer that right now.");
      }
    },
    [draft, currentPath, currentScope]
  );

  const submitAsk = useCallback(
    async (question?: string, _options?: SubmitOptions) => {
      await runQuestion(question, { appendUserMessage: true });
    },
    [runQuestion]
  );

  const retryLast = useCallback(async () => {
    const q = lastQuestionRef.current.trim();
    if (!q) return;
    await runQuestion(q, { appendUserMessage: false });
  }, [runQuestion]);

  const value = useMemo<AskContextValue>(
    () => ({
      open,
      status,
      draft,
      messages,
      errorMessage,
      currentPath,
      currentScope,
      setDraft,
      openAsk,
      closeAsk,
      toggleAsk,
      clearAsk,
      submitAsk,
      retryLast,
    }),
    [
      open,
      status,
      draft,
      messages,
      errorMessage,
      currentPath,
      currentScope,
      openAsk,
      closeAsk,
      toggleAsk,
      clearAsk,
      submitAsk,
      retryLast,
    ]
  );

  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}

export function useAsk() {
  const ctx = useContext(AskContext);
  if (!ctx) throw new Error("useAsk must be used inside AskProvider");
  return ctx;
}
