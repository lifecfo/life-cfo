import { RECEIPT_JPEG_QUALITY, RECEIPT_MAX_BYTES, receiptPixelSize } from "./receiptImage";

/** Resize to the long edge and encode JPEG before upload. Browser only. */
export async function compressReceiptImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const size = receiptPixelSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("That photo could not be prepared.");
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/jpeg", RECEIPT_JPEG_QUALITY);
    });
    if (!blob) throw new Error("That photo could not be prepared.");
    if (blob.size > RECEIPT_MAX_BYTES) {
      throw new Error("That photo is still larger than 5 MB after compressing.");
    }
    return blob;
  } finally {
    bitmap.close();
  }
}
