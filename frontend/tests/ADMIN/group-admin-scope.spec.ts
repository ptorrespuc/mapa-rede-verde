import { expect, test } from "../_shared/test-base";
import { login } from "../_shared/login";
import {
  cleanupSeededScenario,
  createAdminApproverScopeScenario,
} from "../_shared/supabase-admin";

test.describe("escopo administrativo de group_admin", () => {
  test.setTimeout(180_000);

  test("nao edita grupos nem papeis fora dos grupos que administra", async ({ page }) => {
    const scenario = await createAdminApproverScopeScenario();

    try {
      await login(page, scenario.actor);

      await page.goto("/admin?section=groups");

      const adminGroupRow = page.locator(".list-row").filter({
        has: page.getByText(scenario.adminGroup.name, { exact: true }),
      });
      const reviewGroupRow = page.locator(".list-row").filter({
        has: page.getByText(scenario.reviewGroup.name, { exact: true }),
      });

      await expect(adminGroupRow).toContainText("Editar");
      await expect(reviewGroupRow).toContainText("Somente leitura");
      await expect(
        reviewGroupRow.getByRole("button", { name: "Editar" }),
      ).toHaveCount(0);

      await page.goto("/admin?section=users");

      const targetUserRow = page.locator(".list-row").filter({
        has: page.getByText(scenario.target.email, { exact: true }),
      });

      await expect(targetUserRow).toContainText(scenario.adminGroup.name);
      await expect(targetUserRow).toContainText(scenario.reviewGroup.name);

      await targetUserRow.getByRole("button", { name: "Editar" }).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByText("Dados cadastrais so podem ser alterados por superusuario."),
      ).toBeVisible();

      const membershipGroupSelect = dialog.locator('select[id^="user-membership-group-"]');
      await expect(membershipGroupSelect).toHaveCount(1);
      await expect(dialog.getByRole("option", { name: scenario.adminGroup.name })).toHaveCount(1);
      await expect(dialog.getByRole("option", { name: scenario.reviewGroup.name })).toHaveCount(0);
    } finally {
      await cleanupSeededScenario({
        groupId: scenario.adminGroup.id,
        appUserIds: [scenario.actor.appUserId, scenario.target.appUserId],
        authUserIds: [scenario.actor.authUserId, scenario.target.authUserId],
      });
      await cleanupSeededScenario({
        groupId: scenario.reviewGroup.id,
        appUserIds: [],
        authUserIds: [],
      });
    }
  });
});
