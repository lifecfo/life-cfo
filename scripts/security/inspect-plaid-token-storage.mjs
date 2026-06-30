import process from "node:process";
import { isEncryptedPlaidToken } from "../../lib/server/security/plaidTokenCryptoCore.mjs";
import {
  readPlaidConnectionBatch,
  requirePlaidTokenMaintenanceClient,
} from "./plaid-token-script-common.mjs";

const BATCH_SIZE = 100;

async function main() {
  const { client, projectRef } = requirePlaidTokenMaintenanceClient();
  const counts = {
    plaid_connections: 0,
    null_token: 0,
    encrypted_envelope: 0,
    non_envelope_token: 0,
  };

  for (let offset = 0; ; offset += BATCH_SIZE) {
    const rows = await readPlaidConnectionBatch(client, offset, BATCH_SIZE);
    for (const row of rows) {
      counts.plaid_connections += 1;
      if (!row.encrypted_access_token) counts.null_token += 1;
      else if (isEncryptedPlaidToken(row.encrypted_access_token)) {
        counts.encrypted_envelope += 1;
      } else counts.non_envelope_token += 1;
    }
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(JSON.stringify({ project_ref: projectRef, counts }, null, 2));
}

main().catch(() => {
  console.error("Plaid token storage inspection failed.");
  process.exitCode = 1;
});
