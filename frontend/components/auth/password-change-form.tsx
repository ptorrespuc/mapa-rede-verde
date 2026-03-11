"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function PasswordChangeForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

      setPassword("");
      setConfirmPassword("");
      toast.success("Senha atualizada com sucesso.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel atualizar a senha.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel stack-md">
      <div className="stack-xs">
        <p className="eyebrow">Conta</p>
        <h1 className="section-title">Trocar senha</h1>
        <p className="subtitle">
          Atualize sua senha sempre que quiser. A sessao atual continua valida depois da troca.
        </p>
      </div>

      <form className="form-stack" onSubmit={handleSubmit}>
        <div className="input-grid two">
          <div className="field">
            <label htmlFor="new-password">Nova senha</label>
            <input
              id="new-password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </div>
          <div className="field">
            <label htmlFor="confirm-password">Confirmar nova senha</label>
            <input
              id="confirm-password"
              minLength={8}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
          </div>
        </div>

        {errorMessage ? <p className="error">{errorMessage}</p> : null}

        <div className="form-actions">
          <button className="button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Salvando..." : "Salvar nova senha"}
          </button>
        </div>
      </form>
    </section>
  );
}
