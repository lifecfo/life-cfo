import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { supabase } from "./src/engine/adapters/supabase";
import {
  listInboxVisible,
  markInboxItemDone,
  snoozeInboxItem,
  reopenInboxItem,
} from "./src/engine/services/inboxActions";

async function ensureSignedIn(): Promise<string> {
  // 1) Try existing session first
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;

  const existingUserId = sessionData.session?.user?.id;
  if (existingUserId) return existingUserId;

  // 2) Fall back to env login (so you don't hardcode credentials in scripts)
  const email = process.env.DEV_EMAIL;
  const password = process.env.DEV_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Not signed in and DEV_EMAIL/DEV_PASSWORD not set.\n" +
        "Add DEV_EMAIL and DEV_PASSWORD to .env.local, or sign in via run-engine.ts first."
    );
  }

  console.log("Signing in via DEV_EMAIL/DEV_PASSWORD...");
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) throw signInErr;

  const userId = signInData.user?.id;
  if (!userId) throw new Error("No user returned from sign-in.");
  return userId;
}

async function main() {
  console.log("INBOX ACTIONS DEMO STARTED (SAFE MODE)");
  console.log("ENV CHECK", {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ? "present" : "missing",
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "present" : "missing",
    devEmail: process.env.DEV_EMAIL ? "present" : "missing",
    devPassword: process.env.DEV_PASSWORD ? "present" : "missing",
  });

  const userId = await ensureSignedIn();
  console.log("Signed in as:", userId);

  // 1) List visible inbox items
  console.log("\n1) Listing visible inbox items...");
  const items = await listInboxVisible(userId);
  console.log(`Visible items: ${items.length}`);
  console.log(
    items.map((i) => ({
      id: i.id,
      type: i.type,
      status: i.status,
      snoozed_until: i.snoozed_until ?? null,
      title: i.title,
    }))
  );

  if (items.length === 0) {
    console.log("\nNo visible items to act on.");
    console.log("DONE");
    return;
  }

  // Target: first visible item
  const target = items[0];
  console.log("\nTarget item selected (first visible):", {
    id: target.id,
    type: target.type,
    status: target.status,
    title: target.title,
  });

  // -------------------------------------------------------------------
  // SAFE MODE: Nothing changes unless you UNCOMMENT one action below.
  // -------------------------------------------------------------------

  // ACTION A) Mark DONE (destructive)
  // await markInboxItemDone(userId, target.id);
  // console.log("✅ Marked DONE:", target.id);

  // ACTION B) Snooze for 1 minute (safe)
  // const until = new Date(Date.now() + 60 * 1000).toISOString();
  // await snoozeInboxItem(userId, target.id, until);
  // console.log("😴 Snoozed until:", until);

  // ACTION C) Re-open item (if it was done/snoozed)
  // await reopenInboxItem(userId, target.id);
  // console.log("🔄 Re-opened:", target.id);

  // 2) List visible items again
  console.log("\n2) Listing visible inbox items again...");
  const items2 = await listInboxVisible(userId);
  console.log(`Visible items now: ${items2.length}`);
  console.log(
    items2.map((i) => ({
      id: i.id,
      type: i.type,
      status: i.status,
      snoozed_until: i.snoozed_until ?? null,
      title: i.title,
    }))
  );

  console.log("\nDONE");
}

main().catch((err) => {
  console.error("INBOX ACTIONS DEMO ERROR:", err);
});
