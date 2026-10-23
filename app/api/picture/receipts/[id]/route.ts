import { NextResponse } from "next/server";

import { requireAuthenticatedAiUser } from "@/lib/ai/routeSecurity";
import { RECEIPT_BUCKET, isReceiptStoragePath } from "@/lib/picture/receiptImage";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, context: RouteContext) {
  const auth = await requireAuthenticatedAiUser();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "Unknown photo." }, { status: 400 });
  }

  const { data: row, error } = await auth.supabase
    .from("household_receipts")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) {
    return NextResponse.json({ ok: false, error: "That photo is not in this household." }, { status: 404 });
  }

  const storagePath = typeof row.storage_path === "string" ? row.storage_path : "";
  if (isReceiptStoragePath(storagePath)) {
    await auth.supabase.storage.from(RECEIPT_BUCKET).remove([storagePath]);
  }
  const removed = await auth.supabase.from("household_receipts").delete().eq("id", id);
  if (removed.error) {
    return NextResponse.json({ ok: false, error: "That photo could not be deleted." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
