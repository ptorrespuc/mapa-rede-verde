import { expect, test as base } from "@playwright/test";

const test = base;

test.afterEach(async ({ page }) => {
  if (page.isClosed()) {
    return;
  }

  await page.waitForTimeout(500);
});

export { expect, test };
