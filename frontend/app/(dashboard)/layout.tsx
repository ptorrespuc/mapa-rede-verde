import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUserContext } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const context = await getCurrentUserContext();

  return (
    <AppShell
      userEmail={context?.profile.email ?? null}
      userName={context?.profile.name ?? null}
      isAuthenticated={Boolean(context)}
      isSuperAdmin={context?.is_super_admin ?? false}
      hasGroupAdmin={context?.has_group_admin ?? false}
      hasPointWorkspace={context?.has_point_workspace ?? false}
    >
      {children}
    </AppShell>
  );
}
