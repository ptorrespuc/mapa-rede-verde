import type { Page } from "@playwright/test";

import { expect, test } from "../_shared/test-base";
import { login } from "../_shared/login";
import {
  cleanupSeededScenario,
  createGroupApproverScenario,
} from "../_shared/supabase-admin";

test.describe("envelope de erro das rotas criticas", () => {
  test("padroniza erros de update, review e eventos", async ({ page }) => {
    const scenario = await createGroupApproverScenario();

    try {
      await login(page, {
        email: scenario.approver.email,
        password: scenario.approver.password,
      });

      const invalidUpdate = await requestFromPage(page, "/api/points/00000000-0000-0000-0000-000000000001", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify("payload-invalido"),
      });

      expect(invalidUpdate.status).toBe(400);
      expect(invalidUpdate.body).toMatchObject({
        code: "INVALID_POINT_UPDATE_PAYLOAD",
      });
      expect(typeof invalidUpdate.body.error).toBe("string");

      const invalidReview = await requestFromPage(
        page,
        "/api/points/00000000-0000-0000-0000-000000000001/review",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "noop" }),
        },
      );

      expect(invalidReview.status).toBe(400);
      expect(invalidReview.body).toMatchObject({
        code: "INVALID_REVIEW_ACTION",
      });
      expect(typeof invalidReview.body.error).toBe("string");

      const invalidEventDelete = await requestFromPage(
        page,
        "/api/points/00000000-0000-0000-0000-000000000001/events",
        {
          method: "DELETE",
        },
      );

      expect(invalidEventDelete.status).toBe(400);
      expect(invalidEventDelete.body).toMatchObject({
        code: "POINT_EVENT_ID_REQUIRED",
      });
      expect(typeof invalidEventDelete.body.error).toBe("string");
    } finally {
      await cleanupSeededScenario({
        groupId: scenario.group.id,
        appUserIds: [scenario.approver.appUserId, scenario.collaborator.appUserId],
        authUserIds: [scenario.approver.authUserId, scenario.collaborator.authUserId],
      });
    }
  });
});

async function requestFromPage(
  page: Page,
  input: string,
  init: RequestInit,
) {
  return page.evaluate(
    async ({ input, init }) => {
      const response = await fetch(input, init);
      const body = await response.json().catch(() => null);

      return {
        status: response.status,
        body,
      };
    },
    { input, init },
  );
}
