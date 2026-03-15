"use client";

import { useEffect, useRef, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { GroupRecord } from "@/types/domain";

interface LoginFormProps {
  publicCollaborationGroups: GroupRecord[];
}

type AuthView = "login" | "register" | "forgot-password";

export function LoginForm({ publicCollaborationGroups }: LoginFormProps) {
  const canUsePublicSignup = publicCollaborationGroups.length > 0;
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [registerErrorMessage, setRegisterErrorMessage] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryErrorMessage, setRecoveryErrorMessage] = useState<string | null>(null);
  const [recoveryInfoMessage, setRecoveryInfoMessage] = useState<string | null>(null);
  const [isSendingRecovery, setIsSendingRecovery] = useState(false);
  const redirectingRef = useRef(false);

  function resetMessages() {
    setInfoMessage(null);
    setErrorMessage(null);
    setRegisterErrorMessage(null);
    setRecoveryErrorMessage(null);
    setRecoveryInfoMessage(null);
  }

  function openView(nextView: AuthView) {
    resetMessages();
    setView(nextView);
  }

  function redirectToMap() {
    if (redirectingRef.current || typeof window === "undefined") {
      return;
    }

    redirectingRef.current = true;
    window.location.replace("/map");
  }

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let isMounted = true;

    async function redirectIfAuthenticated() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted || !session) {
        return;
      }

      redirectToMap();
    }

    void redirectIfAuthenticated();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted || !session) {
        return;
      }

      redirectToMap();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInfoMessage(null);
    setErrorMessage(null);
    setIsSigningIn(true);
    redirectingRef.current = false;

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      redirectToMap();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel entrar.");
    } finally {
      setIsSigningIn(false);
    }
  }

  async function handleCollaboratorSignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegisterErrorMessage(null);
    setIsRegistering(true);

    try {
      if (!canUsePublicSignup) {
        throw new Error("O cadastro publico esta indisponivel no momento.");
      }

      if (registerPassword.trim().length < 8) {
        throw new Error("A senha precisa ter pelo menos 8 caracteres.");
      }

      if (registerPassword !== registerConfirmPassword) {
        throw new Error("A confirmacao da senha precisa ser igual a senha informada.");
      }

      const supabase = createBrowserSupabaseClient();
      const emailRedirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;
      const { data, error } = await supabase.auth.signUp({
        email: registerEmail.trim(),
        password: registerPassword,
        options: {
          data: {
            name: registerName.trim(),
          },
          emailRedirectTo,
        },
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        setInfoMessage("Cadastro concluido. Redirecionando para o mapa.");
        redirectToMap();
        return;
      }

      setRegisterName("");
      setRegisterEmail("");
      setRegisterPassword("");
      setRegisterConfirmPassword("");
      setInfoMessage(
        "Cadastro realizado. Confira seu e-mail para confirmar a conta e depois faca o login.",
      );
      setView("login");
    } catch (error) {
      setRegisterErrorMessage(
        error instanceof Error ? error.message : "Nao foi possivel concluir o cadastro.",
      );
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleForgotPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRecoveryErrorMessage(null);
    setRecoveryInfoMessage(null);
    setIsSendingRecovery(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(recoveryEmail.trim(), {
        redirectTo,
      });

      if (error) {
        throw error;
      }

      setRecoveryEmail("");
      setInfoMessage(
        "Se existir uma conta para esse e-mail, voce recebera um link de recuperacao.",
      );
      setRecoveryInfoMessage(
        "Se existir uma conta para esse e-mail, voce recebera um link de recuperacao.",
      );
      setView("login");
    } catch (error) {
      setRecoveryErrorMessage(
        error instanceof Error ? error.message : "Nao foi possivel enviar o link de recuperacao.",
      );
    } finally {
      setIsSendingRecovery(false);
    }
  }

  return (
    <div className="stack-lg">
      {view === "login" ? (
        <form className="form-stack" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="usuario@organizacao.org"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
              required
            />
          </div>

          {infoMessage ? <p className="success">{infoMessage}</p> : null}
          {errorMessage ? <p className="error">{errorMessage}</p> : null}

          <div className="form-actions">
            <button className="button" type="submit" disabled={isSigningIn}>
              {isSigningIn ? "Entrando..." : "Entrar"}
            </button>
          </div>

          <div className="stack-xs">
            <p className="auth-inline-note">
              Esqueceu a senha?{" "}
              <button
                className="auth-link-button"
                onClick={() => openView("forgot-password")}
                type="button"
              >
                Recuperar acesso
              </button>
            </p>
            {canUsePublicSignup ? (
              <p className="auth-inline-note">
                Ainda nao tem conta?{" "}
                <button
                  className="auth-link-button"
                  onClick={() => openView("register")}
                  type="button"
                >
                  Cadastre-se aqui
                </button>
              </p>
            ) : (
              <p className="auth-inline-note">O cadastro publico esta fechado no momento.</p>
            )}
          </div>
        </form>
      ) : null}

      {canUsePublicSignup && view === "register" ? (
        <section className="auth-section stack-md">
          <div className="stack-xs">
            <h2 className="section-title auth-section-title">Criar conta</h2>
            <p className="subtitle">
              Depois de confirmar seu e-mail, voce podera informar pontos em qualquer grupo publico
              que aceite colaboracao.
            </p>
          </div>

          <form className="form-stack" onSubmit={handleCollaboratorSignup}>
            <div className="field">
              <label htmlFor="register-name">Nome</label>
              <input
                id="register-name"
                onChange={(event) => setRegisterName(event.target.value)}
                required
                value={registerName}
              />
            </div>

            <div className="input-grid two">
              <div className="field">
                <label htmlFor="register-email">E-mail</label>
                <input
                  id="register-email"
                  onChange={(event) => setRegisterEmail(event.target.value)}
                  required
                  type="email"
                  value={registerEmail}
                />
              </div>
              <div className="field">
                <label htmlFor="register-password">Senha</label>
                <input
                  autoComplete="new-password"
                  id="register-password"
                  minLength={8}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  required
                  type="password"
                  value={registerPassword}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="register-confirm-password">Repetir senha</label>
              <input
                autoComplete="new-password"
                id="register-confirm-password"
                minLength={8}
                onChange={(event) => setRegisterConfirmPassword(event.target.value)}
                required
                type="password"
                value={registerConfirmPassword}
              />
            </div>

            {registerErrorMessage ? <p className="error">{registerErrorMessage}</p> : null}

            <div className="form-actions">
              <button className="button-secondary" disabled={isRegistering} type="submit">
                {isRegistering ? "Cadastrando..." : "Quero colaborar"}
              </button>
              <button
                className="button-ghost"
                disabled={isRegistering}
                onClick={() => openView("login")}
                type="button"
              >
                Voltar ao login
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {view === "forgot-password" ? (
        <section className="auth-section stack-md">
          <div className="stack-xs">
            <h2 className="section-title auth-section-title">Recuperar senha</h2>
            <p className="subtitle">
              Informe seu e-mail para receber o link de redefinicao da senha.
            </p>
          </div>

          <form className="form-stack" onSubmit={handleForgotPassword}>
            <div className="field">
              <label htmlFor="recovery-email">E-mail</label>
              <input
                id="recovery-email"
                onChange={(event) => setRecoveryEmail(event.target.value)}
                required
                type="email"
                value={recoveryEmail}
              />
            </div>

            {recoveryInfoMessage ? <p className="success">{recoveryInfoMessage}</p> : null}
            {recoveryErrorMessage ? <p className="error">{recoveryErrorMessage}</p> : null}

            <div className="form-actions">
              <button className="button-secondary" disabled={isSendingRecovery} type="submit">
                {isSendingRecovery ? "Enviando..." : "Enviar link"}
              </button>
              <button
                className="button-ghost"
                disabled={isSendingRecovery}
                onClick={() => openView("login")}
                type="button"
              >
                Voltar ao login
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
