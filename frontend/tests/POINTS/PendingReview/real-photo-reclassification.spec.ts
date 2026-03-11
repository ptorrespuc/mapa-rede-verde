import { randomUUID } from "node:crypto";

import { expect, test } from "../../_shared/test-base";
import { login, logout } from "../../_shared/login";
import {
  cleanupSeededScenario,
  createGroupApproverScenario,
  getReclassificationPairForTests,
} from "../../_shared/supabase-admin";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnQ7xQAAAAASUVORK5CYII=";
const POINT_UUID_PATTERN = /\/points\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildTinyPng(name: string) {
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  };
}

test.describe("reclassificacao com troca de fotos", () => {
  test.setTimeout(180_000);

  test("aprovador cria o ponto e colaborador sugere troca completa de fotos", async ({
    page,
  }) => {
    const scenario = await createGroupApproverScenario();
    const classifications = await getReclassificationPairForTests();
    const pointSuffix = randomUUID().slice(0, 8);
    const initialTitle = `Ponto inicial ${pointSuffix}`;
    const replacementTitle = `Ponto reclassificado ${pointSuffix}`;
    let pointId: string | null = null;

    try {
      await login(page, scenario.approver);

      await page.goto(`/points/new?grupo=${scenario.group.code}`);
      await expect(page.getByRole("heading", { name: "Registrar ponto no mapa" })).toBeVisible();

      await page.locator("#point-classification").selectOption(classifications.initial.id);
      await page.locator("#point-title").fill(initialTitle);
      await page.locator("#point-description").fill("Estado inicial aprovado pelo grupo.");
      await page.locator("#point-longitude").fill("-43.172900");
      await page.locator("#point-latitude").fill("-22.928500");
      await page.getByRole("button", { name: "Adicionar fotos" }).click();
      await page.locator("#point-photo").setInputFiles([
        buildTinyPng("foto-inicial-1.png"),
        buildTinyPng("foto-inicial-2.png"),
      ]);

      const initialCaptions = page.locator('[id^="point-photo-caption-"]');
      await initialCaptions.nth(0).fill("Foto original 1");
      await initialCaptions.nth(1).fill("Foto original 2");

      await page.getByRole("button", { name: "Criar ponto" }).click();
      await page.waitForURL(POINT_UUID_PATTERN);

      pointId = page.url().split("/points/")[1]?.split("?")[0] ?? null;

      if (!pointId) {
        throw new Error("Nao foi possivel capturar o id do ponto criado.");
      }

      await expect(page.getByText("Foto original 1")).toBeVisible();
      await expect(page.getByText("Foto original 2")).toBeVisible();

      await logout(page);

      await login(page, scenario.collaborator);
      await page.goto(`/points/${pointId}/edit`);

      await expect(page.getByRole("heading", { name: initialTitle })).toBeVisible();
      await expect(page.getByText("Fotos atuais", { exact: true })).toBeVisible();
      await expect(page.getByText("Foto original 1")).toBeVisible();
      await expect(page.getByText("Foto original 2")).toBeVisible();

      await page
        .locator("label.inline-toggle")
        .filter({ hasText: "Substituir fotos atuais" })
        .locator("input")
        .check();
      await page.getByRole("button", { name: "Substituir fotos" }).click();

      await page.locator("#point-classification").selectOption(classifications.replacement.id);
      await page.locator("#point-title").fill(replacementTitle);
      await page.locator("#point-description").fill("Estado proposto pelo colaborador.");
      await page.locator("#point-photo").setInputFiles([
        buildTinyPng("foto-nova-1.png"),
        buildTinyPng("foto-nova-2.png"),
        buildTinyPng("foto-nova-3.png"),
      ]);

      const replacementCaptions = page.locator('[id^="point-photo-caption-"]');
      await replacementCaptions.nth(0).fill("Foto proposta 1");
      await replacementCaptions.nth(1).fill("Foto proposta 2");
      await replacementCaptions.nth(2).fill("Foto proposta 3");

      await expect(
        page.getByText(
          "As novas fotos abaixo substituem as fotos atuais quando o salvamento for concluido.",
        ),
      ).toBeVisible();

      await page.getByRole("button", { name: "Salvar alteracoes" }).click();
      await page.waitForURL(new RegExp(`/points/${pointId}$`));

      await expect(page.getByText("Alteracao pendente", { exact: true })).toBeVisible();
      await logout(page);

      await login(page, scenario.approver);
      await page.goto(`/points/${pointId}`);
      await page.getByRole("button", { name: "Visualizar diferencas" }).click();

      const reviewDialog = page.getByRole("dialog");

      await expect(reviewDialog.getByRole("heading", { name: "Alteracao pendente" })).toBeVisible();
      await expect(reviewDialog.getByText("fotos atuais serao substituidas")).toBeVisible();
      await expect(reviewDialog.getByRole("heading", { name: "Fotos atuais" })).toBeVisible();
      await expect(reviewDialog.getByRole("heading", { name: "Fotos pendentes" })).toBeVisible();
      await expect(reviewDialog.getByText("Foto original 1", { exact: true })).toBeVisible();
      await expect(reviewDialog.getByText("Foto original 2", { exact: true })).toBeVisible();
      await expect(reviewDialog.getByText("Foto proposta 1", { exact: true })).toBeVisible();
      await expect(reviewDialog.getByText("Foto proposta 2", { exact: true })).toBeVisible();
      await expect(reviewDialog.getByText("Foto proposta 3", { exact: true })).toBeVisible();
      await expect(reviewDialog.getByText(classifications.replacement.name, { exact: true })).toBeVisible();
      await expect(reviewDialog.getByText(replacementTitle, { exact: true })).toBeVisible();
    } finally {
      await cleanupSeededScenario({
        groupId: scenario.group.id,
        appUserIds: [scenario.approver.appUserId, scenario.collaborator.appUserId],
        authUserIds: [scenario.approver.authUserId, scenario.collaborator.authUserId],
      });
    }
  });
});
