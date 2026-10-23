"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Page } from "@/components/Page";
import { Button, Card, CardContent } from "@/components/ui";
import { PRODUCT_TAGLINE } from "@/lib/brand";
import { compressReceiptImage } from "@/lib/picture/compressReceiptImage";
import { removeUploadedReceipt, uploadCompressedReceipt } from "@/lib/picture/uploadReceipt";

type Kind = "bill" | "renewal" | "income" | "note";

type Draft = {
  title: string;
  kind: Kind;
  amount: string;
  due_on: string;
  notes: string;
  receiptId: string | null;
  previewUrl: string | null;
};

const EMPTY: Draft = { title: "", kind: "note", amount: "", due_on: "", notes: "", receiptId: null, previewUrl: null };

function dollars(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function toDraft(item: { title: string; kind: Kind; amount_cents: number | null; due_on: string | null; notes: string | null }): Draft {
  return {
    title: item.title,
    kind: item.kind,
    amount: dollars(item.amount_cents),
    due_on: item.due_on ?? "",
    notes: item.notes ?? "",
    receiptId: null,
    previewUrl: null,
  };
}

function centsFromDollars(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 100);
}

export default function StartClient() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [phase, setPhase] = useState<"dump" | "confirm" | "invite">("dump");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [pasted, setPasted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLInputElement>(null);

  async function ensureHousehold(): Promise<string | null> {
    if (householdId) return householdId;
    const existing = await fetch("/api/picture", { cache: "no-store" });
    const picture = (await existing.json().catch(() => null)) as { household_id?: string | null } | null;
    if (picture?.household_id) {
      setHouseholdId(picture.household_id);
      return picture.household_id;
    }
    const created = await fetch("/api/households/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Our household" }),
    });
    const json = (await created.json().catch(() => null)) as { household_id?: string; error?: string } | null;
    if (!created.ok || !json?.household_id) {
      setMessage(json?.error || "Life CFO couldn't open a household.");
      return null;
    }
    setHouseholdId(json.household_id);
    return json.household_id;
  }

  async function sort(useAi: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      if (useAi && optIn) {
        const opted = await fetch("/api/settings/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opt_in: true }),
        });
        if (!opted.ok) {
          setMessage("Life CFO couldn't save the AI opt-in. You can still sort the lines yourself.");
          return;
        }
      }
      const response = await fetch("/api/picture/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, use_ai: useAi }),
      });
      const json = (await response.json().catch(() => null)) as {
        items?: Array<{ title: string; kind: Kind; amount_cents: number | null; due_on: string | null; notes: string | null }>;
        message?: string | null;
        error?: string;
        refused?: boolean;
        source?: string;
      } | null;
      if (!response.ok && !json?.refused) {
        setMessage(json?.error || "Those notes could not be sorted.");
        return;
      }
      setMessage(json?.message || null);
      if (json?.refused && (!json.items || json.items.length === 0)) return;
      const next = (json?.items ?? []).map(toDraft);
      setDrafts(next.length ? next : [{ ...EMPTY }]);
      setPasted(true);
      setPhase("confirm");
    } finally {
      setBusy(false);
    }
  }

  async function previewSheet(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/picture/sheet", { method: "POST", body: form });
      const json = (await response.json().catch(() => null)) as {
        rows?: Array<{ title: string; kind: Kind; amount_cents: number | null; due_on: string | null; notes: string | null }>;
        issues?: string[];
        error?: string;
      } | null;
      if (!response.ok) {
        setMessage(json?.error || "That spreadsheet could not be read.");
        return;
      }
      const rows = json?.rows ?? [];
      if (!rows.length) {
        setMessage(json?.issues?.join(" ") || "No rows were found in that spreadsheet.");
        return;
      }
      setDrafts(rows.map(toDraft));
      setPasted(false);
      setPhase("confirm");
      if (json?.issues?.length) setMessage(json.issues.join(" "));
    } finally {
      setBusy(false);
    }
  }

  function addBlank() {
    setPasted(false);
    setDrafts([{ ...EMPTY }]);
    setMessage(null);
    setPhase("confirm");
  }

  async function saveItems() {
    setBusy(true);
    setMessage(null);
    try {
      const household = await ensureHousehold();
      if (!household) return;
      const items = drafts
        .map((draft) => ({
          title: draft.title.trim(),
          kind: draft.kind,
          amount_cents: centsFromDollars(draft.amount),
          due_on: draft.due_on || null,
          notes: draft.notes.trim() || null,
          receipt_id: draft.receiptId,
        }))
        .filter((item) => item.title);
      const response = await fetch("/api/picture/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, source: pasted ? "brain_dump" : "manual" }),
      });
      const json = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) {
        setMessage(json?.error || "Those items could not be saved.");
        return;
      }
      if (json?.message) setMessage(json.message);
      setPhase("invite");
    } finally {
      setBusy(false);
    }
  }

  async function sendInvite() {
    setBusy(true);
    setMessage(null);
    try {
      const household = await ensureHousehold();
      if (!household) return;
      const response = await fetch("/api/households/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ household_id: household, email: inviteEmail.trim(), role: "editor" }),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setMessage(json?.error || "That invite could not be saved.");
        return;
      }
      setMessage("Invite saved. They will see it after they sign in with that email. No email is sent.");
    } finally {
      setBusy(false);
    }
  }

  async function leave(completed: boolean) {
    if (completed) {
      await fetch("/api/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "onboarding_completed" }),
      });
    }
    router.push("/lifecfo-home");
  }

  return (
    <Page title="Start here" subtitle={PRODUCT_TAGLINE}>
      <div className="mx-auto max-w-[760px] space-y-4">
        {phase === "dump" ? (
          <Card>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-zinc-600">
                Paste bills, renewals, due dates, and notes. Life CFO turns them into a list you confirm before anything is saved. This is not a budget score, and it does not need a bank login.
              </p>
              <label className="block text-sm font-medium text-zinc-800" htmlFor="brain-dump">
                Household notes
              </label>
              <textarea
                id="brain-dump"
                className="min-h-40 w-full rounded-xl border border-neutral-border bg-white px-3 py-2 text-sm text-neutral-text outline-none focus:border-cfo focus:ring-2 focus:ring-cfo/10"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={"Rent $450 due 1 Nov\nCar rego renewal 12 March $320"}
              />
              <div className="space-y-1">
                <label className="flex items-start gap-2 text-sm leading-6 text-zinc-700" htmlFor="ai-opt-in">
                  <input
                    id="ai-opt-in"
                    type="checkbox"
                    className="mt-1"
                    checked={optIn}
                    onChange={(event) => setOptIn(event.target.checked)}
                    aria-describedby="ai-opt-in-help"
                  />
                  <span>Use AI to sort this.</span>
                </label>
                <p id="ai-opt-in-help" className="pl-6 text-sm leading-6 text-zinc-600">
                  The text is sent to OpenAI or Anthropic, which may process it outside Australia. These providers do not use it to train their models under their standard business terms. They may keep it for up to 30 days for safety and abuse monitoring. Nothing is saved until you confirm the list.
                </p>
              </div>
              <p className="text-sm leading-6 text-zinc-600">
                A photo is stored in Life CFO either way. It is sent to the same provider only if this box is ticked.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy || !text.trim() || !optIn} onClick={() => void sort(true)}>
                  Sort with AI
                </Button>
                <Button type="button" variant="secondary" disabled={busy || !text.trim()} onClick={() => void sort(false)}>
                  Sort these lines myself
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={addBlank}>
                  Type items myself
                </Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
                  Add a photo
                </Button>
              </div>
              <div className="space-y-2 border-t border-zinc-100 pt-4">
                <Link href="/money/import" className="block text-sm font-medium text-cfo underline">
                  Upload a bank file (CSV)
                </Link>
                <a href="/api/picture/sheet-template" className="block text-sm font-medium text-cfo underline">
                  Download a spreadsheet template
                </a>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => sheetRef.current?.click()}>
                  Upload a spreadsheet
                </Button>
                <p className="text-sm leading-6 text-zinc-600">
                  The template columns are name, type (bill, income, or renewal), amount, how often, next due date, category, and notes. Life CFO shows the rows here and saves them only after you confirm. The file is not stored.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {phase === "confirm" ? (
          <Card>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-zinc-600">Confirm or edit each item. Unwanted rows can be cleared. Saving adds them to the shared picture.</p>
              {drafts.map((draft, index) => (
                <div key={index} className="grid gap-2 rounded-2xl border border-zinc-200 p-3 sm:grid-cols-2">
                  {draft.previewUrl ? (
                    // Local preview of a private photo. The optimizer cannot fetch a blob URL.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={draft.previewUrl}
                      alt="Receipt or bill photo"
                      className="h-24 w-24 rounded-xl object-cover sm:col-span-2"
                    />
                  ) : null}
                  <input
                    className="rounded-xl border border-neutral-border bg-white px-2 py-1 text-sm text-neutral-text outline-none focus:border-cfo focus:ring-2 focus:ring-cfo/10 sm:col-span-2"
                    value={draft.title}
                    placeholder="Title"
                    onChange={(event) => updateDraft(index, { title: event.target.value })}
                  />
                  <select
                    className="rounded-xl border border-neutral-border bg-white px-2 py-1 text-sm text-neutral-text outline-none focus:border-cfo focus:ring-2 focus:ring-cfo/10"
                    value={draft.kind}
                    onChange={(event) => updateDraft(index, { kind: event.target.value as Kind })}
                  >
                    <option value="bill">Bill</option>
                    <option value="renewal">Renewal</option>
                    <option value="income">Income</option>
                    <option value="note">Note</option>
                  </select>
                  <input
                    className="rounded-xl border border-neutral-border bg-white px-2 py-1 text-sm text-neutral-text outline-none focus:border-cfo focus:ring-2 focus:ring-cfo/10"
                    value={draft.amount}
                    placeholder="Amount in dollars"
                    inputMode="decimal"
                    onChange={(event) => updateDraft(index, { amount: event.target.value })}
                  />
                  <input
                    className="rounded-xl border border-neutral-border bg-white px-2 py-1 text-sm text-neutral-text outline-none focus:border-cfo focus:ring-2 focus:ring-cfo/10"
                    type="date"
                    value={draft.due_on}
                    onChange={(event) => updateDraft(index, { due_on: event.target.value })}
                  />
                  <input
                    className="rounded-xl border border-neutral-border bg-white px-2 py-1 text-sm text-neutral-text outline-none focus:border-cfo focus:ring-2 focus:ring-cfo/10"
                    value={draft.notes}
                    placeholder="Note"
                    onChange={(event) => updateDraft(index, { notes: event.target.value })}
                  />
                  {draft.receiptId ? (
                    <button
                      type="button"
                      className="text-left text-sm text-zinc-600 underline sm:col-span-2"
                      onClick={() => void deletePhoto(index)}
                    >
                      Delete photo
                    </button>
                  ) : null}
                </div>
              ))}
              <label className="flex items-start gap-2 text-sm leading-6 text-zinc-700">
                <input type="checkbox" className="mt-1" checked={optIn} onChange={(event) => setOptIn(event.target.checked)} />
                <span>
                  Use AI to sort this. A photo is stored either way. It is sent to OpenAI or Anthropic, which may process it outside Australia, only if this is ticked. Nothing is saved until you confirm.
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setDrafts((current) => [...current, { ...EMPTY }])}>
                  Add a row
                </Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
                  Add a photo
                </Button>
                <Button type="button" disabled={busy} onClick={() => void saveItems()}>
                  Save confirmed items
                </Button>
                <Button type="button" variant="ghost" onClick={() => setPhase("dump")}>
                  Back
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {phase === "invite" ? (
          <Card>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-zinc-600">
                Invite the other person who should see this picture. The invite is stored for their email. Life CFO does not send an email.
              </p>
              <input
                className="w-full rounded-xl border border-neutral-border bg-white px-3 py-2 text-sm text-neutral-text outline-none focus:border-cfo focus:ring-2 focus:ring-cfo/10"
                type="email"
                value={inviteEmail}
                placeholder="Their email"
                onChange={(event) => setInviteEmail(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy || !inviteEmail.includes("@")} onClick={() => void sendInvite()}>
                  Save invite
                </Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void leave(true)}>
                  Go to the shared picture
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <input
          ref={sheetRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="Upload a household spreadsheet"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void previewSheet(file);
          }}
        />

        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          multiple
          className="sr-only"
          aria-label="Add a photo of a receipt or bill"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length) void addPhotos(files);
          }}
        />

        {message ? <p className="text-sm leading-6 text-zinc-700">{message}</p> : null}

        <button type="button" className="text-sm text-zinc-600 underline" onClick={() => void leave(phase !== "dump")}>
          Skip for now
        </button>
      </div>
    </Page>
  );

  function updateDraft(index: number, patch: Partial<Draft>) {
    setDrafts((current) => current.map((draft, itemIndex) => (itemIndex === index ? { ...draft, ...patch } : draft)));
  }

  async function deletePhoto(index: number) {
    const draft = drafts[index];
    if (!draft) return;
    if (draft.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(draft.previewUrl);
    if (draft.receiptId) {
      await fetch(`/api/picture/receipts/${draft.receiptId}`, { method: "DELETE" });
    }
    updateDraft(index, { receiptId: null, previewUrl: null });
  }

  async function addPhotos(files: File[]) {
    setBusy(true);
    setMessage(null);
    const notes: string[] = [];
    const next: Draft[] = [];
    try {
      let readWithAi = optIn;
      if (optIn) {
        const opted = await fetch("/api/settings/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opt_in: true }),
        });
        if (!opted.ok) {
          readWithAi = false;
          notes.push("Life CFO couldn't save the AI opt-in. The photo is stored. Type the fields.");
        }
      }
      const household = await ensureHousehold();
      if (!household) return;
      for (const file of files) {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (isPdf) {
          notes.push("PDF files are not stored. Add a photo of the bill instead.");
          continue;
        }
        if (file.type && !file.type.startsWith("image/")) {
          notes.push("Only photos can be stored.");
          continue;
        }
        let blob: Blob;
        try {
          blob = await compressReceiptImage(file);
        } catch (error) {
          notes.push(error instanceof Error ? error.message : "That photo could not be prepared.");
          continue;
        }
        let storagePath: string | null = null;
        try {
          storagePath = await uploadCompressedReceipt(household, blob);
          const response = await fetch("/api/picture/receipts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storage_path: storagePath, use_ai: readWithAi }),
          });
          const json = (await response.json().catch(() => null)) as {
            receipt_id?: string;
            preview_url?: string | null;
            message?: string;
            error?: string;
            draft?: { title: string; kind: Kind; amount_cents: number | null; due_on: string | null; notes: string | null };
          } | null;
          if (!response.ok || !json?.receipt_id) {
            await removeUploadedReceipt(storagePath);
            notes.push(json?.error || "That photo could not be stored.");
            continue;
          }
          const draft = json.draft ? toDraft(json.draft) : { ...EMPTY };
          next.push({
            ...draft,
            receiptId: json.receipt_id,
            previewUrl: URL.createObjectURL(blob),
          });
          if (json.message) notes.push(json.message);
        } catch (error) {
          if (storagePath) await removeUploadedReceipt(storagePath);
          notes.push(error instanceof Error ? error.message : "That photo could not be stored.");
        }
      }
      if (next.length) {
        setDrafts((current) => (phase === "confirm" ? [...current, ...next] : next));
        setPhase("confirm");
      }
      if (notes.length) setMessage(notes.join(" "));
    } finally {
      setBusy(false);
    }
  }
}
