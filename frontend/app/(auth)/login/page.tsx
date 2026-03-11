import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { withGroupLogo } from "@/lib/group-logos";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { GroupRecord } from "@/types/domain";

export default async function LoginPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect("/map");
  }

  const { data: groups } = await supabase.rpc("list_groups");
  const publicCollaborationGroups = (((groups ?? []) as GroupRecord[]) ?? [])
    .map(withGroupLogo)
    .filter((group) => group.is_public && group.accepts_point_collaboration);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Mapa Rede Verde</p>
        <h1 className="title">Gestão ambiental georreferenciada</h1>
        <p className="subtitle">
          Acesse o mapa, os grupos, os pontos e o histórico de acompanhamento.
        </p>
        <LoginForm publicCollaborationGroups={publicCollaborationGroups} />
      </section>
    </main>
  );
}
