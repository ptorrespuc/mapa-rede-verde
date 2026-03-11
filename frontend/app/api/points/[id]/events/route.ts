import { NextResponse } from "next/server";

import {
  attachMediaToEvents,
  ensureTimelineMediaBucketExists,
  getPointTimeline,
  TIMELINE_MEDIA_BUCKET,
} from "@/lib/point-timeline";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PointDetailRecord, PointEventRecord, PointMediaRecord } from "@/types/domain";

const MAX_TIMELINE_FILES = 6;
const MAX_TIMELINE_FILE_SIZE = 10 * 1024 * 1024;

type PointMediaRow = Omit<PointMediaRecord, "signed_url">;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();

  try {
    const events = await getPointTimeline(supabase, id);
    return NextResponse.json(events);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel carregar a timeline." },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    return handleMultipartEventRequest(request, id, supabase);
  }

  const body = await request.json().catch(() => null);

  const { data, error } = await supabase.rpc("create_point_event", {
    p_point_id: id,
    p_point_event_type_id:
      typeof body?.pointEventTypeId === "string" ? body.pointEventTypeId || null : null,
    p_event_type: typeof body?.eventType === "string" ? body.eventType || null : null,
    p_description: body.description ?? null,
    p_event_date: body.eventDate ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const event = (data as PointEventRecord[] | null)?.[0];

  if (!event) {
    return NextResponse.json({ error: "O evento nao foi criado." }, { status: 500 });
  }

  return NextResponse.json({ ...event, media: [] }, { status: 201 });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const eventId = new URL(request.url).searchParams.get("eventId")?.trim();

  if (!eventId) {
    return NextResponse.json({ error: "Informe o evento que deve ser excluido." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const { data: pointData, error: pointError } = await supabase.rpc("get_point", {
    p_point_id: id,
  });
  const point = (pointData as PointDetailRecord[] | null)?.[0];

  if (pointError) {
    return NextResponse.json({ error: pointError.message }, { status: 400 });
  }

  if (!point) {
    return NextResponse.json({ error: "Ponto nao encontrado." }, { status: 404 });
  }

  if (!point.viewer_can_manage) {
    return NextResponse.json({ error: "Voce nao tem permissao para excluir este evento." }, { status: 403 });
  }

  const adminSupabase = createAdminSupabaseClient();
  const { data: eventRecord, error: eventError } = await adminSupabase
    .from("point_events")
    .select("id")
    .eq("id", eventId)
    .eq("point_id", id)
    .maybeSingle();

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 400 });
  }

  if (!eventRecord) {
    return NextResponse.json({ error: "Evento nao encontrado." }, { status: 404 });
  }

  const { data: mediaRows, error: mediaError } = await adminSupabase
    .from("point_media")
    .select("file_url")
    .eq("point_id", id)
    .eq("point_event_id", eventId);

  if (mediaError) {
    return NextResponse.json({ error: mediaError.message }, { status: 400 });
  }

  const { error: deleteError } = await adminSupabase
    .from("point_events")
    .delete()
    .eq("id", eventId)
    .eq("point_id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  const uploadedPaths = (mediaRows ?? [])
    .map((row) => row.file_url)
    .filter((path): path is string => Boolean(path));

  if (uploadedPaths.length) {
    const { error: storageError } = await adminSupabase.storage
      .from(TIMELINE_MEDIA_BUCKET)
      .remove(uploadedPaths);

    if (storageError) {
      console.error("Nao foi possivel limpar os arquivos de um evento excluido.", storageError);
    }
  }

  return NextResponse.json({ success: true });
}

async function handleMultipartEventRequest(
  request: Request,
  pointId: string,
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
) {
  const formData = await request.formData();
  const eventType = `${formData.get("eventType") ?? ""}`.trim();
  const pointEventTypeId = `${formData.get("pointEventTypeId") ?? ""}`.trim();
  const description = `${formData.get("description") ?? ""}`.trim();
  const eventDate = `${formData.get("eventDate") ?? ""}`.trim();
  const photoEntries = formData.getAll("photos");
  const photoCaptionEntries = formData.getAll("photoCaptions");

  const files = photoEntries.filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length > MAX_TIMELINE_FILES) {
    return NextResponse.json(
      { error: `Envie no maximo ${MAX_TIMELINE_FILES} fotos por evento.` },
      { status: 400 },
    );
  }

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Somente imagens sao permitidas na timeline." }, { status: 400 });
    }

    if (file.size > MAX_TIMELINE_FILE_SIZE) {
      return NextResponse.json(
        { error: "Cada foto pode ter no maximo 10 MB." },
        { status: 400 },
      );
    }
  }

  const { data, error } = await supabase.rpc("create_point_event", {
    p_point_id: pointId,
    p_point_event_type_id: pointEventTypeId || null,
    p_event_type: eventType || null,
    p_description: description || null,
    p_event_date: eventDate || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const event = (data as PointEventRecord[] | null)?.[0];

  if (!event) {
    return NextResponse.json({ error: "O evento nao foi criado." }, { status: 500 });
  }

  if (!files.length) {
    return NextResponse.json({ ...event, media: [] }, { status: 201 });
  }

  const adminSupabase = createAdminSupabaseClient();
  const uploadedPaths: string[] = [];

  try {
    await ensureTimelineMediaBucketExists();

    const insertedMediaRows: PointMediaRow[] = [];

    for (const [index, file] of files.entries()) {
      const storagePath = buildTimelineStoragePath(pointId, event.id, file.name);
      const arrayBuffer = await file.arrayBuffer();
      const captionEntry = photoCaptionEntries[index];
      const caption = typeof captionEntry === "string" ? captionEntry.trim() : "";

      const { error: uploadError } = await adminSupabase.storage
        .from(TIMELINE_MEDIA_BUCKET)
        .upload(storagePath, Buffer.from(arrayBuffer), {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      uploadedPaths.push(storagePath);

      const { data: insertedMedia, error: insertError } = await supabase
        .from("point_media")
        .insert({
          point_id: pointId,
          point_event_id: event.id,
          file_url: storagePath,
          caption: caption || null,
        })
        .select("id, point_id, point_event_id, file_url, caption, created_at")
        .single();

      if (insertError) {
        throw insertError;
      }

      insertedMediaRows.push(insertedMedia as PointMediaRow);
    }

    const [hydratedEvent] = await attachMediaToEvents([{ ...event, media: [] }], insertedMediaRows);

    return NextResponse.json(hydratedEvent, { status: 201 });
  } catch (error) {
    await rollbackEventWithMedia(adminSupabase, event.id, uploadedPaths);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nao foi possivel salvar as fotos do evento." },
      { status: 400 },
    );
  }
}

async function rollbackEventWithMedia(
  adminSupabase: ReturnType<typeof createAdminSupabaseClient>,
  eventId: string,
  uploadedPaths: string[],
) {
  if (uploadedPaths.length) {
    await adminSupabase.storage.from(TIMELINE_MEDIA_BUCKET).remove(uploadedPaths);
  }

  await adminSupabase.from("point_media").delete().eq("point_event_id", eventId);
  await adminSupabase.from("point_events").delete().eq("id", eventId);
}

function buildTimelineStoragePath(pointId: string, eventId: string, fileName: string) {
  const sanitizedFileName = sanitizeFileName(fileName);
  return `${pointId}/${eventId}/${Date.now()}-${crypto.randomUUID()}-${sanitizedFileName}`;
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName.trim().toLowerCase();
  return normalized.replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-");
}
