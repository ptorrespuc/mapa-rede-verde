import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { appTestConfig } from "./app-config";

type GroupRole = "group_admin" | "group_approver" | "group_collaborator";

interface PointClassificationSeed {
  id: string;
  name: string;
  requires_species: boolean;
}

interface TestUserSeedOptions {
  email?: string;
  name: string;
  password?: string;
}

interface TestGroupSeedOptions {
  name: string;
  code?: string;
  isPublic?: boolean;
  acceptsPointCollaboration?: boolean;
  maxPendingPointsPerCollaborator?: number;
}

export interface SeededTestUser {
  authUserId: string;
  appUserId: string;
  email: string;
  password: string;
  name: string;
}

export interface SeededTestGroup {
  id: string;
  name: string;
  code: string;
}

interface CleanupSeededScenarioOptions {
  groupId: string;
  appUserIds: string[];
  authUserIds: string[];
}

let cachedAdminClient: SupabaseClient | null = null;

export function getAdminSupabaseForTests() {
  if (cachedAdminClient) {
    return cachedAdminClient;
  }

  cachedAdminClient = createClient(
    appTestConfig.supabaseUrl,
    appTestConfig.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return cachedAdminClient;
}

export async function createConfirmedTestUser(
  options: TestUserSeedOptions,
): Promise<SeededTestUser> {
  const adminSupabase = getAdminSupabaseForTests();
  const password = options.password ?? appTestConfig.defaultPassword;
  const email =
    options.email ??
    `${appTestConfig.entityPrefix}-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;

  const { data: authUserData, error: authUserError } = await adminSupabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: {
      name: options.name,
    },
  });

  if (authUserError) {
    throw authUserError;
  }

  const authUserId = authUserData.user.id;
  const { data: existingProfile, error: profileLookupError } = await adminSupabase
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (profileLookupError) {
    throw profileLookupError;
  }

  let appUserId = existingProfile?.id ?? null;

  if (!appUserId) {
    const { data: insertedProfile, error: insertProfileError } = await adminSupabase
      .from("users")
      .insert({
        auth_user_id: authUserId,
        name: options.name,
        email,
      })
      .select("id")
      .single();

    if (insertProfileError) {
      throw insertProfileError;
    }

    appUserId = insertedProfile.id;
  }

  return {
    authUserId,
    appUserId,
    email,
    password,
    name: options.name,
  };
}

export async function createTestGroup(
  options: TestGroupSeedOptions,
): Promise<SeededTestGroup> {
  const adminSupabase = getAdminSupabaseForTests();
  const code =
    options.code ??
    `${appTestConfig.entityPrefix}-${Date.now()}-${randomUUID().slice(0, 6)}`;

  const { data, error } = await adminSupabase
    .from("groups")
    .insert({
      name: options.name,
      code,
      is_public: options.isPublic ?? true,
      accepts_point_collaboration: options.acceptsPointCollaboration ?? true,
      max_pending_points_per_collaborator:
        options.maxPendingPointsPerCollaborator ?? 5,
    })
    .select("id, name, code")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    name: data.name,
    code: data.code,
  };
}

export async function assignUserToGroup(
  user: Pick<SeededTestUser, "appUserId">,
  group: Pick<SeededTestGroup, "id">,
  role: GroupRole,
) {
  const adminSupabase = getAdminSupabaseForTests();
  const { error } = await adminSupabase.from("user_groups").upsert(
    {
      user_id: user.appUserId,
      group_id: group.id,
      role,
    },
    {
      onConflict: "user_id,group_id",
    },
  );

  if (error) {
    throw error;
  }
}

export async function createGroupApproverScenario() {
  const group = await createTestGroup({
    name: "Grupo Playwright",
    isPublic: true,
    acceptsPointCollaboration: true,
  });
  const approver = await createConfirmedTestUser({
    name: "Aprovador Playwright",
  });
  const collaborator = await createConfirmedTestUser({
    name: "Colaborador Playwright",
  });

  await assignUserToGroup(approver, group, "group_approver");

  return {
    group,
    approver,
    collaborator,
  };
}

export async function createAdminApproverScopeScenario() {
  const adminGroup = await createTestGroup({
    name: `Grupo Admin ${randomUUID().slice(0, 6)}`,
    isPublic: true,
    acceptsPointCollaboration: true,
  });
  const reviewGroup = await createTestGroup({
    name: `Grupo Aprovador ${randomUUID().slice(0, 6)}`,
    isPublic: true,
    acceptsPointCollaboration: true,
  });
  const actor = await createConfirmedTestUser({
    name: "Administrador com aprovacao secundaria",
  });
  const target = await createConfirmedTestUser({
    name: "Usuario alvo de escopo",
  });

  await assignUserToGroup(actor, adminGroup, "group_admin");
  await assignUserToGroup(actor, reviewGroup, "group_approver");
  await assignUserToGroup(target, adminGroup, "group_collaborator");
  await assignUserToGroup(target, reviewGroup, "group_collaborator");

  return {
    adminGroup,
    reviewGroup,
    actor,
    target,
  };
}

export async function listActivePointClassificationsForTests() {
  const adminSupabase = getAdminSupabaseForTests();
  const { data, error } = await adminSupabase
    .from("point_classifications")
    .select("id, name, requires_species")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as PointClassificationSeed[];
}

export async function getReclassificationPairForTests() {
  const classifications = await listActivePointClassificationsForTests();

  if (classifications.length < 2) {
    throw new Error("O ambiente precisa de pelo menos duas classificacoes ativas para o teste.");
  }

  const initial =
    classifications.find((classification) => /arvore|tree/i.test(classification.name)) ??
    classifications[0];
  const replacement =
    classifications.find(
      (classification) =>
        classification.id !== initial.id &&
        /plantio|planting|gola|inspection|inspecao/i.test(classification.name),
    ) ?? classifications.find((classification) => classification.id !== initial.id);

  if (!replacement) {
    throw new Error("Nao foi possivel encontrar uma segunda classificacao para a reclassificacao.");
  }

  return { initial, replacement };
}

export async function cleanupSeededScenario(options: CleanupSeededScenarioOptions) {
  const adminSupabase = getAdminSupabaseForTests();
  const { data: groupPoints, error: pointsLookupError } = await adminSupabase
    .from("points")
    .select("id, pending_update_data")
    .eq("group_id", options.groupId);

  if (pointsLookupError) {
    throw pointsLookupError;
  }

  const pointIds = (groupPoints ?? []).map((point) => point.id);
  const storagePaths = new Set<string>();

  if (pointIds.length) {
    const { data: pointMediaRows, error: mediaLookupError } = await adminSupabase
      .from("point_media")
      .select("file_url")
      .in("point_id", pointIds);

    if (mediaLookupError) {
      throw mediaLookupError;
    }

    for (const mediaRow of pointMediaRows ?? []) {
      if (typeof mediaRow.file_url === "string" && mediaRow.file_url) {
        storagePaths.add(mediaRow.file_url);
      }
    }

    for (const point of groupPoints ?? []) {
      const rawPendingMedia = point.pending_update_data?.pending_point_media;
      const pendingMedia = Array.isArray(rawPendingMedia) ? rawPendingMedia : [];

      for (const descriptor of pendingMedia) {
        if (
          descriptor &&
          typeof descriptor === "object" &&
          "file_url" in descriptor &&
          typeof descriptor.file_url === "string" &&
          descriptor.file_url
        ) {
          storagePaths.add(descriptor.file_url);
        }
      }
    }

    await adminSupabase.from("point_media").delete().in("point_id", pointIds);
    await adminSupabase.from("point_events").delete().in("point_id", pointIds);
    await adminSupabase.from("points").delete().in("id", pointIds);
  }

  if (storagePaths.size) {
    await adminSupabase.storage
      .from("point-timeline-media")
      .remove([...storagePaths])
      .catch(() => undefined);
  }

  await adminSupabase.from("user_groups").delete().eq("group_id", options.groupId);
  await adminSupabase.from("groups").delete().eq("id", options.groupId);

  if (options.appUserIds.length) {
    await adminSupabase.from("user_groups").delete().in("user_id", options.appUserIds);
    await adminSupabase.from("users").delete().in("id", options.appUserIds);
  }

  for (const authUserId of options.authUserIds) {
    await adminSupabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
  }
}
