import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { registeredTableNames } from "./dataRegistry";

function createTableBodies(sql: string): { name: string; body: string }[] {
  const withoutLineComments = sql.replace(/--.*$/gm, "");
  const found: { name: string; body: string }[] = [];
  const matcher = /create\s+table(?:\s+if\s+not\s+exists)?\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(/gi;
  for (const match of withoutLineComments.matchAll(matcher)) {
    const open = match.index! + match[0].length - 1;
    let depth = 0;
    let inString = false;
    let body = "";
    for (let i = open; i < withoutLineComments.length; i += 1) {
      const ch = withoutLineComments[i];
      if (ch === "'") inString = !inString;
      if (inString) continue;
      if (ch === "(") depth += 1;
      if (ch === ")") {
        depth -= 1;
        if (depth === 0) {
          body = withoutLineComments.slice(open + 1, i);
          break;
        }
      }
    }
    found.push({ name: match[1].toLowerCase(), body });
  }
  return found;
}

test("every migration table with user_id or household_id is in the deletion registry", () => {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql"));
  const registered = new Set(registeredTableNames());
  const missing: string[] = [];
  for (const file of files) {
    const sql = readFileSync(path.join(dir, file), "utf8");
    for (const table of createTableBodies(sql)) {
      if (!/\buser_id\b/.test(table.body) && !/\bhousehold_id\b/.test(table.body)) continue;
      if (!registered.has(table.name)) missing.push(`${file}:${table.name}`);
    }
  }
  assert.deepEqual(missing, []);
  for (const required of [
    "beta_access",
    "legal_acceptances",
    "ask_conversations",
    "ask_messages",
    "transaction_pattern_confirmations",
    "source_lifecycle_jobs",
    "money_buckets",
    "money_bucket_allocations",
  ]) {
    assert.ok(registered.has(required), required);
  }
});

function createViewNames(sql: string): string[] {
  const withoutLineComments = sql.replace(/--.*$/gm, "");
  const matcher = /create\s+(or\s+replace\s+)?(materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi;
  return [...withoutLineComments.matchAll(matcher)].map((match) => match[3].toLowerCase());
}

test("the deletion registry contains no views -- you cannot DELETE FROM a view", () => {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql"));
  const registered = new Set(registeredTableNames());

  const viewsFromMigrations: string[] = [];
  for (const file of files) {
    const sql = readFileSync(path.join(dir, file), "utf8");
    for (const name of createViewNames(sql)) viewsFromMigrations.push(name);
  }

  // home_status_latest predates migration tracking (no `create view` for it
  // exists in supabase/migrations), so it can't be caught by the scan above.
  // Confirmed via a live pg_class query during the 2026-10-29 RLS/deletion
  // audit that it is a view, not a table -- keep this list in sync with any
  // other pre-tracking view discovered the same way.
  const knownPreTrackingViews = ["home_status_latest"];

  const views = [...new Set([...viewsFromMigrations, ...knownPreTrackingViews])];
  const registeredViews = views.filter((name) => registered.has(name));
  assert.deepEqual(registeredViews, []);
});
