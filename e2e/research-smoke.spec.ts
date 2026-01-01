import { test, expect } from "@playwright/test";

test("research smoke: Chris Young evidence-based queries", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);
    // Log research status updates in real-time for debugging
    if (text.includes("Research status") || text.includes("Hooks:")) {
      console.log(`[Browser] ${text}`);
    }
  });

  await page.goto("/");

  // Fill form using correct selectors from IntentForm component
  await page.fill("#recipientName", "Chris Young");
  await page.fill("#recipientCompany", "Microsoft");
  await page.fill("#recipientRole", "EVP Business Development, Strategy and Ventures");
  await page.fill(
    "#senderIntent",
    "I want him to speak at Stanford's black business school conference"
  );

  console.log("\n✅ Form filled, submitting research request...");

  // Submit the form
  await page.getByRole("button", { name: /start research/i }).click();

  console.log("✅ Research started, waiting for completion (up to 90 seconds)...\n");

  // Wait for "Research status: complete" log message
  await page.waitForFunction(
    () => {
      // Check console for completion message
      return true; // We'll rely on timeout and check logs manually
    },
    { timeout: 2000 } // Short timeout, we'll check manually
  ).catch(() => {});

  // Wait for research to actually complete (check logs)
  const maxWait = 90_000;
  const startTime = Date.now();
  let completed = false;

  while (Date.now() - startTime < maxWait && !completed) {
    await page.waitForTimeout(1000);
    const currentLogs = logs.join("\n");
    if (currentLogs.includes("Research status: complete")) {
      completed = true;
      break;
    }
  }

  if (!completed) {
    console.error("❌ Research did not complete within 90 seconds");
    console.log("\n=== BROWSER CONSOLE LOGS ===");
    console.log(logs.join("\n"));
    throw new Error("Research timeout");
  }

  console.log("✅ Research completed, hooks displayed\n");

  // Give extra time for all console logs to arrive
  await page.waitForTimeout(1000);

  const pageText = await page.textContent("body");

  // ===== ASSERTIONS: Verify research completed successfully =====

  // 1. Research should have completed
  const joined = logs.join("\n");
  expect(joined).toContain("Research status: complete");

  // 2. Should have extracted hooks
  expect(joined).toMatch(/Hooks: \d+/);

  // Extract hook count from logs
  const hooksMatch = joined.match(/Hooks: (\d+)/);
  const hookCount = hooksMatch ? parseInt(hooksMatch[1]) : 0;

  // Print summary
  console.log("\n=== TEST SUMMARY ===");
  console.log("✅ Research pipeline completed successfully");
  console.log(`✅ Extracted ${hookCount} hooks`);
  console.log("\n📝 To verify 5-query evidence-based system:");
  console.log("   Check Supabase Edge Function logs at:");
  console.log("   https://supabase.com/dashboard/project/hvmyfwqnjontmycmkhux/logs/edge-functions");
  console.log("\n   Look for:");
  console.log("   - 'Generated 5 hypotheses' (not 3)");
  console.log("   - Artifact keyword validation logs");
  console.log("   - Queries containing: podcast, LinkedIn, speaking, launch, panel");
  console.log("   - 'maxOutputTokens: 4000' in hook extraction");
  console.log("   - 'thinkingBudget: 0'");

  // Test passes if research completed and hooks were extracted
  expect(hookCount).toBeGreaterThan(0);
});
