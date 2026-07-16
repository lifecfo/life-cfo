import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const confirmationSchema = z.object({
  pattern_key: z.string().trim().min(1).max(500),
  kind: z.enum(["bill", "income", "transfer", "ignore"]),
  label: z.string().trim().max(160).nullable().optional(),
  amount_cents: z.number().int().safe().nonnegative().nullable().optional(),
  currency: z.string().trim().min(1).max(12).optional().default("AUD"),
  cadence: z.string().trim().max(40).nullable().optional(),
  confidence: z.string().trim().max(40).nullable().optional(),
  source_provider: z.string().trim().max(120).nullable().optional(),
  first_seen_at: z.string().trim().nullable().optional(),
  last_seen_at: z.string().trim().nullable().optional(),
});

const deleteConfirmationSchema = z.object({
  pattern_key: z.string().trim().min(1).max(500),
  confirm_despite_activity: z.boolean().optional().default(false),
});

function isOwnerOrEditor(role: unknown): boolean {
  return role === "owner" || role === "editor";
}

function nullableText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function nullableTimestamp(value: string | null | undefined): string | null {
  const text = nullableText(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new Error("invalid_timestamp");
  return new Date(timestamp).toISOString();
}

/* ---------- pattern-confirmation promotion helpers ---------- */
/* See docs/product/pattern-confirmation-promotion-spec.md. */

type PromotionCadence = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";

const PROMOTION_CADENCES = new Set<PromotionCadence>([
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "yearly",
]);

/**
 * recurring_bills/recurring_income both have a DB-level CHECK constraint
 * limiting cadence to weekly/fortnightly/monthly/quarterly/yearly.
 * Detection (deriveTransactionOutflowSummary) can produce "repeated" for
 * an irregular-but-repeating bill pattern (income patterns are already
 * filtered to exclude this upstream, but bill patterns are not) -- that
 * value would violate the constraint outright. Falling back to "monthly"
 * is a judgment call the promotion spec didn't address explicitly: most
 * irregular recurring expenses land closer to monthly than weekly.
 */
function normalizeCadenceForPromotion(
  cadence: string | null | undefined
): { cadence: PromotionCadence; usedFallback: boolean } {
  const value = (cadence || "").trim().toLowerCase();
  if (PROMOTION_CADENCES.has(value as PromotionCadence)) {
    return { cadence: value as PromotionCadence, usedFallback: false };
  }
  return { cadence: "monthly", usedFallback: true };
}

const CADENCE_FALLBACK_NOTE =
  "Detected as an irregular pattern — cadence set to monthly as a starting estimate.";

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function addMonthsPreserveDay(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const target = new Date(date);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const maxDay = daysInMonth(target.getUTCFullYear(), target.getUTCMonth());
  target.setUTCDate(Math.min(day, maxDay));
  return target;
}

/** Next occurrence = last observed occurrence + one cadence interval. */
function nextOccurrenceIso(lastSeenAtIso: string | null, cadence: PromotionCadence): string {
  const parsed = lastSeenAtIso ? new Date(lastSeenAtIso) : null;
  const base = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();

  if (cadence === "weekly") {
    const next = new Date(base);
    next.setUTCDate(next.getUTCDate() + 7);
    return next.toISOString();
  }
  if (cadence === "fortnightly") {
    const next = new Date(base);
    next.setUTCDate(next.getUTCDate() + 14);
    return next.toISOString();
  }
  if (cadence === "monthly") return addMonthsPreserveDay(base, 1).toISOString();
  if (cadence === "quarterly") return addMonthsPreserveDay(base, 3).toISOString();
  return addMonthsPreserveDay(base, 12).toISOString(); // yearly
}

/**
 * pattern_key looks like "outflow:AUD:NETFLIX" or "income:AUD:EMPLOYERNAME"
 * (see deriveTransactionOutflowSummary's groupKey()). Best-effort fallback
 * only -- used solely when the confirmation itself has no explicit label,
 * which is the normal case on a first-time "Confirm as bill/income" click
 * (label is only ever sent when the household used "Give this a name").
 */
function deriveNameFromPatternKey(patternKey: string): string | null {
  const tail = patternKey.split(":").slice(2).join(":").trim();
  return tail || null;
}

function derivePromotionName(
  label: string | null,
  patternKey: string,
  kind: "bill" | "income"
): string {
  const trimmedLabel = (label || "").trim();
  if (trimmedLabel) return trimmedLabel;
  const fromKey = deriveNameFromPatternKey(patternKey);
  if (fromKey) return fromKey;
  return kind === "bill" ? "Detected recurring bill" : "Detected recurring income";
}

function isActivePromotionUniqueViolation(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23505" &&
    (error.message?.includes("recurring_bills_source_pattern_active_uidx") === true ||
      error.message?.includes("recurring_income_source_pattern_active_uidx") === true)
  );
}

