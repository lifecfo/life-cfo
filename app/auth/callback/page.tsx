"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      // For OAuth / PKCE flows, Supabase can exchange the code for a session.
      // If there is no code in the URL, this won't crash; it will just no-op.
      try {
        await supabase.auth.exchangeCodeForSession(window.location.href);
      } catch (e) {
        // ignore – we’ll still route onward
        console.error(e);
      } finally {
        router.replace("/inbox");
      }
    };

    run();
  }, [router]);

  return (
    <div style={{ padding: 24 }}>
      Finishing sign-in…
    </div>
  );
}
