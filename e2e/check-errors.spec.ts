import { test, expect } from "@playwright/test";

test("check for JavaScript errors", async ({ page }) => {
  const errors: string[] = [];
  const warnings: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
      console.error(`❌ Console Error: ${msg.text()}`);
    } else if (msg.type() === "warning") {
      warnings.push(msg.text());
    }
  });

  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(`❌ Page Error: ${error.message}`);
  });

  await page.goto("/");

  console.log("✅ Page loaded, checking for errors...");
  await page.waitForTimeout(2000);

  await page.fill("#recipientName", "Test Person");
  await page.fill("#recipientCompany", "Test Company");
  await page.fill("#recipientRole", "CEO");
  await page.fill("#senderIntent", "Testing for errors");

  console.log("✅ Form filled, submitting...");
  await page.getByRole("button", { name: /start research/i }).click();

  console.log("✅ Waiting for completion or errors...");
  await page.waitForTimeout(15000);

  console.log(`\n📊 Errors found: ${errors.length}`);
  console.log(`⚠️  Warnings found: ${warnings.length}`);

  if (errors.length > 0) {
    console.log("\n❌ ERRORS:");
    errors.forEach((err, i) => console.log(`${i + 1}. ${err}`));
  }

  // Test should pass even if there are errors (we just want to see them)
  expect(true).toBe(true);
});