import { NextResponse } from "next/server";
import { z } from "zod";

import { isAiEnabled } from "@/lib/ai/aiFlag";
import { AI_OFF_MESSAGE, aiAskOptedIn } from "@/lib/ai/optIn";
import {
  AiConfigurationError,
  AiDisabledError,
  AiOutputBlockedError,
  generateAiStructured,
} from "@/lib/ai/provider";
import { AiDailyLimitError, AiUsageUnavailableError } from "@/lib/ai/usageLimit";
import { readLimitedJson, requireAuthenticatedAiUser } from "@/lib/ai/routeSecurity";
import { guardAiInput } from "@/lib/ask/askGuard";
import { sanitiseDraftItems } from "@/lib/picture/draftItems";
import { parseBrainDump } from "@/lib/picture/parseBrainDump";
import { recordUsage } from "@/lib/usage/recordUsage";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";

export const dynamic = "force-dynamic";

const MAX_TEXT = 8000;

const StructuredItemsSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string(),
        kind: z.enum(["bill", "renewal", "income", "note"]),
        amount_cents: z.number().int().nullable(),
        due_on: z.string().nullable(),
        notes: z.string().nullable(),
      })
    )
    .max(40),
});

const StructuredItemsJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          kind: { type: "string", enum: ["bill", "renewal", "income", "note"] },
          amount_cents: { anyOf: [{ type: "integer" }, { type: "null" }] },
          due_on: { anyOf: [{ type: "string" }, { type: "null" }] },
          notes: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: ["title", "kind", "amount_cents", "due_on", "notes"],
      },
    },
  },
  required: ["items"],
};

export async function POST(req: Request) {
  const auth = await requireAuthenticatedAiUser();
  if (!auth.ok) return auth.response;

  const parsedBody = await readLimitedJson(req, 16 * 1024);
  if (!parsedBody.ok) return parsedBody.response;

  const text = typeof parsedBody.value.text === "string" ? parsedBody.value.text.trim() : "";
  const useAi = parsedBody.value.use_ai === true;
  if (!text) {
    return NextResponse.json({ ok: false, error: "Paste or type some notes first." }, { status: 400 });
  }
  if (text.length > MAX_TEXT) {
    return NextResponse.json({ ok: false, error: "That note is too long to sort in one go." }, { status: 413 });
  }

  const lineItems = parseBrainDump(text);
  if (!useAi) {
    await recordBrainDump(auth.supabase, auth.user.id);
    return NextResponse.json({ ok: true, source: "lines", items: lineItems, message: null });
  }

  const optedIn = await aiAskOptedIn(auth.supabase, auth.user.id);
  if (!optedIn || !isAiEnabled()) {
    await recordBrainDump(auth.supabase, auth.user.id);
    return NextResponse.json({
      ok: true,
      source: "lines",
      items: lineItems,
      message: !optedIn
        ? "AI is not opted in. These lines were split from your text. Nothing is saved until you confirm."
        : AI_OFF_MESSAGE,
    });
  }

  const guarded = guardAiInput(text, "structure_record");
  if (!guarded.allowed) {
    return NextResponse.json({
      ok: false,
      refused: true,
      source: "refused",
      items: [],
      message: guarded.message,
    });
  }

  try {
    const structured = await generateAiStructured<unknown>({
      purpose: "structure_record",
      userId: auth.user.id,
      system:
        "Extract only items that appear in the household's text. Do not add items. Do not advise. If a date or amount is not stated, use null. Dates are YYYY-MM-DD. Amounts are integer cents. Kind is bill, renewal, income, or note.",
      prompt: text,
      temperature: 0,
      maxOutputTokens: 2000,
      allowOverseasDisclosure: true,
      schemaName: "household_items",
      schema: StructuredItemsJsonSchema,
    });
    const parsed = StructuredItemsSchema.safeParse(structured);
    if (!parsed.success) {
      await recordBrainDump(auth.supabase, auth.user.id);
      return NextResponse.json({
        ok: true,
        source: "lines",
        items: lineItems,
        message: "The sorter did not return a usable list. These lines were split from your text.",
      });
    }
    await recordBrainDump(auth.supabase, auth.user.id);
    return NextResponse.json({
      ok: true,
      source: "ai",
      items: sanitiseDraftItems(parsed.data.items),
      message: "Check this list. Nothing is saved until you confirm.",
    });
  } catch (error) {
    if (error instanceof AiDailyLimitError || error instanceof AiUsageUnavailableError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 429 });
    }
    if (error instanceof AiOutputBlockedError) {
      return NextResponse.json({
        ok: false,
        refused: true,
        source: "lines",
        items: lineItems,
        message: error.replacement,
      });
    }
    if (error instanceof AiDisabledError || error instanceof AiConfigurationError) {
      await recordBrainDump(auth.supabase, auth.user.id);
      return NextResponse.json({
        ok: true,
        source: "lines",
        items: lineItems,
        message: AI_OFF_MESSAGE,
      });
    }
    await recordBrainDump(auth.supabase, auth.user.id);
    return NextResponse.json({
      ok: true,
      source: "lines",
      items: lineItems,
      message: "The sorter did not return a list. These lines were split from your text.",
    });
  }
}

async function recordBrainDump(supabase: unknown, userId: string) {
  let householdId: string | null = null;
  try {
    householdId = await resolveHouseholdIdRoute(supabase, userId);
  } catch {
    householdId = null;
  }
  await recordUsage(supabase, { name: "brain_dump_used", userId, householdId });
}
