import { expect } from "@playwright/test";
import { join } from "node:path";

// Called by the installed-app harness. Uses UI actions and real native storage, offline.
export async function nutritionSmoke(page, directory, accessibility) {
  const total = page.getByTestId("daily-total");
  const today = await page
    .getByLabel("Diary date", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "Previous day" }).click();
  await page.getByRole("button", { name: "Mark day complete" }).click();
  await expect(
    page.getByRole("button", { name: "Reopen day" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next day" }).click();
  await page.getByRole("button", { name: "Set target", exact: true }).click();
  await page.getByLabel("Daily target (kcal)").fill("2000");
  await page.getByRole("button", { name: "Apply target" }).click();
  await expect(page.getByTestId("daily-target")).toHaveText("2,000 kcal");
  await page.getByRole("button", { name: "Set target", exact: true }).click();
  await page.getByLabel("Target method").selectOption("estimate");
  await page.getByLabel("Equation variant").selectOption("5");
  await page.getByLabel("Weight (kg)").fill("80");
  await page.getByLabel("Height (cm)").fill("180");
  await page.getByLabel("Age (years, adults only)").fill("30");
  await page.getByLabel("Activity assumption").selectOption("1.55");
  await page.getByLabel("Signed adjustment (kcal)").fill("-300");
  await page.getByRole("button", { name: "Preview estimate" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Resting" }),
  ).toContainText(
    "Resting 1,780 · maintenance 2,759 · proposed target 2,459 kcal",
  );
  await accessibility(page, "target-estimate");
  await page.getByRole("button", { name: "Apply target" }).click();
  await expect(page.getByTestId("daily-target")).toHaveText(
    "2,459 kcal · estimate",
  );
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page.getByTestId("daily-target")).toHaveText("Not set");
  await page.getByRole("button", { name: "Next day" }).click();

  await page.getByText(/^Food library \(/).click();
  await page
    .getByRole("button", { name: "Create custom food", exact: true })
    .click();
  await page
    .getByLabel("Food name", { exact: true })
    .fill("Synthetic custom oats");
  await page.getByLabel("Preparation / state").fill("Dry");
  await page.getByLabel("Calories for basis (kcal)").fill("200");
  await page.getByLabel("Protein (g)", { exact: true }).fill("10");
  await page.getByLabel("Fat (g)", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Add named portion" }).click();
  await page.getByLabel("Portion name 1").fill("Bowl");
  await page.getByLabel("Portion size 1 (g)").fill("150");
  await accessibility(page, "custom-food");
  await page.getByRole("button", { name: "Save custom food" }).click();
  await page
    .getByRole("button", {
      name: "Favorite Synthetic custom oats",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "＋ Add food", exact: true }).click();
  await page.getByText("Search local foods", { exact: true }).click();
  await page.getByLabel("Search foods").fill("Synthetic custom oats");
  await page
    .getByRole("button")
    .filter({ has: page.getByText("Synthetic custom oats", { exact: true }) })
    .click();
  await page.getByLabel("Portion amount").fill("1.25");
  await expect(
    page.getByRole("status").filter({ hasText: "375 kcal" }),
  ).toContainText("carbohydrate: unknown");
  await accessibility(page, "portion-review");
  await page.getByRole("button", { name: "Save to diary" }).click();
  await expect(total).toHaveText("1,025");
  await expect(page.getByText("18.8 g · partial (1/2 entries)")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Edit custom Synthetic custom oats",
      exact: true,
    })
    .click();
  await page.getByLabel("Calories for basis (kcal)").fill("300");
  await page.getByRole("button", { name: "Save custom food" }).click();
  await expect(total).toHaveText("1,025");
  await page
    .getByRole("button", {
      name: "Add recent Synthetic custom oats",
      exact: true,
    })
    .click();
  await expect(total).toHaveText("1,400");
  await page
    .getByRole("button", {
      name: "Add favorite Synthetic custom oats",
      exact: true,
    })
    .click();
  await expect(total).toHaveText("1,850");
  await page.getByRole("button", { name: "Mark day complete" }).click();
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(page.getByText("925 kcal average")).toBeVisible();
  await expect(
    page.getByText("2/7 days complete · 1/7 days with entries"),
  ).toBeVisible();
  if (await page.getByRole("button", { name: "Dismiss notification" }).count())
    await page.getByRole("button", { name: "Dismiss notification" }).click();
  await accessibility(page, "weekly-summary");
  await page.screenshot({
    path: join(directory, "nutrition-week.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to diary" }).click();
  await expect(page.getByLabel("Diary date", { exact: true })).toHaveValue(
    today,
  );
  await page.screenshot({
    path: join(directory, "nutrition-diary.png"),
    fullPage: true,
  });
  // Keep one original v1 portion on yesterday for restart/reinstall snapshot proof.
  await page
    .getByRole("button", { name: "Edit Synthetic custom oats", exact: true })
    .first()
    .click();
  const priorDate = new Date(`${today}T12:00:00`);
  priorDate.setDate(priorDate.getDate() - 1);
  const yesterday = `${priorDate.getFullYear()}-${String(priorDate.getMonth() + 1).padStart(2, "0")}-${String(priorDate.getDate()).padStart(2, "0")}`;
  await page.getByLabel("Date", { exact: true }).fill(yesterday);
  await page.getByRole("button", { name: "Save to diary" }).click();
  await expect(total).toHaveText("1,475");
  // Leave the original smoke diary for the shared restart and reinstall assertions.
  while (
    await page
      .getByRole("button", {
        name: "Delete Synthetic custom oats",
        exact: true,
      })
      .count()
  ) {
    await page
      .getByRole("button", {
        name: "Delete Synthetic custom oats",
        exact: true,
      })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Mark day complete" }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      page.getByRole("button", { name: "＋ Add food", exact: true }),
    ).toBeEnabled();
  }
  await expect(total).toHaveText("650");
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(total).toHaveText("375");
  await page.getByRole("button", { name: "Mark day complete" }).click();
  await page.getByRole("button", { name: "Next day" }).click();
  // Simulate a local midnight in the running WebView; an open draft keeps its explicit date.
  await page.getByRole("button", { name: "＋ Add food", exact: true }).click();
  const before = new Date(`${today}T23:59:59`);
  await page.clock.setFixedTime(before);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const after = new Date(before.getTime() + 2000);
  await page.clock.setFixedTime(after);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const next = `${after.getFullYear()}-${String(after.getMonth() + 1).padStart(2, "0")}-${String(after.getDate()).padStart(2, "0")}`;
  await expect(page.getByLabel("Diary date", { exact: true })).toHaveValue(
    next,
  );
  await expect(
    page.getByRole("dialog").getByLabel("Date", { exact: true }),
  ).toHaveValue(today);
  await page.keyboard.press("Escape");
  await page.clock.setFixedTime(new Date());
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("Diary date", { exact: true })).toHaveValue(
    today,
  );
  await expect(total).toHaveText("650");
  return "Native offline target preview/application/history, custom portions/macros/snapshots, favorites, one-click recents, completion and weekly coverage";
}

export async function verifyNutritionPersistence(page) {
  await expect(page.getByTestId("daily-target")).toHaveText(
    "2,459 kcal · estimate",
  );
  await expect(
    page.getByRole("button", {
      name: "Add favorite Synthetic custom oats",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page.getByTestId("daily-total")).toHaveText("375");
  await expect(page.getByRole("button", { name: "Reopen day" })).toBeVisible();
  await expect(page.getByTestId("daily-target")).toHaveText("Not set");
  await expect(
    page
      .locator(".entry-source")
      .filter({ hasText: "Custom label/manual · v1" }),
  ).toBeVisible();
  await expect(page.getByText("18.8 g", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next day" }).click();
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(page.getByText("375 kcal average")).toBeVisible();
  await expect(
    page.getByText("1/7 days complete · 2/7 days with entries"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to diary" }).click();
}
