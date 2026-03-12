"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronDown,
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
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    }

    if (!isAccountMenuOpen) {
      return;
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isAccountMenuOpen]);

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
            {isAuthenticated ? (
              <div className="topbar-account-menu" ref={accountMenuRef}>
                <button
                  aria-expanded={isAccountMenuOpen}
                  className="topbar-user-card topbar-user-inline topbar-account-trigger"
                  onClick={() => setIsAccountMenuOpen((current) => !current)}
                  type="button"
                >
                  <strong>{userName ?? "Usuario"}</strong>
                  {userEmail ? <span className="muted">{userEmail}</span> : null}
                  <ChevronDown
                    aria-hidden="true"
                    className={`topbar-account-chevron${isAccountMenuOpen ? " open" : ""}`}
                    size={15}
                  />
                </button>

                {isAccountMenuOpen ? (
                  <div className="topbar-account-dropdown">
                    <Link
                      className="topbar-account-item"
                      href="/account/password"
                      onClick={() => setIsAccountMenuOpen(false)}
                    >
                      <KeyRound aria-hidden="true" size={15} />
                      <span>Trocar senha</span>
                    </Link>
                    <SignOutButton className="topbar-account-item danger" />
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="topbar-user-card topbar-user-inline">
                  <strong>Acesso publico</strong>
                  <span className="muted">Somente grupos e pontos publicos</span>
                </div>
                <Link className="button-ghost" href="/login">
                  Entrar
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="content-area">{children}</main>
    </div>
  );
}
