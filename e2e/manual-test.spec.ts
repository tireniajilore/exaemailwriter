import { test, expect } from "@playwright/test";

test("manual UI test - watch what happens", async ({ page }) => {
  await page.goto("/");

  console.log("✅ Page loaded, filling form...");

  await page.fill("#recipientName", "Reid Hoffman");
  await page.fill("#recipientCompany", "Greylock Partners");
  await page.fill("#recipientRole", "Partner");
  await page.fill("#senderIntent", "I want to interview him for my podcast about AI safety");

  console.log("✅ Form filled, clicking submit...");

  await page.getByRole("button", { name: /start research/i }).click();

  console.log("✅ Clicked submit, waiting to observe UI...");

  // Wait 30 seconds and observe
  await page.waitForTimeout(30000);

  console.log("✅ 30 seconds elapsed");
});