"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { GroupLogoEditor } from "@/components/admin/group-logo-editor";
import { AdminModal } from "@/components/admin/admin-modal";
import { PointTagBadges } from "@/components/points/point-tag-badges";
import { apiClient } from "@/lib/api-client";
import {
  USER_ROLE_LABELS,
  USER_ROLE_OPTIONS,
  type AdminUserGroupMembership,
  type AdminUserRecord,
  type GroupRecord,
  type PointClassificationRecord,
  type PointEventTypeRecord,
  type PointTagRecord,
  type SpeciesRecord,
  type UpdateAdminUserPayload,
  type UserRole,
} from "@/types/domain";

type AdminSection =
  | "groups"
  | "users"
  | "classifications"
  | "tags"
  | "event-types"
  | "species";
type ModalMode = "create" | "edit";

interface AdminPanelProps {
  canCreateGroups: boolean;
  canEditUserIdentity: boolean;
  canInviteUsers: boolean;
  canManageGlobalCatalogs: boolean;
  manageableGroupIds: string[];
  initialGroups: GroupRecord[];
  initialUsers: AdminUserRecord[];
  initialClassifications: PointClassificationRecord[];
  initialPointTags: PointTagRecord[];
  initialEventTypes: PointEventTypeRecord[];
  initialSpeciesCatalog: SpeciesRecord[];
  initialSection?: AdminSection;
  initialSpeciesCommonName?: string;
}

interface UserCredentials {
  publicUserId: string;
  email: string;
  inviteSent: boolean;
}

interface EditableUserMembership {
  groupId: string;
  role: UserRole;
}

interface UserFormSeed {
  name?: string;
  email?: string;
  groupId?: string;
  preferredGroupId?: string | null;
  preferredGroupHidden?: boolean;
  role?: UserRole;
  memberships?: Array<EditableUserMembership | AdminUserGroupMembership>;
}

const SECTION_OPTIONS: Array<{ id: AdminSection; label: string }> = [
  { id: "groups", label: "Grupos" },
  { id: "users", label: "Usuarios" },
  { id: "classifications", label: "Classificacoes" },
  { id: "event-types", label: "Tipos de evento" },
  { id: "species", label: "Especies" },
];

function sortByLocale<T>(items: T[], selector: (item: T) => string) {
  return [...items].sort((a, b) => selector(a).localeCompare(selector(b), "pt-BR"));
}

function sortEventTypes(items: PointEventTypeRecord[]) {
  return [...items].sort((a, b) => {
    const byClassification = a.point_classification_name.localeCompare(
      b.point_classification_name,
      "pt-BR",
    );
    return byClassification !== 0 ? byClassification : a.name.localeCompare(b.name, "pt-BR");
  });
}

function sortPointTags(items: PointTagRecord[]) {
  return [...items].sort((a, b) => {
    const byClassification = (a.point_classification_name ?? "").localeCompare(
      b.point_classification_name ?? "",
      "pt-BR",
    );

    return byClassification !== 0 ? byClassification : a.name.localeCompare(b.name, "pt-BR");
  });
}

function getDefaultEventTypeClassificationId(
  items: Array<Pick<PointClassificationRecord, "id" | "is_active">>,
) {
  return items.find((item) => item.is_active)?.id ?? items[0]?.id ?? "";
}

