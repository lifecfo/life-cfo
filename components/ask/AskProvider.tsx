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
  deriveAskLanguageContext,
  paragraph,
  section,
  stableGroundLine,
} from "@/components/ask/moneyAskLanguage";
import type { PressureInterpretation } from "@/lib/money/reasoning/interpretPressure";
import type {
  AskCandidatePayload,
  AskCandidatePromotionResponse,
  AskErrorResponse,
  MemoryCandidate,
  PromotionActionType,
} from "@/lib/memory/contracts";

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
  candidates?: AskCandidatePayload;
  promotions?: Record<string, AskPromotionState>;
};

type AskPromotionStatus = "idle" | "saving" | "saved" | "error";

export type AskPromotionState = {
  status: AskPromotionStatus;
  error?: string;
  resultKind?: string;
  resultId?: string;
};

type AskState = {
  open: boolean;
  status: AskStatus;
  draft: string;
  messages: AskMessage[];
  errorMessage: string | null;
  currentPath: string;
  currentScope: string | null;
  shellSplitHostActive: boolean;
};

type SubmitOptions = {
  keepOpen?: boolean;
};

type AskContextValue = AskState & {
  recentMoneyAsks: string[];
  setDraft: (value: string) => void;
  setShellSplitHostActive: (active: boolean) => void;
  openAsk: () => void;
  closeAsk: () => void;
  toggleAsk: () => void;
  clearAsk: () => void;
  submitAsk: (question?: string, options?: SubmitOptions) => Promise<void>;
  retryLast: () => Promise<void>;
  promoteCandidate: (params: { messageId: string; candidate: MemoryCandidate }) => Promise<void>;
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
  if (pathname.startsWith("/chapters")) return "chapters";
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

function buildInterpretationLines(
  interpretation: PressureInterpretation | null | undefined
): {
  main: string[];
  next: string[];
  confidence: string[];
} {
  if (!interpretation) return { main: [], next: [], confidence: [] };

  const main = [
    interpretation.main_pressure.summary,
    interpretation.main_pressure.why_now,
    interpretation.secondary_pressure?.summary ?? null,
  ].filter((line): line is string => typeof line === "string" && line.trim().length > 0);

  const next = (interpretation.what_to_ask_next ?? [])
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    .slice(0, 3);

  const confidence =
    interpretation.confidence?.note && interpretation.confidence.note.trim()
      ? [interpretation.confidence.note]
      : [];

  return { main, next, confidence };
}

function promotionActionForCandidateType(
  candidateType: MemoryCandidate["candidate_type"]
): PromotionActionType | null {
  if (candidateType === "decision_candidate") return "create_decision";
  if (candidateType === "insight_candidate") return "save_insight";
  // Legacy action key kept for API compatibility; semantically this is "schedule decision check-in".
  if (candidateType === "revisit_candidate") return "add_revisit_trigger";
  return null;
}

export function AskProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AskStatus>("idle");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shellSplitHostActive, setShellSplitHostActive] = useState(false);
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
              : "I couldn't answer that right now."
          );
          return;
        }

        const actionMap: Record<string, string | null> = {
          open_money: "/money",
          open_decisions: "/decisions?tab=active",
          open_chapters: "/chapters",
          none: null,
        };

        let content = typeof json?.answer === "string" ? json.answer : "";
        let tone: string | null = typeof json?.tone === "string" ? json.tone : null;
        let verdict: string | null = typeof json?.verdict === "string" ? json.verdict : null;
        const interpretation =
          (json?.interpretation as PressureInterpretation | undefined) ||
          (json?.explanation?.interpretation as PressureInterpretation | undefined);
        const interpretationLines = buildInterpretationLines(interpretation);

        if (isMoneyScope && json?.mode === "snapshot") {
          const headline = typeof json?.explanation?.headline === "string" ? json.explanation.headline : "Money snapshot";
          const summary = typeof json?.explanation?.summary === "string" ? json.explanation.summary : "";
          const insights = Array.isArray(json?.explanation?.insights)
            ? (json.explanation.insights as string[]).filter((s) => typeof s === "string" && s.trim())
            : [];
          const hasEvidence = insights.length > 0;
          const languageContext = deriveAskLanguageContext({
            lines: [
              headline,
              summary,
              ...insights,
              ...interpretationLines.main,
              ...interpretationLines.confidence,
            ],
            hasEvidence,
          });

          const lines = composeMessage([
            headline,
            summary,
            section("What stands out right now:", insights),
            section("Main pressure right now:", interpretationLines.main),
            section("What to ask next:", interpretationLines.next),
            section("Confidence note:", interpretationLines.confidence),
            stableGroundLine({ mode: "snapshot", hasEvidence, context: languageContext }),
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

          const hasEvidence =
            drivers.length > 0 ||
            interpretationLines.next.length > 0 ||
            interpretationLines.confidence.length > 0;
          const languageContext = deriveAskLanguageContext({
            lines: [
              headline,
              summary,
              ...drivers,
              ...interpretationLines.next,
              ...interpretationLines.confidence,
            ],
            hasEvidence,
          });

          const lines = composeMessage([
            headline,
            summary,
            section("What seems to be driving this:", drivers),
            section("What to ask next:", interpretationLines.next),
            section("Confidence note:", interpretationLines.confidence),
            stableGroundLine({
              mode: "diagnosis",
              hasEvidence,
              context: languageContext,
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
          const hasEvidence =
            upcoming.length > 0 ||
            notes.length > 0 ||
            interpretationLines.next.length > 0;
          const languageContext = deriveAskLanguageContext({
            lines: [
              headline,
              summary,
              ...upcoming,
              ...notes,
              ...interpretationLines.next,
              ...interpretationLines.confidence,
            ],
            hasEvidence,
          });

          const lines = composeMessage([
            headline,
            summary,
            section("What is coming up:", upcoming),
            section("A helpful note:", notes),
            section("What to ask next:", interpretationLines.next),
            section("Confidence note:", interpretationLines.confidence),
            stableGroundLine({
              mode: "planning",
              hasEvidence,
              context: languageContext,
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
          const hasEvidence = signals.length > 0;
          const hasCaveat = !!caveat;
          const languageContext = deriveAskLanguageContext({
            lines: [
              headline,
              summary,
              ...signals,
              caveat,
              ...interpretationLines.next,
              ...interpretationLines.confidence,
            ],
            hasEvidence,
            hasCaveat,
          });

          const lines = composeMessage([
            headline,
            summary,
            section("What this is showing right now:", signals),
            section("What would make this clearer:", caveat ? [caveat] : []),
            section("What to ask next:", interpretationLines.next),
            section("Confidence note:", hasCaveat ? [] : interpretationLines.confidence),
            stableGroundLine({
              mode: "affordability",
              hasCaveat,
              hasEvidence,
              context: languageContext,
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
          const hasEvidence = watch.length > 0;
          const hasCaveat = !!caveat;
          const languageContext = deriveAskLanguageContext({
            lines: [
              headline,
              summary,
              ...watch,
              caveat,
              ...interpretationLines.next,
              ...interpretationLines.confidence,
            ],
            hasEvidence,
            hasCaveat,
          });

          const lines = composeMessage([
            headline,
            summary,
            section("If this changes, keep an eye on:", watch),
            section("What would make this clearer:", caveat ? [caveat] : []),
            section("What to ask next:", interpretationLines.next),
            section("Confidence note:", hasCaveat ? [] : interpretationLines.confidence),
            stableGroundLine({
              mode: "scenario",
              hasCaveat,
              hasEvidence,
              context: languageContext,
            }),
          ]);

          content = lines;
          tone = tone || "overview";
        } else if (isMoneyScope && json?.mode === "search") {
          const accounts = Array.isArray(json?.results?.accounts) ? json.results.accounts.length : 0;
          const bills = Array.isArray(json?.results?.bills) ? json.results.bills.length : 0;
          const txs = Array.isArray(json?.results?.transactions) ? json.results.transactions.length : 0;
          const hasEvidence = accounts + bills + txs > 0;
          const searchIntro = "Here is what I could find quickly in your money data.";
          const languageContext = deriveAskLanguageContext({
            lines: [searchIntro, `Accounts: ${accounts}`, `Bills: ${bills}`, `Transactions: ${txs}`],
            hasEvidence,
          });
          content = composeMessage([
            searchIntro,
            section("Matches:", [
              `Accounts: ${accounts}`,
              `Bills: ${bills}`,
              `Transactions: ${txs}`,
            ]),
            paragraph("If this is not what you meant, try naming a merchant, account, or bill."),
            stableGroundLine({
              mode: "search",
              hasEvidence,
              context: languageContext,
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
          candidates: (json?.candidates as AskCandidatePayload | undefined) ?? undefined,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setStatus("done");
        setErrorMessage(null);
      } catch {
        setStatus("error");
        setErrorMessage("I couldn't answer that right now.");
      }
    },
    [draft, currentPath, currentScope, rememberRecentMoneyAsk]
  );

  const submitAsk = useCallback(
    async (question?: string, _options?: SubmitOptions) => {
      void _options;
      await runQuestion(question, { appendUserMessage: true });
    },
    [runQuestion]
  );

  const retryLast = useCallback(async () => {
    const q = lastQuestionRef.current.trim();
    if (!q) return;
    await runQuestion(q, { appendUserMessage: false });
  }, [runQuestion]);

  const promoteCandidate = useCallback(
    async ({ messageId, candidate }: { messageId: string; candidate: MemoryCandidate }) => {
      const actionType = promotionActionForCandidateType(candidate.candidate_type);
      if (!actionType) return;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id !== messageId
            ? msg
            : {
                ...msg,
                promotions: {
                  ...(msg.promotions || {}),
                  [candidate.id]: { status: "saving" },
                },
              }
        )
      );

      try {
        const res = await fetch("/api/memory/promote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action_type: actionType,
            confirmed_by_user: true,
            candidate,
          }),
        });

        const json = (await res.json().catch(() => ({}))) as
          | AskCandidatePromotionResponse
          | AskErrorResponse;

        if (!res.ok || !("ok" in json) || json.ok !== true) {
          const err = "error" in json && typeof json.error === "string" ? json.error : "Could not save this yet.";
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id !== messageId
                ? msg
                : {
                    ...msg,
                    promotions: {
                      ...(msg.promotions || {}),
                      [candidate.id]: { status: "error", error: err },
                    },
                  }
            )
          );
          return;
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id !== messageId
              ? msg
              : {
                  ...msg,
                  promotions: {
                    ...(msg.promotions || {}),
                    [candidate.id]: {
                      status: "saved",
                      resultKind: json.result.kind,
                      resultId: json.result.id,
                    },
                  },
                }
          )
        );
      } catch {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id !== messageId
              ? msg
              : {
                  ...msg,
                  promotions: {
                    ...(msg.promotions || {}),
                    [candidate.id]: { status: "error", error: "Could not save this yet." },
                  },
                }
          )
        );
      }
    },
    []
  );

  const value = useMemo<AskContextValue>(
    () => ({
      open,
      status,
      draft,
      messages,
      errorMessage,
      currentPath,
      currentScope,
      shellSplitHostActive,
      recentMoneyAsks,
      setDraft,
      setShellSplitHostActive,
      openAsk,
      closeAsk,
      toggleAsk,
      clearAsk,
      submitAsk,
      retryLast,
      promoteCandidate,
    }),
    [
      open,
      status,
      draft,
      messages,
      errorMessage,
      currentPath,
      currentScope,
      shellSplitHostActive,
      recentMoneyAsks,
      openAsk,
      closeAsk,
      toggleAsk,
      setShellSplitHostActive,
      clearAsk,
      submitAsk,
      retryLast,
      promoteCandidate,
    ]
  );

  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}

export function useAsk() {
  const ctx = useContext(AskContext);
  if (!ctx) throw new Error("useAsk must be used inside AskProvider");
  return ctx;
}

