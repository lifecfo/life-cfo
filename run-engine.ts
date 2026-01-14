import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { supabase } from "./src/engine/adapters/supabase";
import { runEngine } from "./src/engine/services/runEngine";

async function main() {
  console.log("RUNNER STARTED");
  console.log("ENV CHECK", {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ? "present" : "missing",
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "present" : "missing",
  });

  const email = process.env.DEV_EMAIL!;
  const password = process.env.DEV_PASSWORD!;


  console.log("Signing in...");
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) throw signInErr;

  const authedUserId = signInData.user?.id;
  console.log("Signed in as:", authedUserId);

  // Use authed user id (fallback only if something is weird)
  const userId = authedUserId ?? "e097a45e-f858-40e0-a45a-c9322543b12b";

  console.log("Running engine...");
  const result = await runEngine(userId, 1000, "2026-01-08");

  console.log("ENGINE RUN RESULT:");
  console.log(JSON.stringify(result, null, 2));

  console.log("Signing out...");
  await supabase.auth.signOut();

  console.log("DONE");
}

main().catch((err) => {
  console.error("ENGINE ERROR:", err);
});
