import Link from "next/link";

import { PrintPackButton } from "@/components/decisions/PrintPackButton";
import { PRODUCT_DESCRIPTOR } from "@/lib/brand";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";
import { buildDecisionPack, recordedFactorsAndQuestions, type PackItem } from "@/lib/picture/decisionPack";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const dynamic = "force-dynamic";

type PackPageProps = { params: Promise<{ id: string }> };

function auDate(iso: string | null): string {
  if (!iso) return "No date recorded";
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function linesOrNone(lines: string[]) {
  if (!lines.length) return <p className="text-sm text-zinc-600">None recorded.</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-800">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

export default async function DecisionPackPage({ params }: PackPageProps) {
  const { id } = await params;
  const supabase = await supabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <p className="p-6 text-sm">Sign in to open this pack.</p>;
  }

  const { data: decision } = await supabase
    .from("decisions")
    .select("id,title,context,review_at,household_id")
    .eq("id", id)
    .maybeSingle();
  if (!decision) {
    return <p className="p-6 text-sm">That decision is not available.</p>;
  }

  const { data: notes } = await supabase
    .from("decision_notes")
    .select("body")
    .eq("decision_id", id)
    .order("created_at", { ascending: true });
  const noteText = (notes ?? []).map((note) => String(note.body ?? "")).filter(Boolean);
  const recorded = recordedFactorsAndQuestions(noteText);
  const statement = [decision.title, decision.context].filter(Boolean).join("\n");

  let items: PackItem[] = [];
  if (decision.household_id) {
    const { data } = await supabase
      .from("household_items")
      .select("title,kind,amount_cents,currency,due_on")
      .eq("household_id", decision.household_id);
    items = (data ?? []).map((item) => ({
      title: String(item.title ?? ""),
      kind: String(item.kind ?? "note"),
      amount_cents: typeof item.amount_cents === "number" ? item.amount_cents : null,
      currency: typeof item.currency === "string" ? item.currency : "AUD",
      due_on: typeof item.due_on === "string" ? item.due_on : null,
    }));
  }

  const pack = buildDecisionPack({
    title: String(decision.title ?? ""),
    statement,
    factors: recorded.factors,
    questions: recorded.questions,
    review_on: typeof decision.review_at === "string" ? decision.review_at.slice(0, 10) : null,
    items,
  });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8 text-zinc-900">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <Link className="text-sm underline" href="/decisions">
          Back to decisions
        </Link>
        <PrintPackButton />
      </div>
      <header className="space-y-2">
        <p className="text-sm text-zinc-600">{PRODUCT_DESCRIPTOR}</p>
        <h1 className="text-3xl font-semibold">Decision pack</h1>
        <p className="text-sm leading-6 text-zinc-700">{pack.note}</p>
      </header>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Decision as stated</h2>
        <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800">{pack.statement}</p>
        <p className="text-sm text-zinc-700">Review date: {auDate(pack.review_on)}</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Factors recorded</h2>
        {linesOrNone(pack.factors)}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Questions recorded</h2>
        {linesOrNone(pack.questions)}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Other notes recorded</h2>
        {linesOrNone(recorded.other_notes)}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Typed figures with a shared word</h2>
        <p className="text-sm leading-6 text-zinc-600">
          These item titles share a word of four or more letters with the decision text. That is a text match. It is not a judgement about what matters.
        </p>
        {pack.matched_items.length === 0 ? (
          <p className="text-sm text-zinc-600">No typed item title shares a word with this decision.</p>
        ) : (
          <ul className="space-y-2 text-sm text-zinc-800">
            {pack.matched_items.map((item) => (
              <li key={`${item.title}-${item.due_on ?? "none"}`}>
                {item.title} · {item.kind} ·{" "}
                {item.amount_cents == null ? "No amount" : formatMoneyFromCents(item.amount_cents, item.currency)} ·{" "}
                {auDate(item.due_on)}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-sm leading-6 text-zinc-700">{pack.note}</p>
    </main>
  );
}
