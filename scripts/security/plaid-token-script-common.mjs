import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filename) {
  const fullPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(fullPath)) return;
  for (const rawLine of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().replace(/^export\s+/, "");
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizedUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function projectRefFromUrl(value) {
  try {
    return new URL(value).hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

export function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith("--")) continue;
    const key = part.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      values[key] = true;
    } else {
      values[key] = next;
      index += 1;
    }
  }
  return values;
}

export function requirePlaidTokenMaintenanceClient() {
  if (process.env.PLAID_TOKEN_MAINTENANCE_ENABLED !== "true") {
    throw new Error(
      "Set PLAID_TOKEN_MAINTENANCE_ENABLED=true before inspecting or migrating Plaid token storage."
    );
  }

  const supabaseUrl = normalizedUrl(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
  }

  const allowedUrls = splitList(
    process.env.PLAID_TOKEN_ALLOWED_SUPABASE_URLS
  ).map(normalizedUrl);
  const allowedRefs = splitList(
    process.env.PLAID_TOKEN_ALLOWED_SUPABASE_PROJECT_REFS
  );
  const projectRef = projectRefFromUrl(supabaseUrl);
  if (!allowedUrls.length && !allowedRefs.length) {
    throw new Error(
      "Set PLAID_TOKEN_ALLOWED_SUPABASE_URLS or PLAID_TOKEN_ALLOWED_SUPABASE_PROJECT_REFS explicitly."
    );
  }
  if (!allowedUrls.includes(supabaseUrl) && !allowedRefs.includes(projectRef)) {
    throw new Error("The configured Supabase project is not allowlisted.");
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

  return {
    client: createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    projectRef,
  };
}

export async function readPlaidConnectionBatch(client, offset, batchSize) {
  const { data, error } = await client
    .from("external_connections")
    .select("id,household_id,encrypted_access_token,updated_at")
    .eq("provider", "plaid")
    .order("id", { ascending: true })
    .range(offset, offset + batchSize - 1);
  if (error) throw new Error("Could not read Plaid connection metadata.");
  return data ?? [];
}
