"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

interface SignOutButtonProps {
  className?: string;
}

export function SignOutButton({ className = "button-ghost" }: SignOutButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    document.cookie = "map_scope=; path=/; max-age=0; samesite=lax";

    startTransition(() => {
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <button className={className} onClick={handleSignOut} disabled={isPending} type="button">
      {isPending ? "Saindo..." : "Sair"}
    </button>
  );
}
