import "server-only";

import { createHash } from "node:crypto";

import { legalPackCanonicalText } from "./betaLegalCopy";

export function legalPackSha256(): string {
  return createHash("sha256").update(legalPackCanonicalText(), "utf8").digest("hex");
}
