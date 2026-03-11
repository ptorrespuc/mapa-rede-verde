import { expect, test } from "../../_shared/test-base";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnQ7xQAAAAASUVORK5CYII=";

function buildTinyPng(name: string) {
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  };
}

test.describe("fluxo de fotos do ponto", () => {
  test("mostra foto atual na edicao e respeita o limite restante de fotos", async ({ page }) => {
    await page.goto("/test-harness/point-edit");

    await expect(
      page.getByRole("heading", { name: "Formulario de edicao do ponto", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Fotos atuais", { exact: true })).toBeVisible();
    await expect(page.getByText("Foto atual aprovada")).toBeVisible();
    await expect(page.getByText("Voce ainda pode adicionar 2 foto(s).")).toBeVisible();

    await page.getByRole("button", { name: "Adicionar fotos" }).click();
    await page.locator("#point-photo").setInputFiles([
      buildTinyPng("foto-1.png"),
      buildTinyPng("foto-2.png"),
      buildTinyPng("foto-3.png"),
    ]);

    await expect(
      page.getByText("Com as fotos atuais, voce pode adicionar no maximo 2 nova(s) foto(s)."),
    ).toBeVisible();
    await expect(page.locator(".media-upload-card")).toHaveCount(2);
  });

  test("exibe diferencas e fotos pendentes na revisao da alteracao", async ({ page }) => {
    await page.route("**/api/points/playwright-point/pending-review", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          pointId: "playwright-point",
          requestedAt: "2026-03-11T12:00:00.000Z",
          current: {
            classificationName: "Arvore",
            title: "Arvore existente",
            speciesName: "Oiti (Licania tomentosa)",
            description: "Foto atual aprovada.",
            latitude: -22.9285,
            longitude: -43.1729,
            isPublic: true,
          },
          proposed: {
            classificationName: "Plantio",
            title: "Plantio em acompanhamento",
            speciesName: "Oiti (Licania tomentosa)",
            description: "Novo estado sugerido pelo colaborador.",
            latitude: -22.9289,
            longitude: -43.1732,
            isPublic: true,
          },
          changes: [
            {
              field: "classification",
              label: "Classificacao",
              currentValue: "Arvore",
              nextValue: "Plantio",
            },
            {
              field: "title",
              label: "Titulo",
              currentValue: "Arvore existente",
              nextValue: "Plantio em acompanhamento",
            },
          ],
          currentMedia: [
            {
              id: "current-photo-1",
              point_id: "playwright-point",
              point_event_id: null,
              file_url: "playwright/current-photo.png",
              caption: "Foto atual aprovada",
              created_at: "2026-03-11T10:00:00.000Z",
              signed_url: `data:image/png;base64,${TINY_PNG_BASE64}`,
            },
          ],
          pendingMedia: [
            {
              id: "pending-photo-1",
              point_id: "playwright-point",
              point_event_id: null,
              file_url: "playwright/pending-photo-1.png",
              caption: "Nova foto 1",
              created_at: "2026-03-11T12:00:00.000Z",
              signed_url: `data:image/png;base64,${TINY_PNG_BASE64}`,
            },
            {
              id: "pending-photo-2",
              point_id: "playwright-point",
              point_event_id: null,
              file_url: "playwright/pending-photo-2.png",
              caption: "Nova foto 2",
              created_at: "2026-03-11T12:00:00.000Z",
              signed_url: `data:image/png;base64,${TINY_PNG_BASE64}`,
            },
          ],
          resultingMedia: [
            {
              id: "current-photo-1",
              point_id: "playwright-point",
              point_event_id: null,
              file_url: "playwright/current-photo.png",
              caption: "Foto atual aprovada",
              created_at: "2026-03-11T10:00:00.000Z",
              signed_url: `data:image/png;base64,${TINY_PNG_BASE64}`,
            },
            {
              id: "pending-photo-1",
              point_id: "playwright-point",
              point_event_id: null,
              file_url: "playwright/pending-photo-1.png",
              caption: "Nova foto 1",
              created_at: "2026-03-11T12:00:00.000Z",
              signed_url: `data:image/png;base64,${TINY_PNG_BASE64}`,
            },
            {
              id: "pending-photo-2",
              point_id: "playwright-point",
              point_event_id: null,
              file_url: "playwright/pending-photo-2.png",
              caption: "Nova foto 2",
              created_at: "2026-03-11T12:00:00.000Z",
              signed_url: `data:image/png;base64,${TINY_PNG_BASE64}`,
            },
          ],
          pendingMediaMode: "append",
        }),
      });
    });

    await page.goto("/test-harness/pending-review");

    await expect(
      page.getByRole("heading", { name: "Alteracao pendente", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Visualizar diferencas" })).toBeVisible();
    await expect(page.getByText("Classificacao")).toBeVisible();
    await expect(page.getByText("Foto atual aprovada")).toBeVisible();
    await expect(page.getByText("Nova foto 1")).toBeVisible();
    await expect(page.getByText("Nova foto 2")).toBeVisible();

    await page.getByRole("button", { name: "Visualizar alteracao" }).click();

    await expect(page.getByText("Plantio em acompanhamento")).toBeVisible();
    await expect(page.getByText("novas fotos serao adicionadas")).toBeVisible();
  });
});