export async function POST(request: Request) {
  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "No active household was found." },
        { status: 400 }
      );
    }

    const [{ data: membership, error: membershipError }, ownerCheckResult] = await Promise.all([
      supabase
        .from("household_members")
        .select("role")
        .eq("household_id", householdId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.rpc("is_household_owner_or_editor", { p_household_id: householdId }),
    ]);

    if (membershipError) throw membershipError;
    if (ownerCheckResult.error) throw ownerCheckResult.error;
    if (!isOwnerOrEditor(membership?.role) || ownerCheckResult.data !== true) {
      return NextResponse.json(
        { ok: false, error: "Only a household owner or editor can save this." },
        { status: 403 }
      );
    }

    const parsed = confirmationSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "That confirmation could not be saved." },
        { status: 400 }
      );
    }

    let firstSeenAt: string | null;
    let lastSeenAt: string | null;
    try {
      firstSeenAt = nullableTimestamp(parsed.data.first_seen_at);
      lastSeenAt = nullableTimestamp(parsed.data.last_seen_at);
    } catch {
      return NextResponse.json(
        { ok: false, error: "The pattern dates were not valid." },
        { status: 400 }
      );
    }

    // Step 1: capture the prior state before the upsert overwrites it -- the
    // upsert below has no built-in way to tell us what this pattern's kind
    // used to be, so we read it explicitly first. A failure here is treated
    // as fatal (not silently defaulted to "no prior state") because getting
    // this wrong could cause a real, already-active promoted row to be
    // skipped for deactivation later in this request.
    const { data: previousConfirmation, error: previousConfirmationError } = await supabase
      .from("transaction_pattern_confirmations")
      .select("id,kind")
      .eq("household_id", householdId)
      .eq("pattern_key", parsed.data.pattern_key)
      .maybeSingle();

    if (previousConfirmationError) throw previousConfirmationError;

    const now = new Date().toISOString();
    const { data: confirmation, error: upsertError } = await supabase
      .from("transaction_pattern_confirmations")
      .upsert(
        {
          household_id: householdId,
          pattern_key: parsed.data.pattern_key,
          kind: parsed.data.kind,
          label: nullableText(parsed.data.label),
          amount_cents: parsed.data.amount_cents ?? null,
          currency: parsed.data.currency.toUpperCase(),
          cadence: nullableText(parsed.data.cadence),
          confidence: nullableText(parsed.data.confidence),
          source_provider: nullableText(parsed.data.source_provider),
          first_seen_at: firstSeenAt,
          last_seen_at: lastSeenAt,
          created_by: user.id,
          updated_at: now,
        },
        { onConflict: "household_id,pattern_key" }
      )
      .select(
        "id,pattern_key,kind,label,amount_cents,currency,cadence,confidence,source_provider,first_seen_at,last_seen_at,created_at,updated_at"
      )
      .single();

    if (upsertError) throw upsertError;

    // Steps 2-5: promotion and deactivation. Deliberately its own try/catch,
    // separate from the confirmation save above -- the confirmation already
    // succeeded by this point, so a promotion-side failure must not turn
    // into a failed response (that would falsely tell the household their
    // confirmation didn't save). It also must not be silently swallowed --
    // logged clearly so a stuck/never-promoted pattern is diagnosable.
    try {
      const newKind = parsed.data.kind;

      // Step 2: is this a promotion event?
      const isPromotion =
        (newKind === "bill" || newKind === "income") &&
        (!previousConfirmation || previousConfirmation.kind !== newKind);

      // Step 3: create the real row.
      if (isPromotion) {
        const amountCents = parsed.data.amount_cents;

        if (typeof amountCents !== "number") {
          // No amount was provided (schema allows it to be absent). Nothing
          // sensible to promote into a real bill/income row -- skip, don't
          // fabricate a $0 entry. Logged so this doesn't disappear silently.
          console.error("pattern_confirmation_promotion_skipped_no_amount", {
            pattern_key: parsed.data.pattern_key,
            household_id: householdId,
            kind: newKind,
          });
        } else {
          const { cadence, usedFallback } = normalizeCadenceForPromotion(parsed.data.cadence);
          const nextAt = nextOccurrenceIso(lastSeenAt, cadence);
          const name = derivePromotionName(parsed.data.label ?? null, parsed.data.pattern_key, newKind);
          const currency = parsed.data.currency.toUpperCase();

          const basePayload = {
            household_id: householdId,
            user_id: user.id,
            name,
            amount_cents: amountCents,
            currency,
            cadence,
            active: true,
            source_pattern_confirmation_id: confirmation.id,
            // Only set when normalizeCadenceForPromotion actually fell back --
            // a genuinely detected "monthly" pattern shouldn't get this note.
            notes: usedFallback ? CADENCE_FALLBACK_NOTE : null,
          };

          const insertResult =
            newKind === "bill"
              ? await supabase
                  .from("recurring_bills")
                  .insert({ ...basePayload, next_due_at: nextAt, autopay: false })
              : await supabase
                  .from("recurring_income")
                  .insert({
                    ...basePayload,
                    next_pay_at: nextAt,
                    // Never "confirmed" -- the household confirmed the
                    // *pattern* is real, but the specific future amount is
                    // still an inference, not a known, dated payment. See
                    // pattern-confirmation-promotion-spec.md.
                    confidence_tier: "expected_recurring",
                  });

          // Step 4: an active promoted row for this pattern already exists
          // (the unique index caught it) -- not an error, just a no-op.
          if (insertResult.error && !isActivePromotionUniqueViolation(insertResult.error)) {
            throw insertResult.error;
          }
        }
      }

      // Step 5: kind-switch away from a previously-promoted bill/income --
      // deactivate (never delete) whatever that promotion created. This is
      // independent of step 3 above; both can fire in the same request
      // (e.g. switching a confirmed income pattern directly to "bill").
      if (
        previousConfirmation &&
        (previousConfirmation.kind === "bill" || previousConfirmation.kind === "income") &&
        previousConfirmation.kind !== newKind
      ) {
        const oldTable = previousConfirmation.kind === "bill" ? "recurring_bills" : "recurring_income";
        const { error: deactivateError } = await supabase
          .from(oldTable)
          .update({ active: false })
          .eq("source_pattern_confirmation_id", previousConfirmation.id)
          .eq("active", true);

        if (deactivateError) throw deactivateError;
      }
    } catch (promotionError: unknown) {
      const message =
        promotionError instanceof Error ? promotionError.message : "Promotion failed";
      console.error("pattern_confirmation_promotion_failed", {
        message,
        pattern_key: parsed.data.pattern_key,
        household_id: householdId,
      });
      // Not rethrown: the confirmation itself already saved successfully.
    }

    return NextResponse.json({ ok: true, confirmation });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Pattern confirmation failed";
    console.error("pattern_confirmation_failed", { message });
    return NextResponse.json(
      { ok: false, error: "We could not save that just now." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "No active household was found." },
        { status: 400 }
      );
    }

    const [{ data: membership, error: membershipError }, ownerCheckResult] = await Promise.all([
      supabase
        .from("household_members")
        .select("role")
        .eq("household_id", householdId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.rpc("is_household_owner_or_editor", { p_household_id: householdId }),
    ]);

    if (membershipError) throw membershipError;
    if (ownerCheckResult.error) throw ownerCheckResult.error;
    if (!isOwnerOrEditor(membership?.role) || ownerCheckResult.data !== true) {
      return NextResponse.json(
        { ok: false, error: "Only a household owner or editor can change this." },
        { status: 403 }
      );
    }

    const parsed = deleteConfirmationSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "That pattern could not be put back for review." },
        { status: 400 }
      );
    }

    // Find whatever this pattern previously promoted, if anything, so
    // putting it back for review can deactivate that row too -- otherwise
    // a "put back for review" would leave an orphaned active bill/income
    // row with no confirmation behind it, and re-confirming later would
    // silently create a second one (the active-only unique index wouldn't
    // catch it, since the first row would have no confirmation pointing
    // at it anymore once this delete runs).
    const { data: existingConfirmation, error: lookupError } = await supabase
      .from("transaction_pattern_confirmations")
      .select("id,kind")
      .eq("household_id", householdId)
      .eq("pattern_key", parsed.data.pattern_key)
      .maybeSingle();

    if (lookupError) throw lookupError;

    if (existingConfirmation && (existingConfirmation.kind === "bill" || existingConfirmation.kind === "income")) {
      const linkedTable = existingConfirmation.kind === "bill" ? "recurring_bills" : "recurring_income";
      const { data: linkedRow, error: linkedError } = await supabase
        .from(linkedTable)
        .select("id")
        .eq("source_pattern_confirmation_id", existingConfirmation.id)
        .eq("active", true)
        .maybeSingle();

      if (linkedError) throw linkedError;

      if (linkedRow) {
        // Warn before deactivating if the row has real activity attached,
        // per the spec. Only bills have an activity table to check
        // (bill_payments) -- there is no equivalent income_payments table,
        // so income promotions currently skip this check entirely rather
        // than guessing at what "activity" would mean for an income row.
        let hasActivity = false;
        if (existingConfirmation.kind === "bill") {
          const { count, error: paymentsError } = await supabase
            .from("bill_payments")
            .select("id", { count: "exact", head: true })
            .eq("bill_id", linkedRow.id);

          if (paymentsError) throw paymentsError;
          hasActivity = (count ?? 0) > 0;
        }

        if (hasActivity && !parsed.data.confirm_despite_activity) {
          return NextResponse.json(
            {
              ok: false,
              needs_confirmation: true,
              warning:
                "This bill has payments recorded against it. Putting the pattern back for review will also pause the bill it created. Continue?",
            },
            { status: 409 }
          );
        }

        const { error: deactivateError } = await supabase
          .from(linkedTable)
          .update({ active: false })
          .eq("id", linkedRow.id);

        if (deactivateError) throw deactivateError;
      }
    }

    const { error: deleteError } = await supabase
      .from("transaction_pattern_confirmations")
      .delete()
      .eq("household_id", householdId)
      .eq("pattern_key", parsed.data.pattern_key);

    if (deleteError) throw deleteError;

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Pattern reset failed";
    console.error("pattern_confirmation_delete_failed", { message });
    return NextResponse.json(
      { ok: false, error: "We could not put that back for review just now." },
      { status: 500 }
    );
  }
}
