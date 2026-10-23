import assert from "node:assert/strict";
import test from "node:test";

import {
  RECEIPT_JPEG_QUALITY,
  RECEIPT_MAX_BYTES,
  RECEIPT_MAX_EDGE_PX,
  collectReceiptPaths,
  isReceiptPathForHousehold,
  receiptPixelSize,
} from "./receiptImage";

const HOUSEHOLD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("receipt photos scale the long edge to 1600 and keep smaller shots", () => {
  assert.equal(RECEIPT_MAX_EDGE_PX, 1600);
  assert.equal(RECEIPT_JPEG_QUALITY, 0.8);
  assert.equal(RECEIPT_MAX_BYTES, 5 * 1024 * 1024);
  assert.deepEqual(receiptPixelSize(3200, 1600), { width: 1600, height: 800 });
  assert.deepEqual(receiptPixelSize(800, 600), { width: 800, height: 600 });
  assert.throws(() => receiptPixelSize(0, 10));
});

test("storage paths stay inside the household folder", () => {
  const file = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg";
  const path = `${HOUSEHOLD}/${file}`;
  assert.equal(isReceiptPathForHousehold(path, HOUSEHOLD), true);
  assert.equal(isReceiptPathForHousehold(`other/${file}`, HOUSEHOLD), false);
  assert.equal(isReceiptPathForHousehold(`${HOUSEHOLD}/../${file}`, HOUSEHOLD), false);
  assert.deepEqual(collectReceiptPaths(HOUSEHOLD, [path, "nope", null], [file, "../secret.jpg", "notes.txt"]), [path]);
});
