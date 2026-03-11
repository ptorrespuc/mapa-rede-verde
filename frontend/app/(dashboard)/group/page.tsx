import { GroupManagementPanel } from "@/components/admin/group-management-panel";
import { requireUserContext } from "@/lib/auth";

export default async function GroupPage() {
  const context = await requireUserContext();
  const manageableGroups = context.groups.filter(
    (group) => group.my_role === "group_admin" || group.my_role === "super_admin",
  );

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Gestao de grupos</p>
          <h1>Associacao de usuarios</h1>
          <p className="subtitle">
            Vincule usuarios a um ou mais grupos e controle o papel operacional de cada um.
          </p>
        </div>
      </div>
      <GroupManagementPanel groups={manageableGroups} />
    </section>
  );
}
