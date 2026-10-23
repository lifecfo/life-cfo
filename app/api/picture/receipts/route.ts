import { NextResponse } from "next/server";

import { isAiEnabled } from "@/lib/ai/aiFlag";
import { AI_OFF_MESSAGE, aiAskOptedIn } from "@/lib/ai/optIn";
import {
  AiConfigurationError,
  AiDisabledError,
  AiOutputBlockedError,
  generateAiStructured,
} from "@/lib/ai/provider";
import { readLimitedJson, requireAuthenticatedAiUser } from "@/lib/ai/routeSecurity";
import { guardAiInput } from "@/lib/ask/askGuard";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import {
  EMPTY_RECEIPT_FACTS,
  RECEIPT_READ_SYSTEM,
  ReceiptFactsJsonSchema,
  draftFromReceiptFacts,
  receiptReadPrompt,
  sanitiseReceiptFacts,
  type ReceiptFacts,
} from "@/lib/picture/receiptFacts";
import { RECEIPT_BUCKET, RECEIPT_MAX_BYTES, isReceiptPathForHousehold } from "@/lib/picture/receiptImage";

export const dynamic = "force-dynamic";

const STORED_MANUAL =
  "The photo is stored. Type the fields, then confirm. Nothing is saved as an item until you confirm.";

function manualPayload(
  receiptId: string,
  previewUrl: string | null,
  message: string,
  facts: ReceiptFacts = EMPTY_RECEIPT_FACTS
) {
  return {
    ok: true as const,
    receipt_id: receiptId,
    preview_url: previewUrl,
    source: facts === EMPTY_RECEIPT_FACTS ? ("manual" as const) : ("ai" as const),
    facts,
    draft: draftFromReceiptFacts(facts),
    message,
  };
}

export async function POST(req: Request) {
  const auth = await requireAuthenticatedAiUser();
  if (!auth.ok) return auth.response;

  const parsedBody = await readLimitedJson(req, 8 * 1024);
  if (!parsedBody.ok) return parsedBody.response;

  const storagePath = typeof parsedBody.value.storage_path === "string" ? parsedBody.value.storage_path : "";
  const useAi = parsedBody.value.use_ai === true;

  let householdId: string | null = null;
  try {
    householdId = await resolveHouseholdIdRoute(auth.supabase, auth.user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Household lookup failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
  if (!householdId) {
    return NextResponse.json({ ok: false, error: "Create a household before adding a photo." }, { status: 400 });
  }
  if (!isReceiptPathForHousehold(storagePath, householdId)) {
    return NextResponse.json({ ok: false, error: "That photo is not in this household." }, { status: 400 });
  }

  const downloaded = await auth.supabase.storage.from(RECEIPT_BUCKET).download(storagePath);
  if (downloaded.error || !downloaded.data) {
    return NextResponse.json(
      { ok: false, error: "Life CFO couldn't read that photo. Apply the latest database migration, then try again." },
      { status: 400 }
    );
  }
  if (downloaded.data.size > RECEIPT_MAX_BYTES) {
    await auth.supabase.storage.from(RECEIPT_BUCKET).remove([storagePath]);
    return NextResponse.json({ ok: false, error: "That photo is larger than 5 MB." }, { status: 413 });
  }

  const inserted = await auth.supabase
    .from("household_receipts")
    .insert({
      household_id: householdId,
      created_by: auth.user.id,
      storage_path: storagePath,
      mime_type: "image/jpeg",
      byte_size: downloaded.data.size,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data?.id) {
    await auth.supabase.storage.from(RECEIPT_BUCKET).remove([storagePath]);
    return NextResponse.json(
      { ok: false, error: "Life CFO couldn't store that photo. Apply the latest database migration, then try again." },
      { status: 503 }
    );
  }

  const signed = await auth.supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(storagePath, 60 * 30);
  const previewUrl = signed.data?.signedUrl ?? null;
  const receiptId = String(inserted.data.id);

  if (!useAi) {
    return NextResponse.json(manualPayload(receiptId, previewUrl, STORED_MANUAL));
  }

  const optedIn = await aiAskOptedIn(auth.supabase, auth.user.id);
  if (!optedIn || !isAiEnabled()) {
    return NextResponse.json(
      manualPayload(receiptId, previewUrl, !optedIn ? STORED_MANUAL : AI_OFF_MESSAGE)
    );
  }

  const categoryResult = await auth.supabase.from("categories").select("name").eq("household_id", householdId);
  const categoryNames = (categoryResult.data ?? [])
    .map((row) => (typeof row.name === "string" ? row.name : ""))
    .filter(Boolean);
  const prompt = receiptReadPrompt(categoryNames);
  const guarded = guardAiInput(prompt, "structure_record");
  if (!guarded.allowed) {
    return NextResponse.json(manualPayload(receiptId, previewUrl, STORED_MANUAL));
  }

  try {
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    const structured = await generateAiStructured<unknown>({
      purpose: "read_receipt",
      system: RECEIPT_READ_SYSTEM,
      prompt,
      image: { mediaType: "image/jpeg", base64: bytes.toString("base64") },
      temperature: 0,
      maxOutputTokens: 1200,
      allowOverseasDisclosure: true,
      schemaName: "receipt_facts",
      schema: ReceiptFactsJsonSchema,
    });
    const facts = sanitiseReceiptFacts(structured, categoryNames);
    if (!facts) {
      return NextResponse.json(
        manualPayload(
          receiptId,
          previewUrl,
          "The photo is stored. The reading was not usable, so the fields are empty. Nothing is saved until you confirm."
        )
      );
    }
    return NextResponse.json({
      ok: true,
      receipt_id: receiptId,
      preview_url: previewUrl,
      source: "ai",
      facts,
      draft: draftFromReceiptFacts(facts),
      message: "Check these fields. Nothing is saved until you confirm.",
    });
  } catch (error) {
    if (error instanceof AiOutputBlockedError) {
      return NextResponse.json(manualPayload(receiptId, previewUrl, error.replacement));
    }
    const message =
      error instanceof AiDisabledError || error instanceof AiConfigurationError
        ? AI_OFF_MESSAGE
        : "The photo is stored. The reading did not return fields. Type them yourself. Nothing is saved until you confirm.";
    return NextResponse.json(manualPayload(receiptId, previewUrl, message));
  }
}
