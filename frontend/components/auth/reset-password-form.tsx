"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hashHint = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return window.location.hash;
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let isMounted = true;

    async function syncSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      setHasRecoverySession(Boolean(session));
      setIsCheckingSession(false);

      if (!session && !hashHint.includes("access_token")) {
        setErrorMessage("Link de recuperacao invalido ou expirado.");
      }
    }

    void syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) {
        return;
      }

      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(Boolean(session));
        setIsCheckingSession(false);
        setErrorMessage(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [hashHint]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (password.trim().length < 8) {
      setErrorMessage("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("A confirmacao da senha precisa ser igual a nova senha.");
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw error;
      }

      await supabase.auth.signOut();
      setInfoMessage("Senha redefinida com sucesso. Faca o login com a nova senha.");
      toast.success("Senha redefinida com sucesso.");
      window.setTimeout(() => {
        router.replace("/login");
      }, 1200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel redefinir a senha.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card stack-md">
        <div className="stack-xs">
          <p className="eyebrow">Mapa Rede Verde</p>
          <h1 className="title">Redefinir senha</h1>
          <p className="subtitle">
            Escolha uma nova senha para concluir a recuperacao de acesso.
          </p>
        </div>

        {isCheckingSession ? (
          <p className="muted">Validando o link de recuperacao...</p>
        ) : hasRecoverySession ? (
          <form className="form-stack" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="recovery-password">Nova senha</label>
              <input
                id="recovery-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>

            <div className="field">
              <label htmlFor="recovery-confirm-password">Confirmar nova senha</label>
              <input
                id="recovery-confirm-password"
                minLength={8}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </div>

            {infoMessage ? <p className="success">{infoMessage}</p> : null}
            {errorMessage ? <p className="error">{errorMessage}</p> : null}

            <div className="form-actions">
              <button className="button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Salvando..." : "Salvar nova senha"}
              </button>
            </div>
          </form>
        ) : (
          <div className="stack-sm">
            <p className="error">{errorMessage ?? "Link de recuperacao invalido ou expirado."}</p>
            <Link className="button-ghost" href="/login">
              Voltar ao login
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
