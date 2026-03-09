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

type AskActionHref = string | null;

type AskResult = {
  question: string;
  answer: string;
  actionHref: AskActionHref;
  tone?: string | null;
  verdict?: string | null;
};

type AskStatus = "idle" | "loading" | "done" | "error";

type AskState = {
  open: boolean;
  status: AskStatus;
  draft: string;
  result: AskResult | null;
  errorMessage: string | null;
};

type AskContextValue = AskState & {
  setDraft: (value: string) => void;
  openAsk: () => void;
  closeAsk: () => void;
  toggleAsk: () => void;
  clearAsk: () => void;
  submitAsk: (question?: string) => Promise<void>;
  retryLast: () => Promise<void>;
};

const AskContext = createContext<AskContextValue | null>(null);

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

export function AskProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AskStatus>("idle");
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lastQuestionRef = useRef<string>("");

  const openAsk = useCallback(() => setOpen(true), []);
  const closeAsk = useCallback(() => setOpen(false), []);
  const toggleAsk = useCallback(() => setOpen((v) => !v), []);

  const clearAsk = useCallback(() => {
    setDraft("");
    setStatus("idle");
    setResult(null);
    setErrorMessage(null);
    lastQuestionRef.current = "";
  }, []);

  const runQuestion = useCallback(
    async (rawQuestion?: string) => {
      const question = (rawQuestion ?? draft).trim();
      if (!question) return;

      setOpen(true);
      setStatus("loading");
      setErrorMessage(null);

      lastQuestionRef.current = question;

      try {
        const userId = await getSignedInUserId();
        if (!userId) {
          setStatus("error");
          setErrorMessage("Sign in to ask Life CFO.");
          return;
        }

        const res = await fetch("/api/home/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, question }),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          setStatus("error");
          setErrorMessage(typeof json?.error === "string" ? json.error : "I couldn’t answer that right now.");
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

        setResult({
          question,
          answer: typeof json?.answer === "string" ? json.answer : "",
          actionHref: actionMap[String(json?.action ?? "none")] ?? null,
          tone: typeof json?.tone === "string" ? json.tone : null,
          verdict: typeof json?.verdict === "string" ? json.verdict : null,
        });

        setStatus("done");
        setErrorMessage(null);
        setDraft("");
      } catch {
        setStatus("error");
        setErrorMessage("I couldn’t answer that right now.");
      }
    },
    [draft]
  );

  const submitAsk = useCallback(
    async (question?: string) => {
      await runQuestion(question);
    },
    [runQuestion]
  );

  const retryLast = useCallback(async () => {
    const q = lastQuestionRef.current.trim();
    if (!q) return;
    await runQuestion(q);
  }, [runQuestion]);

  const value = useMemo<AskContextValue>(
    () => ({
      open,
      status,
      draft,
      result,
      errorMessage,
      setDraft,
      openAsk,
      closeAsk,
      toggleAsk,
      clearAsk,
      submitAsk,
      retryLast,
    }),
    [open, status, draft, result, errorMessage, openAsk, closeAsk, toggleAsk, clearAsk, submitAsk, retryLast]
  );

  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}

export function useAsk() {
  const ctx = useContext(AskContext);
  if (!ctx) throw new Error("useAsk must be used inside AskProvider");
  return ctx;
}