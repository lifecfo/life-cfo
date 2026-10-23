import { supabase } from "@/lib/supabaseClient";

import { RECEIPT_BUCKET } from "./receiptImage";

export async function uploadCompressedReceipt(householdId: string, blob: Blob): Promise<string> {
  const path = `${householdId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    cacheControl: "3600",
    upsert: false,
  });
  if (error) {
    throw new Error("Life CFO couldn't store that photo. Apply the latest database migration, then try again.");
  }
  return path;
}

export async function removeUploadedReceipt(path: string): Promise<void> {
  await supabase.storage.from(RECEIPT_BUCKET).remove([path]);
}
