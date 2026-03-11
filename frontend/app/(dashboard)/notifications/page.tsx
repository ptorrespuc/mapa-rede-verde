import Link from "next/link";

import { requireUserContext } from "@/lib/auth";
import { listApprovalNotificationsForUser } from "@/lib/server/approval-notification-service";

export default async function NotificationsPage() {
  const context = await requireUserContext();
  const notifications = await listApprovalNotificationsForUser(context.profile.id);

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Acompanhamento</p>
          <h1>Notificacoes</h1>
          <p className="subtitle">
            Aprovacoes feitas por outro usuario em pontos criados por voce.
          </p>
        </div>
      </div>

      <section className="list-card stack-md">
        {!notifications.length ? (
          <div className="surface-subtle">
            <span className="muted">
              Ainda nao ha aprovacoes de outros usuarios para pontos criados por voce.
            </span>
          </div>
        ) : (
          <div className="list">
            {notifications.map((notification) => (
              <article className="list-row" key={notification.id}>
                <div className="stack-xs">
                  <div className="point-meta">
                    <span className="badge">{notification.event_type}</span>
                    <span className="muted">
                      {new Date(notification.event_date).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <strong>{notification.point_title}</strong>
                  <span className="muted">
                    Aprovado por {notification.actor_name}
                  </span>
                  {notification.description ? (
                    <span className="muted">{notification.description}</span>
                  ) : null}
                </div>
                <div className="form-actions">
                  <Link className="button-ghost" href={`/points/${notification.point_id}`}>
                    Abrir ponto
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
