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
import {
  composeMessage,
  paragraph,
  section,
  stableGroundLine,
} from "@/components/ask/moneyAskLanguage";

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
  recentMoneyAsks: string[];
  setDraft: (value: string) => void;
  openAsk: () => void;
  closeAsk: () => void;
  toggleAsk: () => void;
  clearAsk: () => void;
  submitAsk: (question?: string, options?: SubmitOptions) => Promise<void>;
  retryLast: () => Promise<void>;
};

const AskContext = createContext<AskContextValue | null>(null);
const RECENT_MONEY_ASKS_KEY = "lifecfo:money-recent-asks";
const RECENT_MONEY_ASKS_MAX = 3;

function readRecentMoneyAsksFromStorage() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const raw = window.localStorage.getItem(RECENT_MONEY_ASKS_KEY);
    if (!raw) return [] as string[];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [] as string[];
    return parsed
      .filter((v) => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, RECENT_MONEY_ASKS_MAX);
  } catch {
    return [] as string[];
  }
}

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
  const [recentMoneyAsks, setRecentMoneyAsks] = useState<string[]>(() =>
    readRecentMoneyAsksFromStorage()
  );

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

  const rememberRecentMoneyAsk = useCallback((question: string) => {
    const q = question.trim();
    if (!q) return;

    setRecentMoneyAsks((prev) => {
      const deduped = [q, ...prev.filter((item) => item.toLowerCase() !== q.toLowerCase())].slice(
        0,
        RECENT_MONEY_ASKS_MAX
      );
      try {
        window.localStorage.setItem(RECENT_MONEY_ASKS_KEY, JSON.stringify(deduped));
      } catch {
        // ignore
      }
      return deduped;
    });
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
        if (isMoneyScope) {
          rememberRecentMoneyAsk(question);
        }
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

          const lines = composeMessage([
            headline,
            summary,
            section("What stands out right now:", insights),
            section("Where it may feel heavy:", pressureLines),
            stableGroundLine({ mode: "snapshot", hasEvidence: insights.length > 0 }),
          ]);

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

          const lines = composeMessage([
            headline,
            summary,
            section("What seems to be driving this:", drivers),
            section("What that pressure looks like right now:", signalLines),
            stableGroundLine({
              mode: "diagnosis",
              hasEvidence: drivers.length > 0 || signalLines.length > 0,
            }),
          ]);

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

          const lines = composeMessage([
            headline,
            summary,
            section("What is coming up:", upcoming),
            section("A helpful note:", notes),
            stableGroundLine({
              mode: "planning",
              hasEvidence: upcoming.length > 0 || notes.length > 0,
            }),
          ]);

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

          const lines = composeMessage([
            headline,
            summary,
            section("What this is showing right now:", signals),
            section("What would make this clearer:", caveat ? [caveat] : []),
            stableGroundLine({
              mode: "affordability",
              hasCaveat: !!caveat,
              hasEvidence: signals.length > 0,
            }),
          ]);

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

          const lines = composeMessage([
            headline,
            summary,
            section("If this changes, keep an eye on:", watch),
            section("What would make this clearer:", caveat ? [caveat] : []),
            stableGroundLine({
              mode: "scenario",
              hasCaveat: !!caveat,
              hasEvidence: watch.length > 0,
            }),
          ]);

          content = lines;
          tone = tone || "overview";
        } else if (isMoneyScope && json?.mode === "search") {
          const accounts = Array.isArray(json?.results?.accounts) ? json.results.accounts.length : 0;
          const bills = Array.isArray(json?.results?.bills) ? json.results.bills.length : 0;
          const txs = Array.isArray(json?.results?.transactions) ? json.results.transactions.length : 0;
          content = composeMessage([
            "Here is what I could find quickly in your money data.",
            section("Matches:", [
              `Accounts: ${accounts}`,
              `Bills: ${bills}`,
              `Transactions: ${txs}`,
            ]),
            paragraph("If this is not what you meant, try naming a merchant, account, or bill."),
            stableGroundLine({
              mode: "search",
              hasEvidence: accounts + bills + txs > 0,
            }),
          ]);
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
    [draft, currentPath, currentScope, rememberRecentMoneyAsk]
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
      recentMoneyAsks,
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
      recentMoneyAsks,
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
