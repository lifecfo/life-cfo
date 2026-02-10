"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button, useToast } from "@/components/ui";
import { maybeCrisisIntercept } from "@/lib/safety/guard";

/* ---------------- types (MATCH YOUR accounts TABLE) ---------------- */

type AccountRow = {
  id: string;
  name: string;
  provider: string | null;
  type: string | null; // transaction | savings | credit | loan | investment | etc
  status: string | null;
  archived: boolean;
  current_balance_cents: string | number; // bigint comes back as string sometimes
  currency: string;
  created_at: string | null;
  updated_at: string | null;
};

type AskState =
  | { status: "idle" }
  | { status: "loading"; question: string }
  | { status: "done"; question: string; answer: string }
  | { status: "error"; question: string; message: string };

type Tab = "overview" | "import" | "manual";

/* ---------------- helpers ---------------- */

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function safeBool(v: unknown) {
  return typeof v === "boolean" ? v : false;
}

function centsToNumber(cents: unknown): number | null {
  if (typeof cents === "number" && Number.isFinite(cents)) return cents / 100;
  if (typeof cents === "string") {
    const trimmed = cents.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return n / 100;
  }
  return null;
}

function prettyWhen(iso?: string | null) {
  const s = safeStr(iso);
  const ms = Date.parse(s);
  if (!s || Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtMoney(amount: number | null, ccy: string | null) {
  if (amount === null || amount === undefined) return "—";
  const currency = (ccy || "AUD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function acctTypeLabel(t: string | null) {
  const s = (t || "").toLowerCase();
  if (!s) return "Account";
  if (/(trans|everyday|checking|transaction)/i.test(s)) return "Everyday";
  if (/(save|savings)/i.test(s)) return "Savings";
  if (/(credit|cc)/i.test(s)) return "Credit";
  if (/(loan|mortgage)/i.test(s)) return "Loan";
  if (/(invest|broker)/i.test(s)) return "Investment";
  return t || "Account";
}

function typePillClass(_t: string | null) {
  return "bg-zinc-50 text-zinc-700 border border-zinc-200";
}

function parseMoneyToCents(input: string): bigint | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[$,]/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return BigInt(Math.round(n * 100));
}

/* ---------------- page ---------------- */

export default function AccountsPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("overview");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [ask, setAsk] = useState<AskState>({ status: "idle" });
  const [askText, setAskText] = useState("");
  const askInputRef = useRef<HTMLTextAreaElement | null>(null);
  const answerRef = useRef<HTMLDivElement | null>(null);

  // Manual add
  const [mName, setMName] = useState("");
  const [mProvider, setMProvider] = useState("");
  const [mType, setMType] = useState("transaction");
  const [mBalance, setMBalance] = useState<string>("");
  const [mCurrency, setMCurrency] = useState("AUD");
  const [manualSaving, setManualSaving] = useState(false);

  // CSV import
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);

  /* ---------------- auth ---------------- */

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setUserId(data?.user?.id ?? null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ---------------- load accounts ---------------- */

  async function loadAccounts(u: string) {
    setLoading(true);
    setLoadErr(null);

    const { data, error } = await supabase
      .from("accounts")
      .select("id,name,provider,type,status,archived,current_balance_cents,currency,created_at,updated_at")
      .eq("user_id", u)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      setLoadErr("I couldn’t load your accounts.");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(((data as any) || []) as AccountRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!userId) return;
    void loadAccounts(userId);
  }, [userId]);

  const activeAccounts = useMemo(() => rows.filter((r) => !safeBool(r.archived)), [rows]);

  const totals = useMemo(() => {
    const ccy = (activeAccounts[0]?.currency || "AUD").toUpperCase();
    const allSame = activeAccounts.every((a) => (a.currency || "AUD").toUpperCase() === ccy);
    if (!allSame) return { ok: false as const, currency: null as string | null, sum: null as number | null };

    let sum = 0;
    let any = false;
    for (const a of activeAccounts) {
      const v = centsToNumber(a.current_balance_cents);
      if (v !== null) {
        sum += v;
        any = true;
      }
    }
    return { ok: true as const, currency: ccy, sum: any ? sum : null };
  }, [activeAccounts]);

  /* ---------------- scoped ask ---------------- */

  async function submitAsk() {
    const q = askText.trim();
    if (!q || !userId) return;

    setAskText("");
    setAsk({ status: "loading", question: q });

    const intercept = maybeCrisisIntercept(q);
    if (intercept) {
      setAsk({ status: "done", question: q, answer: intercept.content });
      return;
    }

    try {
      const res = await fetch("/api/home/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          question: q,
          scope: "accounts",
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAsk({ status: "error", question: q, message: "I couldn’t answer that right now." });
        return;
      }

      setAsk({
        status: "done",
        question: q,
        answer: typeof (json as any)?.answer === "string" ? (json as any).answer : "",
      });

      window.setTimeout(() => {
        answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 40);
    } catch {
      setAsk({ status: "error", question: q, message: "I couldn’t answer that right now." });
    }
  }

  /* ---------------- manual add ---------------- */

  async function saveManual() {
    if (!userId) return;

    const name = mName.trim();
    if (!name) {
      toast({ title: "Name needed", description: "Give this account a name (e.g., Everyday)." });
      return;
    }

    const cents = mBalance.trim() ? parseMoneyToCents(mBalance) : null;
    if (mBalance.trim() && cents === null) {
      toast({ title: "Balance looks off", description: "Use a number like 1200 or -350." });
      return;
    }

    setManualSaving(true);

    try {
      const { error } = await supabase.from("accounts").insert({
        user_id: userId,
        name,
        provider: mProvider.trim() || null,
        type: mType || null,
        status: "active",
        archived: false,
        currency: (mCurrency || "AUD").toUpperCase(),
        current_balance_cents: (cents ?? 0n).toString(), // bigint
      });

      if (error) {
        toast({ title: "Couldn’t save", description: error.message });
        return;
      }

      toast({ title: "Saved", description: "Account added." });
      setMName("");
      setMProvider("");
      setMType("transaction");
      setMBalance("");
      setMCurrency("AUD");
      await loadAccounts(userId);
      setTab("overview");
    } finally {
      setManualSaving(false);
    }
  }

  /* ---------------- CSV upload ---------------- */

  async function uploadCsv() {
    if (!userId) return;
    if (!csvFile) {
      toast({ title: "Choose a file", description: "Select a CSV first." });
      return;
    }

    setCsvUploading(true);
    try {
      const form = new FormData();
      form.append("file", csvFile);
      form.append("userId", userId);

      const res = await fetch("/api/accounts/import-csv", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast({ title: "Import failed", description: (json as any)?.error || (json as any)?.message || "Couldn’t import that file." });
        return;
      }

      const inserted = Number((json as any)?.inserted ?? 0);
      const skipped = Number((json as any)?.skipped ?? 0);

      toast({
        title: "Imported",
        description: inserted > 0 ? `Added ${inserted} account${inserted === 1 ? "" : "s"}${skipped ? ` • Skipped ${skipped}` : ""}` : "No rows imported.",
      });

      setCsvFile(null);
      await loadAccounts(userId);
      setTab("overview");
    } catch {
      toast({ title: "Import failed", description: "Couldn’t import that file." });
    } finally {
      setCsvUploading(false);
    }
  }

  return (
    <Page title="Accounts" subtitle="Keep the structure simple. Life CFO can do the thinking.">
      <div className="mx-auto max-w-[760px] space-y-6">
        {/* Top actions + tabs */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-zinc-900">Your accounts</div>
                <div className="text-xs text-zinc-500">Link, import, or add manually. No pressure.</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Chip className="text-xs" onClick={() => router.push("/money")}>
                  Back to Money
                </Chip>
                <Button onClick={() => setTab("manual")} className="rounded-2xl">
                  Add account
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Chip className="text-xs" onClick={() => setTab("overview")}>
                Overview
              </Chip>
              <Chip className="text-xs" onClick={() => setTab("import")}>
                Import CSV
              </Chip>
              <Chip className="text-xs" onClick={() => setTab("manual")}>
                Manual entry
              </Chip>
            </div>

            {tab === "overview" ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <div className="text-xs font-medium text-zinc-700">Quick view</div>
                  <div className="mt-1 text-sm text-zinc-800">
                    {activeAccounts.length === 0
                      ? "No accounts yet."
                      : totals.ok
                      ? `Accounts: ${activeAccounts.length}${totals.sum !== null ? ` • Total: ${fmtMoney(totals.sum, totals.currency)}` : ""}`
                      : `Accounts: ${activeAccounts.length} • Total: — (multiple currencies)`}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Chip className="text-xs" onClick={() => userId && loadAccounts(userId)} disabled={loading}>
                      Refresh
                    </Chip>
                    <Chip className="text-xs" onClick={() => setTab("import")}>
                      Import CSV
                    </Chip>
                  </div>
                </div>

                {loading ? (
                  <div className="text-sm text-zinc-600">Loading…</div>
                ) : loadErr ? (
                  <div className="space-y-2">
                    <div className="text-sm text-zinc-700">{loadErr}</div>
                    <div className="flex flex-wrap gap-2">
                      <Chip className="text-xs" onClick={() => userId && loadAccounts(userId)}>
                        Try again
                      </Chip>
                    </div>
                  </div>
                ) : activeAccounts.length === 0 ? (
                  <div className="space-y-2">
                    <div className="text-sm text-zinc-700">No accounts yet.</div>
                    <div className="text-xs text-zinc-500">You can add “Everyday” + “Savings” now, and link/import later.</div>
                    <div className="pt-2 flex flex-wrap gap-2">
                      <Chip
                        className="text-xs"
                        onClick={() => {
                          setTab("manual");
                          setMName("Everyday");
                          setMType("transaction");
                        }}
                      >
                        Add “Everyday”
                      </Chip>
                      <Chip
                        className="text-xs"
                        onClick={() => {
                          setTab("manual");
                          setMName("Savings");
                          setMType("savings");
                        }}
                      >
                        Add “Savings”
                      </Chip>
                      <Chip className="text-xs" onClick={() => setTab("import")}>
                        Import CSV
                      </Chip>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeAccounts.slice(0, 10).map((a) => {
                      const bal = centsToNumber(a.current_balance_cents);
                      return (
                        <div key={a.id} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-[15px] font-medium text-zinc-900">{(a.name || "").trim() || "Untitled account"}</div>
                              <div className="mt-1 text-xs text-zinc-500">
                                {(a.provider || "").trim() ? a.provider : "—"}
                                {a.updated_at ? <span className="text-zinc-400"> • Updated {prettyWhen(a.updated_at)}</span> : null}
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-col items-end gap-2">
                              <div className={"rounded-full px-3 py-1 text-xs font-medium " + typePillClass(a.type)}>{acctTypeLabel(a.type)}</div>
                              <div className="text-sm font-medium text-zinc-900">{fmtMoney(bal, a.currency)}</div>
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <Chip className="text-xs" onClick={() => router.push(`/accounts/${a.id}`)} title="Open">
                              Open
                            </Chip>
                            <Chip
                              className="text-xs"
                              onClick={() => toast({ title: "Next", description: "Account linking rules are the next step." })}
                              title="Link"
                            >
                              Link
                            </Chip>
                          </div>
                        </div>
                      );
                    })}

                    {activeAccounts.length > 10 ? (
                      <div className="pt-2">
                        <Chip className="text-xs" onClick={() => toast({ title: "Next", description: "We’ll add search + paging next." })}>
                          See all (soon)
                        </Chip>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {tab === "import" ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <div className="text-xs font-medium text-zinc-700">Import CSV</div>
                  <div className="mt-1 text-xs text-zinc-500">Use bank exports or aggregator exports. We’ll map formats server-side.</div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                  <div className="text-xs text-zinc-600">Choose a CSV file</div>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="mt-2 block w-full text-sm text-zinc-700"
                    onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => void uploadCsv()} disabled={!csvFile || csvUploading} className="rounded-2xl">
                      {csvUploading ? "Importing…" : "Import"}
                    </Button>
                    <Chip className="text-xs" onClick={() => setCsvFile(null)} disabled={!csvFile || csvUploading}>
                      Clear
                    </Chip>
                    <Chip className="text-xs" onClick={() => setTab("overview")} disabled={csvUploading}>
                      Back
                    </Chip>
                  </div>

                  <div className="mt-3 text-xs text-zinc-500">Tip: include columns like name, provider, type, balance/current_balance.</div>
                </div>
              </div>
            ) : null}

            {tab === "manual" ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <div className="text-xs font-medium text-zinc-700">Manual entry</div>
                  <div className="mt-1 text-xs text-zinc-500">Start simple. You can refine later.</div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                  <div className="grid grid-cols-1 gap-3">
                    <label className="space-y-1">
                      <div className="text-xs text-zinc-600">Account name</div>
                      <input
                        value={mName}
                        onChange={(e) => setMName(e.target.value)}
                        placeholder="Everyday"
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                      />
                    </label>

                    <label className="space-y-1">
                      <div className="text-xs text-zinc-600">Provider (optional)</div>
                      <input
                        value={mProvider}
                        onChange={(e) => setMProvider(e.target.value)}
                        placeholder="ING / CBA / NAB…"
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                      />
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <div className="text-xs text-zinc-600">Type</div>
                        <select
                          value={mType}
                          onChange={(e) => setMType(e.target.value)}
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                        >
                          <option value="transaction">Everyday</option>
                          <option value="savings">Savings</option>
                          <option value="credit">Credit</option>
                          <option value="loan">Loan</option>
                          <option value="investment">Investment</option>
                        </select>
                      </label>

                      <label className="space-y-1">
                        <div className="text-xs text-zinc-600">Currency</div>
                        <input
                          value={mCurrency}
                          onChange={(e) => setMCurrency(e.target.value)}
                          placeholder="AUD"
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                        />
                      </label>
                    </div>

                    <label className="space-y-1">
                      <div className="text-xs text-zinc-600">Current balance (optional)</div>
                      <input
                        value={mBalance}
                        onChange={(e) => setMBalance(e.target.value)}
                        placeholder="1200 or -350"
                        inputMode="decimal"
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => void saveManual()} disabled={manualSaving} className="rounded-2xl">
                      {manualSaving ? "Saving…" : "Save"}
                    </Button>
                    <Chip className="text-xs" onClick={() => setTab("overview")} disabled={manualSaving}>
                      Cancel
                    </Chip>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Ask on accounts page */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <textarea
              ref={askInputRef}
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              placeholder="Ask about your accounts…"
              className="w-full min-h-[110px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-800 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-zinc-200"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submitAsk();
                }
              }}
            />

            <div className="mt-2 flex justify-between text-xs text-zinc-500">
              <span>Questions stay scoped to accounts.</span>
              {ask.status === "loading" ? <span>Thinking…</span> : null}
            </div>

            <div className="mt-3 flex gap-2">
              <Button onClick={() => void submitAsk()} disabled={!askText.trim() || ask.status === "loading"}>
                Get answer
              </Button>
              <Chip className="text-xs" onClick={() => setAskText("")} disabled={!askText.trim()}>
                Clear
              </Chip>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {[
                "Which accounts should we simplify or close?",
                "What’s our everyday buffer right now?",
                "What’s the best structure for a family money system?",
                "What looks risky or messy in our accounts?",
              ].map((ex) => (
                <Chip key={ex} className="text-xs" onClick={() => setAskText(ex)} disabled={ask.status === "loading"}>
                  {ex}
                </Chip>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Ask answer */}
        {ask.status !== "idle" ? (
          <div ref={answerRef}>
            <Card className="border-zinc-200 bg-white">
              <CardContent>
                {ask.status === "loading" ? (
                  <div className="text-sm text-zinc-700">Thinking…</div>
                ) : ask.status === "error" ? (
                  <div className="space-y-2">
                    <div className="text-sm text-zinc-700">{ask.message}</div>
                    <div className="flex flex-wrap gap-2">
                      <Chip className="text-xs" onClick={() => void submitAsk()}>
                        Try again
                      </Chip>
                      <Chip className="text-xs" onClick={() => setAsk({ status: "idle" })}>
                        Done
                      </Chip>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-zinc-500">Question</div>
                    <div className="text-sm text-zinc-900">{ask.question}</div>

                    <div className="pt-2 text-[15px] leading-relaxed text-zinc-800 whitespace-pre-wrap">{ask.answer}</div>

                    <div className="pt-3 flex flex-wrap gap-2">
                      <Chip className="text-xs" onClick={() => setAsk({ status: "idle" })}>
                        Done
                      </Chip>
                      <Chip className="text-xs" onClick={() => askInputRef.current?.focus()}>
                        Ask another
                      </Chip>
                      <Chip className="text-xs" onClick={() => router.push("/lifecfo-home")}>
                        Back to Home
                      </Chip>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </Page>
  );
}
