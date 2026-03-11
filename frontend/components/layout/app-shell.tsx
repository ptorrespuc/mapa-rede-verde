"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  KeyRound,
  Leaf,
  List,
  Map,
  Shield,
  type LucideIcon,
} from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";

interface AppShellProps {
  userName: string | null;
  userEmail: string | null;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  hasGroupAdmin: boolean;
  hasPointWorkspace: boolean;
  children: React.ReactNode;
}

export function AppShell({
  userName,
  userEmail,
  isAuthenticated,
  isSuperAdmin,
  hasGroupAdmin,
  hasPointWorkspace,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const navItems: Array<{ href: string; label: string; icon: LucideIcon }> = [
    { href: "/map", label: "Mapa", icon: Map },
    ...(isAuthenticated && hasPointWorkspace
      ? [{ href: "/points", label: "Pontos", icon: List }]
      : []),
    ...(isAuthenticated ? [{ href: "/notifications", label: "Notificacoes", icon: Bell }] : []),
    ...(isSuperAdmin || hasGroupAdmin
      ? [{ href: "/admin", label: "Administracao", icon: Shield }]
      : []),
  ];

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div className="topbar-main">
          <div className="topbar-leading">
            <div className="brand-block">
              <span className="brand-kicker">Gestao geoambiental</span>
              <Link className="brand-link" href="/map">
                <h1 className="brand-title">
                  <Leaf aria-hidden="true" size={16} />
                  <span>Mapa Rede Verde</span>
                </h1>
              </Link>
            </div>

            <nav className="nav">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link${pathname === item.href || pathname.startsWith(`${item.href}/`) ? " active" : ""}`}
                >
                  <item.icon aria-hidden="true" size={15} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>

          <div className="topbar-user">
            <div className="topbar-user-card topbar-user-inline">
              {isAuthenticated ? (
                <>
                  <strong>{userName ?? "Usuario"}</strong>
                  {userEmail ? <span className="muted">{userEmail}</span> : null}
                </>
              ) : (
                <>
                  <strong>Acesso publico</strong>
                  <span className="muted">Somente grupos e pontos publicos</span>
                </>
              )}
            </div>

            {isAuthenticated ? (
              <>
                <Link className="button-ghost" href="/account/password">
                  <KeyRound aria-hidden="true" size={15} />
                  <span>Trocar senha</span>
                </Link>
                <SignOutButton />
              </>
            ) : (
              <Link className="button-ghost" href="/login">
                Entrar
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="content-area">{children}</main>
    </div>
  );
}
