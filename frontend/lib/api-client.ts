import type {
  AddUserToGroupPayload,
  AdminUserRecord,
  CreateAdminUserPayload,
  CreateGroupPayload,
  CreatePointClassificationPayload,
  CreatePointEventPayload,
  CreatePointEventTypePayload,
  CreatePointPayload,
  CreateSpeciesPayload,
  GroupRecord,
  PointClassificationRecord,
  PointDetailRecord,
  PointEventRecord,
  PointEventTypeRecord,
  PointMediaRecord,
  PointRecord,
  PendingPointReviewSummary,
  SpeciesRecord,
  UpdateGroupPayload,
  UpdateAdminUserPayload,
  UpdatePointClassificationPayload,
  UpdatePointEventTypePayload,
  UpdatePointPayload,
  UpdateSpeciesPayload,
} from "@/types/domain";

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const responseText = await response.text();
    let message = responseText || `Request failed with status ${response.status}`;

    try {
      const payload = JSON.parse(responseText) as { error?: string };
      message = payload.error || message;
    } catch {}

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  getPoints(classificationId?: string) {
    const query =
      classificationId && classificationId !== "all"
        ? `?classificationId=${encodeURIComponent(classificationId)}`
        : "";
    return request<PointRecord[]>(`/api/points${query}`, { method: "GET" });
  },
  getPointsWithFilters(params?: { classificationId?: string; groupId?: string }) {
    const searchParams = new URLSearchParams();

    if (params?.classificationId && params.classificationId !== "all") {
      searchParams.set("classificationId", params.classificationId);
    }

    if (params?.groupId && params.groupId !== "all") {
      searchParams.set("groupId", params.groupId);
    }

    const query = searchParams.toString();
    return request<PointRecord[]>(`/api/points${query ? `?${query}` : ""}`, { method: "GET" });
  },
  createPoint(payload: CreatePointPayload) {
    if (payload.photos?.length) {
      const formData = new FormData();
      formData.append("groupId", payload.groupId);
      formData.append("classificationId", payload.classificationId);
      formData.append("title", payload.title);
      formData.append("isPublic", String(payload.isPublic));
      formData.append("longitude", String(payload.longitude));
      formData.append("latitude", String(payload.latitude));

      if (payload.speciesId) {
        formData.append("speciesId", payload.speciesId);
      }

      if (payload.description) {
        formData.append("description", payload.description);
      }

      payload.photos.forEach((photo) => {
        formData.append("photos", photo.file);
        formData.append("photoCaptions", photo.caption ?? "");
      });

      return request<PointRecord>("/api/points", {
        method: "POST",
        body: formData,
      });
    }

    return request<PointRecord>("/api/points", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getPoint(id: string) {
    return request<PointDetailRecord>(`/api/points/${id}`, { method: "GET" });
  },
  getPointMedia(id: string) {
    return request<PointMediaRecord[]>(`/api/points/${id}/media`, { method: "GET" });
  },
  getPendingPointReview(id: string) {
    return request<PendingPointReviewSummary>(`/api/points/${id}/pending-review`, {
      method: "GET",
    });
  },
  updatePoint(id: string, payload: UpdatePointPayload) {
    if (payload.photos?.length) {
      const formData = new FormData();

      if (payload.classificationId) {
        formData.append("classificationId", payload.classificationId);
      }

      if (payload.title) {
        formData.append("title", payload.title);
      }

      if (typeof payload.speciesId === "string") {
        formData.append("speciesId", payload.speciesId);
      } else if (payload.speciesId === null) {
        formData.append("speciesId", "");
      }

      if (payload.description) {
        formData.append("description", payload.description);
      }

      if (typeof payload.isPublic === "boolean") {
        formData.append("isPublic", String(payload.isPublic));
      }

      if (typeof payload.longitude === "number") {
        formData.append("longitude", String(payload.longitude));
      }

      if (typeof payload.latitude === "number") {
        formData.append("latitude", String(payload.latitude));
      }

      if (typeof payload.preservePreviousStateOnReclassification === "boolean") {
        formData.append(
          "preservePreviousStateOnReclassification",
          String(payload.preservePreviousStateOnReclassification),
        );
      }

      if (payload.photoUpdateMode) {
        formData.append("photoUpdateMode", payload.photoUpdateMode);
      }

      payload.photos.forEach((photo) => {
        formData.append("photos", photo.file);
        formData.append("photoCaptions", photo.caption ?? "");
      });

      return request<PointRecord>(`/api/points/${id}`, {
        method: "PATCH",
        body: formData,
      });
    }

    return request<PointRecord>(`/api/points/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  getWorkspacePoints(params?: {
    classificationId?: string;
    groupId?: string;
    pendingOnly?: boolean;
    mineOnly?: boolean;
  }) {
    const searchParams = new URLSearchParams();

    if (params?.classificationId && params.classificationId !== "all") {
      searchParams.set("classificationId", params.classificationId);
    }

    if (params?.groupId && params.groupId !== "all") {
      searchParams.set("groupId", params.groupId);
    }

    if (params?.pendingOnly) {
      searchParams.set("pendingOnly", "true");
    }

    if (params?.mineOnly) {
      searchParams.set("mineOnly", "true");
    }

    const query = searchParams.toString();
    return request<PointRecord[]>(`/api/points/workspace${query ? `?${query}` : ""}`, {
      method: "GET",
    });
  },
  deletePoint(id: string) {
    return request<{ success: boolean }>(`/api/points/${id}`, {
      method: "DELETE",
    });
  },
  reviewPoint(id: string, action: "approve" | "reject") {
    return request<PointRecord>(`/api/points/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
  },
  getPointEvents(id: string) {
    return request<PointEventRecord[]>(`/api/points/${id}/events`, { method: "GET" });
  },
  createPointEvent(id: string, payload: CreatePointEventPayload) {
    if (payload.photos?.length) {
      const formData = new FormData();
      if (payload.pointEventTypeId) {
        formData.append("pointEventTypeId", payload.pointEventTypeId);
      }

      if (payload.eventType) {
        formData.append("eventType", payload.eventType);
      }

      if (payload.description) {
        formData.append("description", payload.description);
      }

      if (payload.eventDate) {
        formData.append("eventDate", payload.eventDate);
      }

      payload.photos.forEach((photo) => {
        formData.append("photos", photo.file);
        formData.append("photoCaptions", photo.caption ?? "");
      });

      return request<PointEventRecord>(`/api/points/${id}/events`, {
        method: "POST",
        body: formData,
      });
    }

    return request<PointEventRecord>(`/api/points/${id}/events`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deletePointEvent(id: string, eventId: string) {
    return request<{ success: boolean }>(
      `/api/points/${id}/events?eventId=${encodeURIComponent(eventId)}`,
      { method: "DELETE" },
    );
  },
  getPointClassifications() {
    return request<PointClassificationRecord[]>("/api/point-classifications", {
      method: "GET",
    });
  },
  createPointClassification(payload: CreatePointClassificationPayload) {
    return request<PointClassificationRecord>("/api/point-classifications", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updatePointClassification(id: string, payload: UpdatePointClassificationPayload) {
    return request<PointClassificationRecord>(`/api/point-classifications/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  deletePointClassification(id: string) {
    return request<{ mode: "logical" | "physical"; classification: PointClassificationRecord | null }>(
      `/api/point-classifications/${id}`,
      {
        method: "DELETE",
      },
    );
  },
  getSpecies() {
    return request<SpeciesRecord[]>("/api/species", {
      method: "GET",
    });
  },
  createSpecies(payload: CreateSpeciesPayload) {
    return request<SpeciesRecord>("/api/species", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateSpecies(id: string, payload: UpdateSpeciesPayload) {
    return request<SpeciesRecord>(`/api/species/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  getPointEventTypes(pointClassificationId?: string) {
    const query =
      pointClassificationId && pointClassificationId !== "all"
        ? `?pointClassificationId=${encodeURIComponent(pointClassificationId)}`
        : "";

    return request<PointEventTypeRecord[]>(`/api/point-event-types${query}`, {
      method: "GET",
    });
  },
  createPointEventType(payload: CreatePointEventTypePayload) {
    return request<PointEventTypeRecord>("/api/point-event-types", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updatePointEventType(id: string, payload: UpdatePointEventTypePayload) {
    return request<PointEventTypeRecord>(`/api/point-event-types/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  getGroups() {
    return request<GroupRecord[]>("/api/groups", { method: "GET" });
  },
  createGroup(payload: CreateGroupPayload) {
    if (payload.logo) {
      const formData = new FormData();
      formData.append("name", payload.name);
      if (payload.code) {
        formData.append("code", payload.code);
      }
      formData.append("isPublic", String(payload.isPublic));
      formData.append(
        "acceptsPointCollaboration",
        String(payload.acceptsPointCollaboration),
      );
      if (typeof payload.maxPendingPointsPerCollaborator === "number") {
        formData.append(
          "maxPendingPointsPerCollaborator",
          String(payload.maxPendingPointsPerCollaborator),
        );
      }
      formData.append("logo", payload.logo);

      return request<GroupRecord>("/api/groups", {
        method: "POST",
        body: formData,
      });
    }

    return request<GroupRecord>("/api/groups", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateGroup(id: string, payload: UpdateGroupPayload) {
    if (
      payload.logo ||
      payload.removeLogo ||
      typeof payload.maxPendingPointsPerCollaborator === "number"
    ) {
      const formData = new FormData();

      if (payload.name) {
        formData.append("name", payload.name);
      }

      if (payload.code) {
        formData.append("code", payload.code);
      }

      if (typeof payload.isPublic === "boolean") {
        formData.append("isPublic", String(payload.isPublic));
      }

      if (typeof payload.acceptsPointCollaboration === "boolean") {
        formData.append(
          "acceptsPointCollaboration",
          String(payload.acceptsPointCollaboration),
        );
      }

      if (typeof payload.maxPendingPointsPerCollaborator === "number") {
        formData.append(
          "maxPendingPointsPerCollaborator",
          String(payload.maxPendingPointsPerCollaborator),
        );
      }

      if (payload.logo) {
        formData.append("logo", payload.logo);
      }

      if (payload.removeLogo) {
        formData.append("removeLogo", "true");
      }

      return request<GroupRecord>(`/api/groups/${id}`, {
        method: "PATCH",
        body: formData,
      });
    }

    return request<GroupRecord>(`/api/groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  addUserToGroup(groupId: string, payload: AddUserToGroupPayload) {
    return request<{ user_id: string; group_id: string; role: string }>(
      `/api/groups/${groupId}/users`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },
  createUser(payload: CreateAdminUserPayload) {
    return request<{
      authUserId: string;
      publicUserId: string;
      email: string;
      inviteSent: boolean;
      groupId: string;
      role: string;
      redirectTo: string;
    }>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateUser(id: string, payload: UpdateAdminUserPayload) {
    return request<AdminUserRecord>(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
};
