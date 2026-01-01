import { test, expect } from "@playwright/test";

test("verify progress bar updates during research", async ({ page }) => {
  const progressUpdates: Array<{ phase: number; label: string; time: number }> = [];
  const startTime = Date.now();

  // Capture all console logs that mention progress
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("Research status:")) {
      const elapsed = Date.now() - startTime;
      console.log(`[${elapsed}ms] ${text}`);
    }
  });

  await page.goto("/");

  // Fill form with a different person to avoid cache
  const timestamp = Date.now();
  await page.fill("#recipientName", "Satya Nadella");
  await page.fill("#recipientCompany", "Microsoft");
  await page.fill("#recipientRole", "CEO");
  await page.fill("#senderIntent", `Testing progress bar updates ${timestamp}`);

  console.log("\n🎬 Starting research...");
  const researchStartTime = Date.now();

  await page.getByRole("button", { name: /start research/i }).click();

  // Monitor progress bar value changes
  let lastProgress = 0;
  let phaseChanges = 0;

  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);

    // Check if progress bar exists and get its value
    const progressBar = page.locator('[role="progressbar"]');
    const progressExists = await progressBar.count() > 0;

    if (progressExists) {
      const progressValue = await progressBar.getAttribute("aria-valuenow");
      const currentProgress = parseInt(progressValue || "0");

      if (currentProgress !== lastProgress) {
        const elapsed = Date.now() - researchStartTime;
        console.log(`[${elapsed}ms] Progress: ${lastProgress}% → ${currentProgress}%`);
        lastProgress = currentProgress;
        phaseChanges++;
      }

      // Stop monitoring if complete (100%)
      if (currentProgress >= 100) {
        console.log(`✅ Research completed in ${Date.now() - researchStartTime}ms`);
        break;
      }
    }

    // Also check for completion via console logs
    const bodyText = await page.textContent("body");
    if (bodyText?.includes("Hook") || bodyText?.includes("hook")) {
      console.log(`✅ Hooks displayed after ${Date.now() - researchStartTime}ms`);
      break;
    }
  }

  console.log(`\n📊 Progress updates observed: ${phaseChanges}`);
  console.log(`⏱️  Total time: ${Date.now() - researchStartTime}ms`);

  // The progress bar should have updated at least once
  expect(phaseChanges).toBeGreaterThan(0);
});