export function AdminPanel({
  canCreateGroups,
  canEditUserIdentity,
  canInviteUsers,
  canManageGlobalCatalogs,
  manageableGroupIds,
  initialGroups,
  initialUsers,
  initialClassifications,
  initialPointTags,
  initialEventTypes,
  initialSpeciesCatalog,
  initialSection = "groups",
  initialSpeciesCommonName = "",
}: AdminPanelProps) {
  const [activeSection, setActiveSection] = useState<AdminSection>(initialSection);
  const [groups, setGroups] = useState(() => sortByLocale(initialGroups, (item) => item.name));
  const [users, setUsers] = useState(() => sortByLocale(initialUsers, (item) => item.name));
  const [classifications, setClassifications] = useState(() =>
    sortByLocale(initialClassifications, (item) => item.name),
  );
  const [pointTags, setPointTags] = useState(() => sortPointTags(initialPointTags));
  const [eventTypes, setEventTypes] = useState(() => sortEventTypes(initialEventTypes));
  const [speciesCatalog, setSpeciesCatalog] = useState(() =>
    sortByLocale(initialSpeciesCatalog, (item) => item.common_name),
  );

  const [modalSection, setModalSection] = useState<AdminSection | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tagModalReturnClassificationId, setTagModalReturnClassificationId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState<UserCredentials | null>(null);
  const [initialSpeciesPrefillUsed, setInitialSpeciesPrefillUsed] = useState(false);

  const [groupName, setGroupName] = useState("");
  const [groupCode, setGroupCode] = useState("");
  const [groupIsPublic, setGroupIsPublic] = useState(false);
  const [groupAcceptsPointCollaboration, setGroupAcceptsPointCollaboration] = useState(false);
  const [groupMaxPendingPointsPerCollaborator, setGroupMaxPendingPointsPerCollaborator] = useState(5);
  const [groupLogoFile, setGroupLogoFile] = useState<File | null>(null);
  const [groupLogoPreviewUrl, setGroupLogoPreviewUrl] = useState<string | null>(null);
  const [groupRemoveLogo, setGroupRemoveLogo] = useState(false);

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userGroupId, setUserGroupId] = useState(initialGroups[0]?.id ?? "");
  const [userRole, setUserRole] = useState<UserRole>("group_collaborator");
  const [userPreferredGroupId, setUserPreferredGroupId] = useState(initialGroups[0]?.id ?? "");
  const [userPreferredGroupDirty, setUserPreferredGroupDirty] = useState(false);
  const [userPreferredGroupHidden, setUserPreferredGroupHidden] = useState(false);
  const [userMemberships, setUserMemberships] = useState<EditableUserMembership[]>(() =>
    initialGroups[0]
      ? [
          {
            groupId: initialGroups[0].id,
            role: "group_collaborator",
          },
        ]
      : [],
  );

  const [classificationName, setClassificationName] = useState("");
  const [classificationSlug, setClassificationSlug] = useState("");
  const [classificationRequiresSpecies, setClassificationRequiresSpecies] = useState(false);
  const [classificationIsActive, setClassificationIsActive] = useState(true);
  const [classificationMarkerColor, setClassificationMarkerColor] = useState("#6a5a91");

  const [tagName, setTagName] = useState("");
  const [tagSlug, setTagSlug] = useState("");
  const [tagDescription, setTagDescription] = useState("");
  const [tagClassificationId, setTagClassificationId] = useState("");
  const [tagIsActive, setTagIsActive] = useState(true);

  const [eventTypeName, setEventTypeName] = useState("");
  const [eventTypeSlug, setEventTypeSlug] = useState("");
  const [eventTypeClassificationId, setEventTypeClassificationId] = useState(
    getDefaultEventTypeClassificationId(initialClassifications),
  );

  const [speciesCommonName, setSpeciesCommonName] = useState(initialSpeciesCommonName);
  const [speciesScientificName, setSpeciesScientificName] = useState("");
  const [speciesOrigin, setSpeciesOrigin] = useState<"native" | "exotic">("native");
  const [speciesIsActive, setSpeciesIsActive] = useState(true);
  const [speciesFilterText, setSpeciesFilterText] = useState("");
  const [showNativeSpecies, setShowNativeSpecies] = useState(true);
  const [showExoticSpecies, setShowExoticSpecies] = useState(true);

  const canCreateUsers = canInviteUsers && groups.length > 0;
  const manageableGroupIdSet = useMemo(
    () => new Set(manageableGroupIds),
    [manageableGroupIds],
  );
  const editableGroups = useMemo(
    () =>
      groups.filter((group) => canCreateGroups || manageableGroupIdSet.has(group.id)),
    [canCreateGroups, groups, manageableGroupIdSet],
  );
  const assignableUserRoleOptions = useMemo(
    () =>
      canEditUserIdentity
        ? USER_ROLE_OPTIONS
        : USER_ROLE_OPTIONS.filter((option) => option.value !== "super_admin"),
    [canEditUserIdentity],
  );
  const activeClassifications = useMemo(
    () => classifications.filter((classification) => classification.is_active),
    [classifications],
  );
  const availableSections = useMemo(
    () =>
      canManageGlobalCatalogs
        ? SECTION_OPTIONS
        : SECTION_OPTIONS.filter(
            (section) => section.id === "groups" || section.id === "users",
          ),
    [canManageGlobalCatalogs],
  );
  const editingUser = useMemo(
    () => (editingId ? users.find((user) => user.id === editingId) ?? null : null),
    [editingId, users],
  );
  const userPreferredGroupOptions = useMemo(() => {
    const groupIds = Array.from(
      new Set(userMemberships.map((membership) => membership.groupId).filter(Boolean)),
    );

    return groupIds
      .map((groupId) => groups.find((group) => group.id === groupId) ?? null)
      .filter((group): group is GroupRecord => group !== null);
  }, [groups, userMemberships]);
  const eventTypeClassificationOptions =
    modalMode === "create" && activeClassifications.length > 0
      ? activeClassifications
      : classifications;
  const tagClassificationOptions =
    modalMode === "create" && activeClassifications.length > 0
      ? activeClassifications
      : classifications;
  const filteredSpeciesCatalog = useMemo(() => {
    const query = speciesFilterText.trim().toLowerCase();

    return speciesCatalog.filter((species) => {
      if (species.origin === "native" && !showNativeSpecies) {
        return false;
      }

      if (species.origin === "exotic" && !showExoticSpecies) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [species.display_name, species.common_name, species.scientific_name].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }, [showExoticSpecies, showNativeSpecies, speciesCatalog, speciesFilterText]);
  const pointTagsByClassificationId = useMemo(() => {
    const grouped = new Map<string, PointTagRecord[]>();

    for (const tag of pointTags) {
      const current = grouped.get(tag.point_classification_id) ?? [];
      current.push(tag);
      grouped.set(tag.point_classification_id, current);
    }

    for (const [classificationId, tags] of grouped.entries()) {
      grouped.set(classificationId, sortPointTags(tags));
    }

    return grouped;
  }, [pointTags]);
  const selectedClassificationTags = useMemo(() => {
    if (modalSection !== "classifications" || !editingId) {
      return [] as PointTagRecord[];
    }

    return pointTagsByClassificationId.get(editingId) ?? [];
  }, [editingId, modalSection, pointTagsByClassificationId]);

  const modalTitle = useMemo(() => {
    if (!modalSection) return "";
    const action = modalMode === "create" ? "Novo" : "Editar";
    if (modalSection === "groups") return `${action} grupo`;
    if (modalSection === "users") return `${action} usuario`;
    if (modalSection === "classifications") return `${action} classificacao`;
    if (modalSection === "tags") return `${action} tag`;
    if (modalSection === "event-types") return `${action} tipo de evento`;
    return `${action} especie`;
  }, [modalMode, modalSection]);

  useEffect(() => {
    if (
      initialSpeciesPrefillUsed ||
      !canManageGlobalCatalogs ||
      initialSection !== "species" ||
      !initialSpeciesCommonName.trim()
    ) {
      return;
    }

    setInitialSpeciesPrefillUsed(true);
    setActiveSection("species");
    setModalSection("species");
    setModalMode("create");
    setEditingId(null);
    setErrorMessage(null);
    setSpeciesCommonName(initialSpeciesCommonName.trim());
    setSpeciesScientificName("");
    setSpeciesOrigin("native");
    setSpeciesIsActive(true);
  }, [
    canManageGlobalCatalogs,
    initialSection,
    initialSpeciesCommonName,
    initialSpeciesPrefillUsed,
  ]);

  useEffect(() => {
    if (availableSections.some((section) => section.id === activeSection)) {
      return;
    }

    setActiveSection(availableSections[0]?.id ?? "groups");
  }, [activeSection, availableSections]);

  function resetGroupForm(
    seed?: Partial<{
      name: string;
      code: string;
      isPublic: boolean;
      acceptsPointCollaboration: boolean;
      maxPendingPointsPerCollaborator: number;
      logoUrl: string | null;
    }>,
  ) {
    setGroupName(seed?.name ?? "");
    setGroupCode(seed?.code ?? "");
    setGroupIsPublic(seed?.isPublic ?? false);
    setGroupAcceptsPointCollaboration(seed?.acceptsPointCollaboration ?? false);
    setGroupMaxPendingPointsPerCollaborator(seed?.maxPendingPointsPerCollaborator ?? 5);
    setGroupLogoFile(null);
    setGroupLogoPreviewUrl(seed?.logoUrl ?? null);
    setGroupRemoveLogo(false);
  }

  function createEmptyUserMembership(
    seed?: Partial<EditableUserMembership | AdminUserGroupMembership>,
  ): EditableUserMembership {
    const source = (seed ?? {}) as Partial<EditableUserMembership> &
      Partial<AdminUserGroupMembership>;

    return {
      groupId: source.groupId ?? source.group_id ?? editableGroups[0]?.id ?? groups[0]?.id ?? "",
      role: source.role ?? "group_collaborator",
    };
  }

  function resetUserForm(seed?: UserFormSeed) {
    setUserName(seed?.name ?? "");
    setUserEmail(seed?.email ?? "");
    setUserGroupId(seed?.groupId ?? editableGroups[0]?.id ?? groups[0]?.id ?? "");
    setUserPreferredGroupId(
      seed?.preferredGroupId ?? seed?.groupId ?? editableGroups[0]?.id ?? groups[0]?.id ?? "",
    );
    setUserPreferredGroupDirty(false);
    setUserPreferredGroupHidden(seed?.preferredGroupHidden ?? false);
    setUserRole(seed?.role ?? "group_collaborator");
    if (seed?.memberships) {
      setUserMemberships(
        seed.memberships.map((membership) => createEmptyUserMembership(membership)),
      );
      return;
    }

    setUserMemberships(editableGroups[0] || groups[0] ? [createEmptyUserMembership()] : []);
  }

  useEffect(() => {
    if (userPreferredGroupHidden && !userPreferredGroupDirty) {
      return;
    }

    if (!userPreferredGroupOptions.length) {
      if (userPreferredGroupId !== "") {
        setUserPreferredGroupId("");
      }
      return;
    }

    if (!userPreferredGroupOptions.some((group) => group.id === userPreferredGroupId)) {
      setUserPreferredGroupId(userPreferredGroupOptions[0]?.id ?? "");
    }
  }, [
    userPreferredGroupDirty,
    userPreferredGroupHidden,
    userPreferredGroupId,
    userPreferredGroupOptions,
  ]);

  function resetClassificationForm(
    seed?: Partial<{
      name: string;
      slug: string;
      requiresSpecies: boolean;
      isActive: boolean;
      markerColor: string;
    }>,
  ) {
    setClassificationName(seed?.name ?? "");
    setClassificationSlug(seed?.slug ?? "");
    setClassificationRequiresSpecies(seed?.requiresSpecies ?? false);
    setClassificationIsActive(seed?.isActive ?? true);
    setClassificationMarkerColor(seed?.markerColor ?? "#6a5a91");
  }

  function resetTagForm(
    seed?: Partial<{
      pointClassificationId: string;
      name: string;
      slug: string;
      description: string | null;
      isActive: boolean;
    }>,
  ) {
    setTagClassificationId(
      seed?.pointClassificationId ?? getDefaultEventTypeClassificationId(classifications),
    );
    setTagName(seed?.name ?? "");
    setTagSlug(seed?.slug ?? "");
    setTagDescription(seed?.description ?? "");
    setTagIsActive(seed?.isActive ?? true);
  }

  function resetEventTypeForm(
    seed?: Partial<{ pointClassificationId: string; name: string; slug: string }>,
  ) {
    setEventTypeClassificationId(
      seed?.pointClassificationId ?? getDefaultEventTypeClassificationId(classifications),
    );
    setEventTypeName(seed?.name ?? "");
    setEventTypeSlug(seed?.slug ?? "");
  }

  function resetSpeciesForm(
    seed?: Partial<{
      commonName: string;
      scientificName: string;
      origin: "native" | "exotic";
      isActive: boolean;
    }>,
  ) {
    setSpeciesCommonName(seed?.commonName ?? "");
    setSpeciesScientificName(seed?.scientificName ?? "");
    setSpeciesOrigin(seed?.origin ?? "native");
    setSpeciesIsActive(seed?.isActive ?? true);
  }

  function closeModal() {
    if (modalSection === "tags" && tagModalReturnClassificationId) {
      const classificationId = tagModalReturnClassificationId;
      setTagModalReturnClassificationId(null);
      openEditModal("classifications", classificationId);
      return;
    }

    setModalSection(null);
    setModalMode("create");
    setEditingId(null);
    setErrorMessage(null);
    setIsSubmitting(false);
  }

  function openCreateTagModal(classificationId?: string) {
    setActiveSection("classifications");
    setModalSection("tags");
    setModalMode("create");
    setEditingId(null);
    setErrorMessage(null);
    setTagModalReturnClassificationId(classificationId ?? null);
    resetTagForm({
      pointClassificationId: classificationId ?? getDefaultEventTypeClassificationId(classifications),
    });
  }

  function openEditTagModal(tagId: string, classificationId?: string) {
    const tag = pointTags.find((item) => item.id === tagId);

    if (!tag) {
      return;
    }

    setActiveSection("classifications");
    setModalSection("tags");
    setModalMode("edit");
    setEditingId(tagId);
    setErrorMessage(null);
    setTagModalReturnClassificationId(classificationId ?? tag.point_classification_id);
    resetTagForm({
      pointClassificationId: tag.point_classification_id,
      name: tag.name,
      slug: tag.slug,
      description: tag.description,
      isActive: tag.is_active,
    });
  }

  function openCreateModal(section: AdminSection, seed?: { commonName?: string }) {
    setActiveSection(section);
    setModalSection(section);
    setModalMode("create");
    setEditingId(null);
    setErrorMessage(null);

    if (section === "groups") resetGroupForm();
    if (section === "users") resetUserForm();
    if (section === "classifications") resetClassificationForm();
    if (section === "tags") resetTagForm();
    if (section === "event-types") resetEventTypeForm();
    if (section === "species") {
      resetSpeciesForm({ commonName: seed?.commonName ?? initialSpeciesCommonName });
    }
  }

  function openEditUserModal(id: string) {
    const user = users.find((item) => item.id === id);

    if (!user) {
      return;
    }

    setActiveSection("users");
    setModalSection("users");
    setModalMode("edit");
    setEditingId(id);
    setErrorMessage(null);
    resetUserForm({
      name: user.name,
      email: user.email,
      preferredGroupId: user.preferred_group_hidden ? null : user.preferred_group_id,
      preferredGroupHidden: user.preferred_group_hidden,
      memberships: canEditUserIdentity
        ? user.memberships
        : user.memberships.filter((membership) => manageableGroupIdSet.has(membership.group_id)),
    });
  }

  function canEditGroup(group: GroupRecord) {
    return canCreateGroups || manageableGroupIdSet.has(group.id);
  }

  function openEditModal(section: Exclude<AdminSection, "users">, id: string) {
    setActiveSection(section);
    setModalSection(section);
    setModalMode("edit");
    setEditingId(id);
    setErrorMessage(null);

    if (section === "groups") {
      const item = groups.find((group) => group.id === id);
      if (!item) return;
      if (!canEditGroup(item)) {
        return;
      }
      resetGroupForm({
        name: item.name,
        code: item.code,
        isPublic: item.is_public,
        acceptsPointCollaboration: item.accepts_point_collaboration,
        maxPendingPointsPerCollaborator: item.max_pending_points_per_collaborator,
        logoUrl: item.logo_url,
      });
      return;
    }

    if (section === "classifications") {
      const item = classifications.find((classification) => classification.id === id);
      if (!item) return;
      resetClassificationForm({
        name: item.name,
        slug: item.slug,
        requiresSpecies: item.requires_species,
        isActive: item.is_active,
        markerColor: item.marker_color,
      });
      return;
    }

    if (section === "tags") {
      const item = pointTags.find((tag) => tag.id === id);
      if (!item) return;
      resetTagForm({
        pointClassificationId: item.point_classification_id,
        name: item.name,
        slug: item.slug,
        description: item.description,
        isActive: item.is_active,
      });
      return;
    }

    if (section === "event-types") {
      const item = eventTypes.find((eventType) => eventType.id === id);
      if (!item) return;
      resetEventTypeForm({
        pointClassificationId: item.point_classification_id,
        name: item.name,
        slug: item.slug,
      });
      return;
    }

    const item = speciesCatalog.find((species) => species.id === id);
    if (!item) return;
    resetSpeciesForm({
      commonName: item.common_name,
      scientificName: item.scientific_name,
      origin: item.origin,
      isActive: item.is_active,
    });
  }

  function updateUserMembership(
    index: number,
    patch: Partial<EditableUserMembership>,
  ) {
    setUserMemberships((current) =>
      current.map((membership, membershipIndex) =>
        membershipIndex === index ? { ...membership, ...patch } : membership,
      ),
    );
  }

  function addUserMembership() {
    setUserMemberships((current) => [...current, createEmptyUserMembership()]);
  }

  function removeUserMembership(index: number) {
    setUserMemberships((current) =>
      current.filter((_, membershipIndex) => membershipIndex !== index),
    );
  }

  function normalizeUserMemberships(
    memberships: EditableUserMembership[],
  ): UpdateAdminUserPayload["memberships"] {
    const normalized = new Map<string, UserRole>();

    for (const membership of memberships) {
      const groupId = membership.groupId.trim();

      if (!groupId) {
        continue;
      }

      normalized.set(groupId, membership.role);
    }

    return Array.from(normalized.entries()).map(([groupId, role]) => ({
      groupId,
      role,
    }));
  }

  function renderEmpty(message: string) {
    return (
      <div className="surface-subtle">
        <span className="muted">{message}</span>
      </div>
    );
  }

  async function submitCurrentModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!modalSection) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (modalSection === "groups") {
        if (modalMode === "create" && !canCreateGroups) {
          throw new Error("Voce nao pode criar grupos.");
        }

        if (modalMode === "create") {
          const created = await apiClient.createGroup({
            name: groupName,
            code: groupCode || undefined,
            isPublic: groupIsPublic,
            acceptsPointCollaboration: groupAcceptsPointCollaboration,
            maxPendingPointsPerCollaborator: groupMaxPendingPointsPerCollaborator,
            logo: groupLogoFile ?? undefined,
          });
          setGroups((current) => sortByLocale([...current, created], (item) => item.name));
          setUserGroupId(created.id);
          toast.success("Grupo criado com sucesso.");
        } else if (editingId) {
          const updated = await apiClient.updateGroup(editingId, {
            name: groupName,
            code: groupCode || undefined,
            isPublic: groupIsPublic,
            acceptsPointCollaboration: groupAcceptsPointCollaboration,
            maxPendingPointsPerCollaborator: groupMaxPendingPointsPerCollaborator,
            logo: groupLogoFile ?? undefined,
            removeLogo: groupRemoveLogo,
          });
          setGroups((current) =>
            sortByLocale(
              current.map((item) => (item.id === editingId ? updated : item)),
              (item) => item.name,
            ),
          );
          toast.success("Grupo atualizado com sucesso.");
        }
      }

      if (modalSection === "users") {
        if (modalMode === "create" && !canInviteUsers) {
          throw new Error("Voce nao pode criar usuarios.");
        }

        if (modalMode === "create") {
          const created = await apiClient.createUser({
            name: userName,
            email: userEmail,
            groupId: userGroupId,
            preferredGroupId: userPreferredGroupId || userGroupId,
            role: userRole,
          });
          setGeneratedCredentials({
            publicUserId: created.publicUserId,
            email: created.email,
            inviteSent: created.inviteSent,
          });
          const initialGroup = groups.find((group) => group.id === created.groupId);
          setUsers((current) =>
            sortByLocale(
              [
                ...current,
                {
                  id: created.publicUserId,
                  auth_user_id: created.authUserId,
                  name: userName.trim(),
                  email: created.email,
                  created_at: new Date().toISOString(),
                  preferred_group_id: created.preferredGroupId ?? created.groupId,
                  preferred_group_name: initialGroup?.name ?? null,
                  preferred_group_code: initialGroup?.code ?? null,
                  preferred_group_hidden: false,
                  hidden_membership_count: 0,
                  memberships: initialGroup
                    ? [
                        {
                          group_id: initialGroup.id,
                          group_name: initialGroup.name,
                          group_code: initialGroup.code,
                          role: created.role as UserRole,
                        },
                      ]
                    : [],
                },
              ],
              (item) => item.name,
            ),
          );
          toast.success("Convite enviado por email.");
        } else if (editingId) {
          const updated = await apiClient.updateUser(editingId, {
            name: userName,
            email: userEmail,
            preferredGroupId:
              userPreferredGroupHidden && !userPreferredGroupDirty
                ? undefined
                : userPreferredGroupId || null,
            memberships: normalizeUserMemberships(userMemberships),
          });
          setUsers((current) =>
            sortByLocale(
              updated.memberships.length || canEditUserIdentity
                ? current.map((item) => (item.id === editingId ? updated : item))
                : current.filter((item) => item.id !== editingId),
              (item) => item.name,
            ),
          );
          toast.success("Usuario atualizado com sucesso.");
        }
      }

      if (modalSection === "classifications") {
        if (modalMode === "create") {
          const created = await apiClient.createPointClassification({
            name: classificationName,
            slug: classificationSlug || undefined,
            requiresSpecies: classificationRequiresSpecies,
            markerColor: classificationMarkerColor || undefined,
          });
          setClassifications((current) =>
            sortByLocale([...current, created], (item) => item.name),
          );
          toast.success("Classificacao criada com sucesso.");
          setActiveSection("classifications");
          setModalSection("classifications");
          setModalMode("edit");
          setEditingId(created.id);
          resetClassificationForm({
            name: created.name,
            slug: created.slug,
            requiresSpecies: created.requires_species,
            isActive: created.is_active,
            markerColor: created.marker_color,
          });
          return;
        } else if (editingId) {
          const updated = await apiClient.updatePointClassification(editingId, {
            name: classificationName,
            slug: classificationSlug || undefined,
            requiresSpecies: classificationRequiresSpecies,
            isActive: classificationIsActive,
            markerColor: classificationMarkerColor || undefined,
          });
          setClassifications((current) =>
            sortByLocale(
              current.map((item) => (item.id === editingId ? updated : item)),
              (item) => item.name,
            ),
          );
          setPointTags((current) =>
            sortPointTags(
              current.map((tag) =>
                tag.point_classification_id === editingId
                  ? { ...tag, point_classification_name: updated.name }
                  : tag,
              ),
            ),
          );
          toast.success("Classificacao atualizada com sucesso.");
        }
      }

      if (modalSection === "tags") {
        if (modalMode === "create") {
          const created = await apiClient.createPointTag({
            pointClassificationId: tagClassificationId,
            name: tagName,
            slug: tagSlug || undefined,
            description: tagDescription || undefined,
          });
          setPointTags((current) => sortPointTags([...current, created]));
          toast.success("Tag criada com sucesso.");
        } else if (editingId) {
          const updated = await apiClient.updatePointTag(editingId, {
            pointClassificationId: tagClassificationId,
            name: tagName,
            slug: tagSlug || undefined,
            description: tagDescription || null,
            isActive: tagIsActive,
          });
          setPointTags((current) =>
            sortPointTags(current.map((item) => (item.id === editingId ? updated : item))),
          );
          toast.success("Tag atualizada com sucesso.");
        }
      }

      if (modalSection === "event-types") {
        if (modalMode === "create") {
          const created = await apiClient.createPointEventType({
            pointClassificationId: eventTypeClassificationId,
            name: eventTypeName,
            slug: eventTypeSlug || undefined,
          });
          setEventTypes((current) => sortEventTypes([...current, created]));
          toast.success("Tipo de evento criado com sucesso.");
        } else if (editingId) {
          const updated = await apiClient.updatePointEventType(editingId, {
            pointClassificationId: eventTypeClassificationId,
            name: eventTypeName,
            slug: eventTypeSlug || undefined,
          });
          setEventTypes((current) =>
            sortEventTypes(current.map((item) => (item.id === editingId ? updated : item))),
          );
          toast.success("Tipo de evento atualizado com sucesso.");
        }
      }

      if (modalSection === "species") {
        if (modalMode === "create") {
          const created = await apiClient.createSpecies({
            commonName: speciesCommonName,
            scientificName: speciesScientificName,
            origin: speciesOrigin,
            isActive: speciesIsActive,
          });
          setSpeciesCatalog((current) =>
            sortByLocale([...current, created], (item) => item.common_name),
          );
          toast.success("Especie criada com sucesso.");
        } else if (editingId) {
          const updated = await apiClient.updateSpecies(editingId, {
            commonName: speciesCommonName,
            scientificName: speciesScientificName,
            origin: speciesOrigin,
            isActive: speciesIsActive,
          });
          setSpeciesCatalog((current) =>
            sortByLocale(
              current.map((item) => (item.id === editingId ? updated : item)),
              (item) => item.common_name,
            ),
          );
          toast.success("Especie atualizada com sucesso.");
        }
      }

      closeModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel salvar.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderGroupsSection() {
    return (
      <section className="list-card">
        <div className="panel-header">
          <div className="stack-xs">
            <h2 className="section-title">Grupos cadastrados</h2>
            <p className="subtitle">
              {canCreateGroups
                ? "A listagem fica limpa e as alteracoes abrem por modal."
                : "Voce pode visualizar os grupos em que participa, mas so edita os que administra."}
            </p>
          </div>
          <div className="button-row">
            <span className="badge">{groups.length}</span>
            {canCreateGroups ? (
              <button
                className="button-secondary"
                onClick={() => openCreateModal("groups")}
                type="button"
              >
                Novo grupo
              </button>
            ) : null}
          </div>
        </div>

        <div className="list list-spaced">
          {groups.length
            ? groups.map((group) => (
                <div className="list-row" key={group.id}>
                  <div className="stack-xs">
                    <div className="group-heading-row">
                      {group.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt={`Logo de ${group.name}`} className="group-logo" src={group.logo_url} />
                      ) : null}
                      <strong>{group.name}</strong>
                    </div>
                    <span className="muted">
                      Conta: @{group.code} | {group.id}
                    </span>
                    <span className="muted">
                      Limite de pendencias por colaborador: {group.max_pending_points_per_collaborator}
                    </span>
                  </div>
                  <div className="button-row">
                    <span className="badge">{group.is_public ? "publico" : "privado"}</span>
                    {group.accepts_point_collaboration ? (
                      <span className="badge">aceita colaboracao</span>
                    ) : null}
                    {canEditGroup(group) ? (
                      <button
                        className="button-ghost"
                        onClick={() => openEditModal("groups", group.id)}
                        type="button"
                      >
                        Editar
                      </button>
                    ) : (
                      <span className="muted">Somente leitura</span>
                    )}
                  </div>
                </div>
              ))
            : renderEmpty("Nenhum grupo cadastrado ainda.")}
        </div>
      </section>
    );
  }

  function renderUsersSection() {
    return (
      <section className="list-card stack-md">
        <div className="panel-header">
          <div className="stack-xs">
            <h2 className="section-title">Usuarios</h2>
            <p className="subtitle">
              {canEditUserIdentity
                ? "Listagem de usuarios cadastrados, com grupos e papeis."
                : "Usuarios vinculados aos grupos que voce administra."}
            </p>
          </div>
          <div className="button-row">
            <span className="badge">{users.length}</span>
            {canInviteUsers ? (
              <button
                className="button-secondary"
                disabled={!canCreateUsers}
                onClick={() => openCreateModal("users")}
                type="button"
              >
                Novo usuario
              </button>
            ) : null}
          </div>
        </div>

        {canInviteUsers && !canCreateUsers
          ? renderEmpty("Crie um grupo antes de cadastrar o primeiro usuario.")
          : null}

        {users.length ? (
          <div className="list list-spaced">
            {users.map((user) => (
              <div className="list-row" key={user.id}>
                <div className="stack-xs">
                  <strong>{user.name}</strong>
                  <span className="muted">{user.email}</span>
                  <span className="muted">
                    Criado em {new Date(user.created_at).toLocaleString("pt-BR")}
                  </span>
                  {user.memberships.length ? (
                    <div className="button-row">
                      {user.memberships.map((membership) => (
                        <span className="badge" key={`${user.id}-${membership.group_id}-${membership.role}`}>
                          {membership.group_name} (@{membership.group_code}) -{" "}
                          {USER_ROLE_LABELS[membership.role]}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="muted">Sem grupo vinculado.</span>
                  )}
                  <span className="muted">
                    Grupo preferencial:{" "}
                    {user.preferred_group_name
                      ? `${user.preferred_group_name} (@${user.preferred_group_code})`
                      : user.preferred_group_hidden
                        ? "definido em outro grupo fora do seu escopo."
                        : "nao definido."}
                  </span>
                  {user.hidden_membership_count > 0 ? (
                    <span className="muted">
                      Tambem possui acesso em {user.hidden_membership_count}{" "}
                      {user.hidden_membership_count === 1 ? "outro grupo." : "outros grupos."}
                    </span>
                  ) : null}
                </div>
                <div className="button-row">
                  <span className="muted">{user.id}</span>
                  <button
                    className="button-ghost"
                    onClick={() => openEditUserModal(user.id)}
                    type="button"
                  >
                    Editar
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          renderEmpty("Nenhum usuario cadastrado ainda.")
        )}

        {canInviteUsers && generatedCredentials ? (
          <div className="surface-subtle stack-xs">
            <strong>Ultimo usuario criado</strong>
            <span className="muted">ID publico: {generatedCredentials.publicUserId}</span>
            <span className="muted">Convite enviado para: {generatedCredentials.email}</span>
            {generatedCredentials.inviteSent ? (
              <span className="muted">
                O acesso so fica disponivel depois que a pessoa confirmar o link recebido.
              </span>
            ) : null}
          </div>
        ) : canInviteUsers ? (
          <div className="surface-subtle">
            <span className="muted">
              O status do ultimo convite enviado aparece aqui logo apos a criacao.
            </span>
          </div>
        ) : null}
      </section>
    );
  }

  function renderClassificationsSection() {
    return (
      <section className="list-card">
        <div className="panel-header">
          <div className="stack-xs">
            <h2 className="section-title">Classificacoes cadastradas</h2>
            <p className="subtitle">Cor, slug e uso de especies podem ser ajustados por modal.</p>
          </div>
          <div className="button-row">
            <span className="badge">{classifications.length}</span>
            <button
              className="button-secondary"
              onClick={() => openCreateModal("classifications")}
              type="button"
            >
              Nova classificacao
            </button>
          </div>
        </div>

        <div className="list list-spaced">
          {classifications.length
            ? classifications.map((classification) => (
                <div className="list-row" key={classification.id}>
                  <div className="stack-xs">
                    <strong>{classification.name}</strong>
                    <span className="muted">
                      {classification.slug} - {classification.marker_color}
                    </span>
                    <div className="stack-xs">
                      <PointTagBadges
                        className="point-tag-list point-tag-list-admin"
                        limit={8}
                        tags={pointTagsByClassificationId.get(classification.id) ?? []}
                      />
                      {!pointTagsByClassificationId.get(classification.id)?.length ? (
                        <span className="muted">Nenhuma tag associada.</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="button-row">
                    <span className="badge">
                      {classification.requires_species ? "usa especies" : "sem especies"} -{" "}
                      {classification.event_type_count} eventos -{" "}
                      {classification.is_active ? "ativa" : "inativa"}
                    </span>
                    <button
                      className="button-ghost"
                      onClick={() => openCreateTagModal(classification.id)}
                      type="button"
                    >
                      Nova tag
                    </button>
                    <button
                      className="button-ghost danger"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Deseja excluir esta classificacao? Se houver relacionamentos, ela sera apenas desativada.",
                          )
                        ) {
                          void handleDeleteClassification(classification.id);
                        }
                      }}
                      type="button"
                    >
                      Excluir
                    </button>
                    <button
                      className="button-ghost"
                      onClick={() => openEditModal("classifications", classification.id)}
                      type="button"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))
            : renderEmpty("Nenhuma classificacao cadastrada ainda.")}
        </div>
      </section>
    );
  }

  function renderEventTypesSection() {
    return (
      <section className="list-card">
        <div className="panel-header">
          <div className="stack-xs">
            <h2 className="section-title">Tipos de evento</h2>
            <p className="subtitle">A criacao e a edicao ficam na mesma sobreposicao.</p>
          </div>
          <div className="button-row">
            <span className="badge">{eventTypes.length}</span>
            <button
              className="button-secondary"
              onClick={() => openCreateModal("event-types")}
              type="button"
            >
              Novo tipo
            </button>
          </div>
        </div>

        <div className="list list-spaced">
          {eventTypes.length
            ? eventTypes.map((eventType) => (
                <div className="list-row" key={eventType.id}>
                  <div className="stack-xs">
                    <strong>{eventType.name}</strong>
                    <span className="muted">
                      {eventType.point_classification_name} - {eventType.slug}
                    </span>
                  </div>
                  <button
                    className="button-ghost"
                    onClick={() => openEditModal("event-types", eventType.id)}
                    type="button"
                  >
                    Editar
                  </button>
                </div>
              ))
            : renderEmpty("Nenhum tipo de evento cadastrado ainda.")}
        </div>
      </section>
    );
  }

  function renderSpeciesSection() {
    return (
      <section className="list-card stack-md">
        <div className="panel-header">
          <div className="stack-xs">
            <h2 className="section-title">Especies cadastradas</h2>
            <p className="subtitle">Catalogo com criacao e alteracao por modal.</p>
          </div>
          <div className="button-row">
            <span className="badge">
              {filteredSpeciesCatalog.length}
              {filteredSpeciesCatalog.length !== speciesCatalog.length
                ? ` de ${speciesCatalog.length}`
                : ""}
            </span>
            <button className="button-secondary" onClick={() => openCreateModal("species")} type="button">
              Nova especie
            </button>
          </div>
        </div>

        <div className="input-grid two">
          <div className="field">
            <label htmlFor="species-filter-text">Buscar especie</label>
            <input
              id="species-filter-text"
              onChange={(event) => setSpeciesFilterText(event.target.value)}
              placeholder="Parte do nome popular ou cientifico"
              value={speciesFilterText}
            />
          </div>
          <div className="field">
            <label>Origem</label>
            <div className="button-row">
              <label className="inline-toggle">
                <input
                  checked={showNativeSpecies}
                  onChange={(event) => setShowNativeSpecies(event.target.checked)}
                  type="checkbox"
                />
                <span>Nativas</span>
              </label>
              <label className="inline-toggle">
                <input
                  checked={showExoticSpecies}
                  onChange={(event) => setShowExoticSpecies(event.target.checked)}
                  type="checkbox"
                />
                <span>Exoticas</span>
              </label>
            </div>
          </div>
        </div>

        <div className="list">
          {filteredSpeciesCatalog.length
            ? filteredSpeciesCatalog.map((species) => (
                <div className="list-row" key={species.id}>
                  <div className="stack-xs">
                    <strong>{species.display_name}</strong>
                    <span className="muted">
                      {species.origin === "native" ? "Nativa" : "Exotica"}
                    </span>
                  </div>
                  <div className="button-row">
                    <span className="badge">{species.is_active ? "ativa" : "inativa"}</span>
                    <button
                      className="button-ghost"
                      onClick={() => openEditModal("species", species.id)}
                      type="button"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))
            : renderEmpty(
                speciesCatalog.length
                  ? "Nenhuma especie encontrada com os filtros informados."
                  : "Nenhuma especie cadastrada ainda.",
              )}
        </div>
      </section>
    );
  }

  function renderSection() {
    if (activeSection === "groups") return renderGroupsSection();
    if (activeSection === "users") return renderUsersSection();
    if (activeSection === "classifications") return renderClassificationsSection();
    if (activeSection === "event-types") return renderEventTypesSection();
    return renderSpeciesSection();
  }

  function renderModalForm() {
    if (!modalSection) {
      return null;
    }

    return (
      <form className="form-stack" onSubmit={submitCurrentModal}>
        {modalSection === "groups" ? (
          <>
            <div className="field">
              <label htmlFor="group-name">Nome</label>
              <input
                id="group-name"
                onChange={(event) => setGroupName(event.target.value)}
                required
                value={groupName}
              />
            </div>
            <div className="field">
              <label htmlFor="group-code">Nome da conta</label>
              <div className="input-prefix">
                <span>@</span>
                <input
                  id="group-code"
                  onChange={(event) =>
                    setGroupCode(
                      event.target.value
                        .replace(/^@+/, "")
                        .replace(/\s+/g, "")
                        .toLowerCase(),
                    )
                  }
                  placeholder="maparedeverde"
                  required
                  value={groupCode}
                />
              </div>
              <span className="hint">
                Sem espacos. Esse identificador unico e usado na URL do grupo.
              </span>
            </div>
            <div className="field">
              <label htmlFor="group-visibility">Visibilidade</label>
              <select
                id="group-visibility"
                onChange={(event) => setGroupIsPublic(event.target.value === "public")}
                value={groupIsPublic ? "public" : "private"}
              >
                <option value="private">Privado</option>
                <option value="public">Publico</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="group-collaboration">Aceita colaboracao com pontos?</label>
              <select
                id="group-collaboration"
                onChange={(event) =>
                  setGroupAcceptsPointCollaboration(event.target.value === "yes")
                }
                value={groupAcceptsPointCollaboration ? "yes" : "no"}
              >
                <option value="no">Nao</option>
                <option value="yes">Sim</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="group-max-pending">
                Maximo de pontos pendentes por colaborador
              </label>
              <input
                id="group-max-pending"
                min={1}
                onChange={(event) =>
                  setGroupMaxPendingPointsPerCollaborator(
                    Math.max(1, Math.floor(Number(event.target.value) || 1)),
                  )
                }
                step={1}
                type="number"
                value={groupMaxPendingPointsPerCollaborator}
              />
              <span className="hint">
                Limita quantos pontos pendentes o mesmo colaborador pode deixar aguardando revisao nesse grupo.
              </span>
            </div>
            <div className="field">
              <label>Logo do grupo</label>
              <GroupLogoEditor
                initialPreviewUrl={groupLogoPreviewUrl}
                onChange={({ file, previewUrl, removeLogo }) => {
                  setGroupLogoFile(file);
                  setGroupLogoPreviewUrl(previewUrl);
                  setGroupRemoveLogo(removeLogo);
                }}
              />
              <span className="hint">
                A logo e salva em formato quadrado, conforme a pre-visualizacao acima.
              </span>
            </div>
          </>
        ) : null}

        {modalSection === "users" ? (
          <>
            {modalMode === "create" || canEditUserIdentity ? (
              <div className="input-grid two">
                <div className="field">
                  <label htmlFor="user-name">Nome</label>
                  <input
                    id="user-name"
                    onChange={(event) => setUserName(event.target.value)}
                    required
                    value={userName}
                  />
                </div>
                <div className="field">
                  <label htmlFor="user-email">E-mail</label>
                  <input
                    id="user-email"
                    onChange={(event) => setUserEmail(event.target.value)}
                    required
                    type="email"
                    value={userEmail}
                  />
                </div>
              </div>
            ) : (
              <div className="surface-subtle stack-xs">
                <strong>{editingUser?.name ?? userName}</strong>
                <span className="muted">{editingUser?.email ?? userEmail}</span>
                <span className="muted">
                  Dados cadastrais so podem ser alterados por superusuario.
                </span>
              </div>
            )}

            {modalMode === "create" ? (
              <>
                <div className="field">
                  <label htmlFor="user-group">Grupo preferencial</label>
                  <select
                    id="user-group"
                    onChange={(event) => {
                      setUserGroupId(event.target.value);
                      setUserPreferredGroupId(event.target.value);
                      setUserPreferredGroupDirty(true);
                    }}
                    disabled={editableGroups.length === 1}
                    required
                    value={userGroupId}
                  >
                    {editableGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                  <span className="hint">
                    {editableGroups.length === 1
                      ? "Como voce administra apenas um grupo, ele ja foi definido automaticamente."
                      : "Esse grupo entra como referencia inicial do usuario no sistema."}
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="user-role">Papel</label>
                  <select
                    id="user-role"
                    onChange={(event) => setUserRole(event.target.value as UserRole)}
                    value={userRole}
                  >
                    {assignableUserRoleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="surface-subtle">
                  <span className="muted">
                    O usuario recebera um link por email para confirmar o cadastro e definir o acesso.
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="user-preferred-group">Grupo preferencial</label>
                  <select
                    id="user-preferred-group"
                    disabled={!userPreferredGroupOptions.length}
                    onChange={(event) => {
                      setUserPreferredGroupId(event.target.value);
                      setUserPreferredGroupDirty(true);
                      setUserPreferredGroupHidden(false);
                    }}
                    value={userPreferredGroupId}
                  >
                    <option value="">Sem grupo preferencial</option>
                    {userPreferredGroupOptions.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                  <span className="hint">
                    {userPreferredGroupHidden && !userPreferredGroupDirty
                      ? "O grupo preferencial atual esta em outro grupo fora do seu escopo. Escolha um grupo visivel para substituir essa referencia."
                      : "O sistema usa esse grupo como referencia inicial quando nao houver outra escolha salva pelo usuario."}
                  </span>
                </div>

                <div className="panel-header">
                  <div className="stack-xs">
                    <strong>Vinculos com grupos</strong>
                    <span className="muted">
                      Ajuste os papeis do usuario. Sem vinculos, ele continua existindo mas nao administra grupos.
                    </span>
                  </div>
                  {editableGroups.length ? (
                    <button className="button-ghost" onClick={addUserMembership} type="button">
                      Adicionar grupo
                    </button>
                  ) : null}
                </div>
                {!canEditUserIdentity && (editingUser?.hidden_membership_count ?? 0) > 0 ? (
                  <div className="surface-subtle">
                    <span className="muted">
                      Existem acessos em outros grupos que voce nao administra. Eles nao aparecem aqui.
                    </span>
                  </div>
                ) : null}

                {userMemberships.length ? (
                  <div className="list list-spaced">
                    {userMemberships.map((membership, index) => (
                      <div className="list-row" key={`${membership.groupId || "novo"}-${index}`}>
                        <div className="input-grid two">
                          <div className="field">
                            <label htmlFor={`user-membership-group-${index}`}>Grupo</label>
                            <select
                              id={`user-membership-group-${index}`}
                              onChange={(event) =>
                                updateUserMembership(index, { groupId: event.target.value })
                              }
                              value={membership.groupId}
                            >
                              {editableGroups.map((group) => (
                                <option key={group.id} value={group.id}>
                                  {group.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="field">
                            <label htmlFor={`user-membership-role-${index}`}>Papel</label>
                            <select
                              id={`user-membership-role-${index}`}
                              onChange={(event) =>
                                updateUserMembership(index, {
                                  role: event.target.value as UserRole,
                                })
                              }
                              value={membership.role}
                            >
                              {assignableUserRoleOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <button
                          className="button-ghost danger"
                          onClick={() => removeUserMembership(index)}
                          type="button"
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="surface-subtle">
                    <span className="muted">
                      Este usuario esta sem grupos vinculados no momento.
                    </span>
                  </div>
                )}
              </>
            )}
          </>
        ) : null}

        {modalSection === "classifications" ? (
          <>
            <div className="input-grid two">
              <div className="field">
                <label htmlFor="classification-name">Nome</label>
                <input
                  id="classification-name"
                  onChange={(event) => setClassificationName(event.target.value)}
                  required
                  value={classificationName}
                />
              </div>
              <div className="field">
                <label htmlFor="classification-slug">Slug</label>
                <input
                  id="classification-slug"
                  onChange={(event) => setClassificationSlug(event.target.value)}
                  value={classificationSlug}
                />
              </div>
            </div>

            <div className="input-grid two">
              <div className="field">
                <label htmlFor="classification-color">Cor no mapa</label>
                <input
                  id="classification-color"
                  onChange={(event) => setClassificationMarkerColor(event.target.value)}
                  value={classificationMarkerColor}
                />
              </div>
              <div className="field">
                <label htmlFor="classification-species">Usa catalogo de especies?</label>
                <select
                  id="classification-species"
                  onChange={(event) =>
                    setClassificationRequiresSpecies(event.target.value === "yes")
                  }
                  value={classificationRequiresSpecies ? "yes" : "no"}
                >
                  <option value="no">Nao</option>
                  <option value="yes">Sim</option>
                </select>
              </div>
            </div>
            {modalMode === "edit" ? (
              <>
                <div className="field">
                  <label htmlFor="classification-active">Status</label>
                  <select
                    id="classification-active"
                    onChange={(event) => setClassificationIsActive(event.target.value === "active")}
                    value={classificationIsActive ? "active" : "inactive"}
                  >
                    <option value="active">Ativa</option>
                    <option value="inactive">Inativa</option>
                  </select>
                </div>
                <section className="surface-subtle stack-sm">
                  <div className="panel-header">
                    <div className="stack-xs">
                      <strong>Tags associadas</strong>
                      <span className="muted">
                        Renomeie, exclua ou crie novas tags sem sair da classificacao.
                      </span>
                    </div>
                    <button
                      className="button-ghost"
                      onClick={() => openCreateTagModal(editingId ?? undefined)}
                      type="button"
                    >
                      Nova tag
                    </button>
                  </div>

                  {selectedClassificationTags.length ? (
                    <div className="list list-spaced">
                      {selectedClassificationTags.map((tag) => (
                        <div className="list-row" key={tag.id}>
                          <div className="stack-xs">
                            <strong>{tag.name}</strong>
                            <span className="muted">
                              {tag.slug}
                              {!tag.is_active ? " - inativa" : ""}
                            </span>
                            {tag.description ? (
                              <span className="muted">{tag.description}</span>
                            ) : null}
                          </div>
                          <div className="button-row">
                            <button
                              className="button-ghost danger"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Deseja excluir esta tag? Se houver pontos relacionados, ela sera apenas desativada.",
                                  )
                                ) {
                                  void handleDeletePointTag(tag.id);
                                }
                              }}
                              type="button"
                            >
                              Excluir
                            </button>
                            <button
                              className="button-ghost"
                              onClick={() => openEditTagModal(tag.id, editingId ?? undefined)}
                              type="button"
                            >
                              Editar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="muted">
                      Nenhuma tag associada a esta classificacao ainda.
                    </span>
                  )}
                </section>
              </>
            ) : (
              <div className="surface-subtle">
                <span className="muted">
                  Salve a classificacao primeiro para cadastrar as tags associadas.
                </span>
              </div>
            )}
          </>
        ) : null}

        {modalSection === "tags" ? (
          <>
            <div className="field">
              <label htmlFor="tag-classification">Classificacao</label>
              <select
                id="tag-classification"
                disabled={Boolean(tagModalReturnClassificationId)}
                onChange={(event) => setTagClassificationId(event.target.value)}
                required
                value={tagClassificationId}
              >
                {tagClassificationOptions.map((classification) => (
                  <option key={classification.id} value={classification.id}>
                    {classification.name}
                    {!classification.is_active ? " (inativa)" : ""}
                  </option>
                ))}
              </select>
              {tagModalReturnClassificationId ? (
                <span className="hint">
                  Esta tag esta sendo editada dentro da classificacao selecionada.
                </span>
              ) : null}
            </div>

            <div className="input-grid two">
              <div className="field">
                <label htmlFor="tag-name">Nome</label>
                <input
                  id="tag-name"
                  onChange={(event) => setTagName(event.target.value)}
                  required
                  value={tagName}
                />
              </div>
              <div className="field">
                <label htmlFor="tag-slug">Slug</label>
                <input
                  id="tag-slug"
                  onChange={(event) => setTagSlug(event.target.value)}
                  value={tagSlug}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="tag-description">Descricao</label>
              <textarea
                id="tag-description"
                onChange={(event) => setTagDescription(event.target.value)}
                placeholder="Explique quando essa tag deve ser usada."
                value={tagDescription}
              />
            </div>

            {modalMode === "edit" ? (
              <div className="field">
                <label htmlFor="tag-active">Status</label>
                <select
                  id="tag-active"
                  onChange={(event) => setTagIsActive(event.target.value === "active")}
                  value={tagIsActive ? "active" : "inactive"}
                >
                  <option value="active">Ativa</option>
                  <option value="inactive">Inativa</option>
                </select>
              </div>
            ) : null}
          </>
        ) : null}

        {modalSection === "event-types" ? (
          <>
            <div className="field">
              <label htmlFor="event-type-classification">Classificacao</label>
              <select
                id="event-type-classification"
                onChange={(event) => setEventTypeClassificationId(event.target.value)}
                required
                value={eventTypeClassificationId}
              >
                {eventTypeClassificationOptions.map((classification) => (
                  <option key={classification.id} value={classification.id}>
                    {classification.name}
                    {!classification.is_active ? " (inativa)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="input-grid two">
              <div className="field">
                <label htmlFor="event-type-name">Nome</label>
                <input
                  id="event-type-name"
                  onChange={(event) => setEventTypeName(event.target.value)}
                  required
                  value={eventTypeName}
                />
              </div>
              <div className="field">
                <label htmlFor="event-type-slug">Slug</label>
                <input
                  id="event-type-slug"
                  onChange={(event) => setEventTypeSlug(event.target.value)}
                  value={eventTypeSlug}
                />
              </div>
            </div>
          </>
        ) : null}

        {modalSection === "species" ? (
          <>
            <div className="input-grid two">
              <div className="field">
                <label htmlFor="species-common-name">Nome popular</label>
                <input
                  id="species-common-name"
                  onChange={(event) => setSpeciesCommonName(event.target.value)}
                  required
                  value={speciesCommonName}
                />
              </div>
              <div className="field">
                <label htmlFor="species-scientific-name">Nome cientifico</label>
                <input
                  id="species-scientific-name"
                  onChange={(event) => setSpeciesScientificName(event.target.value)}
                  required
                  value={speciesScientificName}
                />
              </div>
            </div>

            <div className="input-grid two">
              <div className="field">
                <label htmlFor="species-origin">Origem</label>
                <select
                  id="species-origin"
                  onChange={(event) => setSpeciesOrigin(event.target.value as "native" | "exotic")}
                  value={speciesOrigin}
                >
                  <option value="native">Nativa</option>
                  <option value="exotic">Exotica</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="species-active">Status</label>
                <select
                  id="species-active"
                  onChange={(event) => setSpeciesIsActive(event.target.value === "active")}
                  value={speciesIsActive ? "active" : "inactive"}
                >
                  <option value="active">Ativa</option>
                  <option value="inactive">Inativa</option>
                </select>
              </div>
            </div>
          </>
        ) : null}

        {errorMessage ? <p className="error">{errorMessage}</p> : null}

        <div className="form-actions">
          <button
            className="button"
            disabled={isSubmitting || (modalSection === "users" && !canCreateUsers)}
            type="submit"
          >
            {isSubmitting ? "Salvando..." : modalMode === "create" ? "Salvar" : "Atualizar"}
          </button>
          <button className="button-ghost" onClick={closeModal} type="button">
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  async function handleDeleteClassification(classificationId: string) {
    setErrorMessage(null);

    try {
      const result = await apiClient.deletePointClassification(classificationId);

      if (result.mode === "physical") {
        setClassifications((current) =>
          current.filter((classification) => classification.id !== classificationId),
        );
        setPointTags((current) =>
          current.filter((tag) => tag.point_classification_id !== classificationId),
        );
        toast.success("Classificacao removida permanentemente.");
        return;
      }

      if (result.classification) {
        setClassifications((current) =>
          sortByLocale(
            current.map((classification) =>
              classification.id === classificationId ? result.classification! : classification,
            ),
            (classification) => classification.name,
          ),
        );
        setPointTags((current) =>
          sortPointTags(
            current.map((tag) =>
              tag.point_classification_id === classificationId
                ? {
                    ...tag,
                    point_classification_name: result.classification?.name,
                  }
                : tag,
            ),
          ),
        );
      }

      toast.success("Classificacao desativada por possuir relacionamentos.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel excluir.";
      setErrorMessage(message);
      toast.error(message);
    }
  }

  async function handleDeletePointTag(tagId: string) {
    setErrorMessage(null);

    try {
      const result = await apiClient.deletePointTag(tagId);

      if (result.mode === "physical") {
        setPointTags((current) => current.filter((tag) => tag.id !== tagId));
        toast.success("Tag removida permanentemente.");
        return;
      }

      if (result.tag) {
        setPointTags((current) =>
          sortPointTags(current.map((tag) => (tag.id === tagId ? result.tag! : tag))),
        );
      }

      toast.success("Tag desativada por possuir relacionamentos.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel excluir.";
      setErrorMessage(message);
      toast.error(message);
    }
  }

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Administracao</p>
          <h1>{canManageGlobalCatalogs ? "Gestao da plataforma" : "Gestao dos grupos"}</h1>
          <p className="subtitle">
            {canManageGlobalCatalogs
              ? "A listagem fica visivel o tempo todo; criacao e edicao abrem em sobreposicao."
              : "Gerencie os grupos sob sua responsabilidade e os papeis dos usuarios vinculados a eles."}
          </p>
        </div>
      </div>

      <section className="panel stack-md">
        <div className="panel-header">
          <div className="stack-xs">
            <h2 className="section-title">Cadastros</h2>
            <p className="subtitle">Escolha a listagem que deseja administrar.</p>
          </div>
          <span className="badge">
            {availableSections.find((section) => section.id === activeSection)?.label}
          </span>
        </div>

        <div className="admin-menu">
          {availableSections.map((section) => (
            <button
              key={section.id}
              className={`admin-menu-button${activeSection === section.id ? " active" : ""}`}
              onClick={() => setActiveSection(section.id)}
              type="button"
            >
              {section.label}
            </button>
          ))}
        </div>
      </section>

      {renderSection()}

      <AdminModal
        isOpen={Boolean(modalSection)}
        onClose={closeModal}
        subtitle="Os dados sao salvos com toast de retorno, sem sair da listagem atual."
        title={modalTitle}
      >
        {renderModalForm()}
      </AdminModal>
    </section>
  );
}
