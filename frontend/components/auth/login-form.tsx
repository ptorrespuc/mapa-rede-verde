"use client";

import { useEffect, useRef, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { GroupRecord } from "@/types/domain";

interface LoginFormProps {
  publicCollaborationGroups: GroupRecord[];
}

export function LoginForm({ publicCollaborationGroups }: LoginFormProps) {
  const canUsePublicSignup = publicCollaborationGroups.length > 0;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);

  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerMessage, setRegisterMessage] = useState<string | null>(null);
  const [registerErrorMessage, setRegisterErrorMessage] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const redirectingRef = useRef(false);

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

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSigningIn(false);
      return;
    }

    redirectToMap();
  }

  async function handleCollaboratorSignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegisterMessage(null);
    setRegisterErrorMessage(null);
    setIsRegistering(true);

    try {
      if (!canUsePublicSignup) {
        throw new Error("O cadastro publico esta indisponivel no momento.");
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
        setRegisterMessage("Cadastro concluido. Redirecionando para o mapa.");
        redirectToMap();
        return;
      }

      setInfoMessage(
        "Cadastro realizado. Confira seu e-mail para confirmar a conta e depois faca o login.",
      );
      setRegisterName("");
      setRegisterEmail("");
      setRegisterPassword("");
      setRegisterMessage(null);
      setShowRegisterForm(false);
    } catch (error) {
      setRegisterErrorMessage(
        error instanceof Error ? error.message : "Nao foi possivel concluir o cadastro.",
      );
    } finally {
      setIsRegistering(false);
    }
  }

  return (
    <div className="stack-lg">
      {!showRegisterForm ? (
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

          {canUsePublicSignup ? (
            <p className="auth-inline-note">
              Ainda nao tem conta?{" "}
              <button
                className="auth-link-button"
                onClick={() => {
                  setShowRegisterForm(true);
                  setInfoMessage(null);
                  setErrorMessage(null);
                  setRegisterMessage(null);
                  setRegisterErrorMessage(null);
                }}
                type="button"
              >
                Cadastre-se aqui
              </button>
            </p>
          ) : (
            <p className="auth-inline-note">
              O cadastro publico esta fechado no momento.
            </p>
          )}
        </form>
      ) : null}

      {canUsePublicSignup && showRegisterForm ? (
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
                  id="register-password"
                  minLength={8}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  required
                  type="password"
                  value={registerPassword}
                />
              </div>
            </div>

            {registerMessage ? <p className="success">{registerMessage}</p> : null}
            {registerErrorMessage ? <p className="error">{registerErrorMessage}</p> : null}

            <div className="form-actions">
              <button className="button-secondary" disabled={isRegistering} type="submit">
                {isRegistering ? "Cadastrando..." : "Quero colaborar"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
