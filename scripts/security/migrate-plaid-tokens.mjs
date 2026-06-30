import process from "node:process";
import {
  encryptPlaidToken,
  isEncryptedPlaidToken,
} from "../../lib/server/security/plaidTokenCryptoCore.mjs";
import {
  parseArgs,
  readPlaidConnectionBatch,
  requirePlaidTokenMaintenanceClient,
} from "./plaid-token-script-common.mjs";

const DEFAULT_BATCH_SIZE = 50;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === true;
  const requestedBatchSize = Number(args["batch-size"] || DEFAULT_BATCH_SIZE);
  const batchSize = Number.isInteger(requestedBatchSize)
    ? Math.min(100, Math.max(1, requestedBatchSize))
    : DEFAULT_BATCH_SIZE;
  const { client, projectRef } = requirePlaidTokenMaintenanceClient();
  const summary = {
    mode: apply ? "apply" : "dry-run",
    project_ref: projectRef,
    examined: 0,
    null_token: 0,
    already_encrypted: 0,
    ready_to_migrate: 0,
    migrated: 0,
    conflicts: 0,
    failed: 0,
    failed_connection_ids: [],
  };

  for (let offset = 0; ; offset += batchSize) {
    const rows = await readPlaidConnectionBatch(client, offset, batchSize);
    for (const row of rows) {
      summary.examined += 1;
      const storedValue = row.encrypted_access_token;
      if (!storedValue) {
        summary.null_token += 1;
        continue;
      }
      if (isEncryptedPlaidToken(storedValue)) {
        summary.already_encrypted += 1;
        continue;
      }
      if (
        !row.id ||
        !row.household_id ||
        !row.updated_at ||
        storedValue.startsWith("lcfo:plaid:")
      ) {
        summary.failed += 1;
        summary.failed_connection_ids.push(row.id || "unknown");
        continue;
      }

      let encrypted;
      try {
        encrypted = encryptPlaidToken(storedValue, {
          provider: "plaid",
          household_id: row.household_id,
          connection_id: row.id,
        });
        summary.ready_to_migrate += 1;
      } catch {
        summary.failed += 1;
        summary.failed_connection_ids.push(row.id);
        continue;
      }

      if (!apply) continue;

      const { data, error } = await client
        .from("external_connections")
        .update({ encrypted_access_token: encrypted })
        .eq("id", row.id)
        .eq("provider", "plaid")
        .eq("updated_at", row.updated_at)
        .select("id");
      if (error) {
        summary.failed += 1;
        summary.failed_connection_ids.push(row.id);
      } else if (!data?.length) {
        summary.conflicts += 1;
      } else {
        summary.migrated += 1;
        console.log(`Migrated Plaid connection ${row.id}.`);
      }
    }
    if (rows.length < batchSize) break;
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!apply) console.log("Dry-run only. Add --apply to write encrypted envelopes.");
  if (summary.failed > 0 || summary.conflicts > 0) process.exitCode = 1;
}

main().catch(() => {
  console.error("Plaid token migration failed.");
  process.exitCode = 1;
});
