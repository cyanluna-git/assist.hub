import { expect, test } from "@playwright/test";

test("dashboard loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("materials page loads and can open a document when present", async ({ page }) => {
  await page.goto("/materials");
  await expect(page.getByRole("heading", { name: "Materials" })).toBeVisible();

  const firstMaterial = page.locator('a[href^="/materials/view?path="]').first();

  if (await firstMaterial.count()) {
    await firstMaterial.click();
    await expect(page).toHaveURL(/\/materials\/view\?path=/);
  } else {
    await expect(page.getByText("동기화된 자료가 없습니다.")).toBeVisible();
  }
});

test("bulletin page loads", async ({ page }) => {
  await page.goto("/bulletin");
  await expect(page.getByRole("heading", { name: "Bulletin" })).toBeVisible();
});

test("schedule page loads", async ({ page }) => {
  await page.goto("/schedule");
  await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
});
