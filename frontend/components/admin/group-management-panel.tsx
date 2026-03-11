"use client";

import { useState } from "react";

import { apiClient } from "@/lib/api-client";
import {
  USER_ROLE_LABELS,
  USER_ROLE_OPTIONS,
  type GroupRecord,
  type UserRole,
} from "@/types/domain";

interface GroupManagementPanelProps {
  groups: GroupRecord[];
}

export function GroupManagementPanel({ groups }: GroupManagementPanelProps) {
  const assignableRoles = USER_ROLE_OPTIONS.filter((option) => option.value !== "super_admin");
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id ?? "");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<UserRole>("group_collaborator");
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await apiClient.addUserToGroup(selectedGroupId, { userId, role });
      setMessage(
        `Usuario ${result.user_id} associado ao grupo ${result.group_id} como ${
          USER_ROLE_LABELS[result.role as UserRole] ?? result.role
        }.`,
      );
      setUserId("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel associar o usuario.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!groups.length) {
    return (
      <div className="panel stack-sm">
        <h2 className="section-title">Sem grupos administraveis</h2>
        <p className="subtitle">
          E necessario ser `group_admin` ou `super_admin` para usar este painel.
        </p>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <div className="overview-grid">
        <article className="overview-card primary">
          <span className="muted">Grupos administraveis</span>
          <strong>{groups.length}</strong>
          <span className="muted">Escopo atual do seu usuario</span>
        </article>
        <article className="overview-card soft">
          <span className="muted">Grupos publicos</span>
          <strong>{groups.filter((group) => group.is_public).length}</strong>
          <span className="muted">Com vitrine publica habilitada</span>
        </article>
        <article className="overview-card earth">
          <span className="muted">Grupos privados</span>
          <strong>{groups.filter((group) => !group.is_public).length}</strong>
          <span className="muted">Operacao restrita por associacao</span>
        </article>
        <article className="overview-card primary">
          <span className="muted">Multigrupo</span>
          <strong>Liberado</strong>
          <span className="muted">Um usuario pode participar de varios grupos</span>
        </article>
      </div>

      <div className="split-layout">
        <section className="panel stack-md">
          <div className="panel-header">
            <div className="stack-xs">
              <h2 className="section-title">Associar usuario ao grupo</h2>
              <p className="subtitle">
                Use o `public.users.id` para adicionar o usuario a outro grupo.
              </p>
            </div>
            <span className="badge">Vinculo</span>
          </div>

          <div className="surface-subtle">
            <span className="muted">
              O papel define se a pessoa apenas opera ou se tambem administra o grupo.
            </span>
          </div>

          <form className="form-stack" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="managed-group">Grupo</label>
              <select
                id="managed-group"
                value={selectedGroupId}
                onChange={(event) => setSelectedGroupId(event.target.value)}
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="group-user-id">ID publico do usuario</label>
              <input
                id="group-user-id"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="UUID de public.users.id"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="group-role">Papel no grupo</label>
              <select
                id="group-role"
                value={role}
                onChange={(event) => setRole(event.target.value as UserRole)}
              >
                {assignableRoles.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {message ? <p className="success">{message}</p> : null}
            {errorMessage ? <p className="error">{errorMessage}</p> : null}

            <div className="form-actions">
              <button className="button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Salvando..." : "Associar usuario"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel stack-md">
          <div className="panel-header">
            <div className="stack-xs">
              <h2 className="section-title">Regras deste painel</h2>
              <p className="subtitle">Resumo operacional inspirado no fluxo do Plantnet.</p>
            </div>
            <span className="badge">Guia rapido</span>
          </div>

          <div className="surface-subtle stack-sm">
            <span className="muted">1. O usuario precisa existir em `public.users`.</span>
            <span className="muted">2. O mesmo usuario pode entrar em varios grupos.</span>
            <span className="muted">
              3. `group_admin` administra, `group_approver` aprova pontos e `group_collaborator`
              opera como colaborador.
            </span>
            <span className="muted">
              4. Usuarios autenticados tambem podem colaborar em grupos publicos com colaboracao aberta.
            </span>
          </div>
        </section>
      </div>

      <section className="list-card">
        <div className="panel-header">
          <div className="stack-xs">
            <h2 className="section-title">Grupos administraveis</h2>
            <p className="subtitle">Visibilidade, papel atual e identificador de cada grupo.</p>
          </div>
          <span className="badge">{groups.length} grupos</span>
        </div>

        <div className="list list-spaced">
          {groups.map((group) => (
            <div className="list-row" key={group.id}>
              <div className="stack-xs">
                <strong>{group.name}</strong>
                <span className="muted">{group.id}</span>
              </div>
              <span className="badge">
                {group.is_public ? "publico" : "privado"} ·{" "}
                {group.my_role ? USER_ROLE_LABELS[group.my_role] : USER_ROLE_LABELS.group_admin}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
