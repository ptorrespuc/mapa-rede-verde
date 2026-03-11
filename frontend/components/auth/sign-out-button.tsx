"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();

    startTransition(() => {
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <button className="button-ghost" onClick={handleSignOut} disabled={isPending} type="button">
      {isPending ? "Saindo..." : "Sair"}
    </button>
  );
}
