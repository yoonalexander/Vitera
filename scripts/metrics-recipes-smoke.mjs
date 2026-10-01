import { expect } from "@playwright/test";
import { join } from "node:path";
const exact = (page, name) => page.getByRole("button", { name, exact: true });
const priorDate = (date, offset) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function metricsRecipesSmoke(page, directory, accessibility) {
  const today = await page
    .getByLabel("Diary date", { exact: true })
    .inputValue();
  const prior = priorDate(today, -2);
  await page.getByText(/^Food library \(/).click();
  await exact(page, "Create custom food").click();
  await page
    .getByLabel("Food name", { exact: true })
    .fill("Synthetic recipe ingredient");
  await page.getByLabel("Preparation / state").fill("Raw");
  await page.getByLabel("Calories for basis (kcal)").fill("200");
  await page.getByLabel("Protein (g)", { exact: true }).fill("10");
  await page.getByLabel("Fat (g)", { exact: true }).fill("0");
  await exact(page, "Save custom food").click();
  await exact(page, "Recipes").click();
  await exact(page, "Create recipe").click();
  await page.getByLabel("Recipe name").fill("Synthetic cooked recipe");
  await page
    .getByLabel("Instructions, optional")
    .fill("Cook and weigh finished yield.");
  const option = await page
    .getByLabel("Add ingredient from library")
    .locator("option")
    .filter({ hasText: "Synthetic recipe ingredient" })
    .getAttribute("value");
  await page.getByLabel("Add ingredient from library").selectOption(option);
  await exact(page, "Add ingredient").click();
  await page.getByLabel("Ingredient 1 amount").fill("0.8");
  await page.getByLabel("Ingredient 1 unit").selectOption("kg");
  await page.getByLabel("Number of servings, optional").fill("4");
  await page.getByLabel("Measured finished weight (g), optional").fill("800");
  await expect(
    page.getByRole("status").filter({ hasText: "1,600 kcal" }),
  ).toContainText("carbohydrate: unknown");
  await accessibility(page, "recipe-form");
  await exact(page, "Save recipe").click();
  await exact(page, "Log recipe Synthetic cooked recipe").click();
  await expect(
    page.getByRole("status").filter({ hasText: "400 kcal" }),
  ).toBeVisible();
  await exact(page, "Save to diary").click();
  await exact(page, "Log recipe Synthetic cooked recipe").click();
  await page.getByLabel("Recipe portion unit").selectOption("g");
  await page.getByLabel("Recipe portion amount").fill("150");
  await expect(
    page.getByRole("status").filter({ hasText: "300 kcal" }),
  ).toBeVisible();
  await accessibility(page, "recipe-portion");
  await exact(page, "Save to diary").click();
  await exact(page, "Back to diary").click();
  await expect(page.getByTestId("daily-total")).toHaveText("1,350");
  await exact(page, "Recipes").click();
  await exact(page, "Create saved meal").click();
  await page.getByLabel("Saved meal name").fill("Synthetic saved dinner");
  await page.getByRole("checkbox", { name: /Smoke lunch/ }).check();
  await page
    .getByRole("checkbox", { name: /Synthetic cooked recipe · 400/ })
    .check();
  await accessibility(page, "saved-meal-form");
  await exact(page, "Save meal").click();
  await exact(page, "Log saved meal Synthetic saved dinner").click();
  await page.getByLabel("Saved meal date").fill(prior);
  await page.getByLabel("Meal grouping").selectOption("Dinner");
  await exact(page, "Save meal to diary").click();
  await exact(page, "Edit saved meal Synthetic saved dinner").click();
  await exact(page, "Remove saved item 1").click();
  await exact(page, "Save meal").click();
  await exact(page, "Back to diary").click();
  await page.getByText(/^Food library \(/).click();
  await exact(page, "Edit custom Synthetic recipe ingredient").click();
  await page.getByLabel("Calories for basis (kcal)").fill("300");
  await exact(page, "Save custom food").click();
  await expect(page.getByTestId("daily-total")).toHaveText("1,350");
  await exact(page, "Recipes").click();
  await exact(page, "Edit recipe Synthetic cooked recipe").click();
  await exact(page, "Use latest ingredient data").click();
  await expect(
    page.getByRole("status").filter({ hasText: "2,400 kcal" }),
  ).toBeVisible();
  await exact(page, "Save recipe").click();
  await exact(page, "History of Synthetic cooked recipe").click();
  await expect(
    page.getByRole("heading", {
      name: "Synthetic cooked recipe · v1",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Synthetic cooked recipe · v2",
      exact: true,
    }),
  ).toBeVisible();
  await accessibility(page, "recipe-history");
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: join(directory, "recipes.png"),
    fullPage: true,
  });
  await exact(page, "Back to diary").click();
  while (await exact(page, "Delete Synthetic cooked recipe").count()) {
    await exact(page, "Delete Synthetic cooked recipe").first().click();
    await expect(exact(page, "＋ Add food")).toBeEnabled();
  }
  await expect(page.getByTestId("daily-total")).toHaveText("650");

  await exact(page, "Progress").click();
  async function addMetric(kind, value, unit, date = today, time = "12:00:00") {
    await exact(page, "Log measurement").click();
    await page.getByLabel("Measurement type").selectOption(kind);
    await page.getByLabel("Measurement unit").selectOption(unit);
    await page.getByLabel("Measurement value").fill(value);
    await page.getByLabel("Measurement date").fill(date);
    await page.getByLabel("Measurement time").fill(time);
    if (kind === "measurement")
      await page.getByLabel("Measurement name", { exact: true }).fill("Waist");
    await accessibility(page, `metric-${kind}`);
    await exact(page, "Save measurement").click();
    await expect(exact(page, "Log measurement")).toBeEnabled();
  }
  await addMetric("weight", "80", "kg", today, "08:00:00");
  await addMetric("weight", "82", "kg", today, "18:00:00");
  await addMetric("weight", "78", "kg", prior, "08:00:00");
  await expect(page.locator(".metric-summary")).toContainText(
    "2/30 days recorded · 3 records · change +4 kg",
  );
  await expect(page.locator(".chart-dot")).toHaveCount(2);
  await expect(page.locator(".chart-line")).toHaveCount(0);
  expect(
    await page
      .locator(".chart-dot")
      .evaluateAll((nodes) =>
        nodes.map((n) => Number(n.getAttribute("data-value"))),
      ),
  ).toEqual([78, 82]);
  await page
    .getByText("Daily values and seven-day means", { exact: true })
    .click();
  const lastRow = page
    .getByRole("table")
    .filter({ has: page.getByText("Daily history in kg", { exact: false }) })
    .getByRole("row")
    .last();
  await expect(lastRow).toContainText("82");
  await expect(lastRow).toContainText("80");
  await expect(lastRow).toContainText("2/7 days");
  await page.getByLabel("Display unit").selectOption("lb");
  expect(
    Number(await page.locator(".chart-dot").last().getAttribute("data-value")),
  ).toBeCloseTo(180.7790549916, 6);
  await page.getByLabel("Display unit").selectOption("kg");
  const morning = page
    .locator(".metric-records .library-row")
    .filter({ hasText: "Weight: 80 kg" });
  await morning.getByRole("button", { name: /Edit measurement/ }).click();
  await page.getByLabel("Measurement value").fill("81");
  await exact(page, "Save measurement").click();
  await addMetric("measurement", "32", "in");
  await addMetric("bodyFat", "22.5", "%");
  await addMetric("water", "0.5", "l");
  await addMetric("water", "8", "fl oz (US)");
  await page.getByLabel("History type").selectOption("water");
  await expect(page.locator(".chart-dot")).toHaveCount(1);
  expect(
    Number(await page.locator(".chart-dot").getAttribute("data-value")),
  ).toBeCloseTo(736.5882365, 7);
  await addMetric("water", "50", "ml");
  const extra = page
    .locator(".metric-records .library-row")
    .filter({ hasText: "Water: 50 ml" });
  await extra.getByRole("button", { name: /Delete measurement/ }).click();
  await expect(extra).toHaveCount(0);
  await page.getByLabel("History type").selectOption("measurement");
  await page.getByLabel("History measurement name").fill("Waist");
  await expect(page.locator(".chart-dot")).toHaveCount(1);
  expect(
    Number(await page.locator(".chart-dot").getAttribute("data-value")),
  ).toBeCloseTo(81.28, 8);
  await page.getByLabel("History type").selectOption("weight");
  await accessibility(page, "metric-history");
  if (await exact(page, "Dismiss notification").count())
    await exact(page, "Dismiss notification").click();
  await page.screenshot({
    path: join(directory, "metric-history.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 420, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: join(directory, "metrics-narrow.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 1020, height: 800 });
  await exact(page, "Back to diary").click();
  await expect(
    page.getByText("736.59 ml recorded", { exact: true }),
  ).toBeVisible();
  return "Offline metrics/mixed units/multiple records/gapped chart/means, recipe servings/finished yield/source versions, atomic saved meals and edits";
}

export async function verifyMetricsRecipesPersistence(page) {
  const today = await page
    .getByLabel("Diary date", { exact: true })
    .inputValue();
  await expect(
    page.getByText("736.59 ml recorded", { exact: true }),
  ).toBeVisible();
  await exact(page, "Recipes").click();
  await expect(
    exact(page, "Edit recipe Synthetic cooked recipe"),
  ).toBeVisible();
  await exact(page, "Log recipe Synthetic cooked recipe").click();
  await expect(
    page.getByRole("status").filter({ hasText: "600 kcal" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Saved meals" })).toContainText(
    "v2 · 1 item · 400 kcal",
  );
  await exact(page, "Back to diary").click();
  await page
    .getByLabel("Diary date", { exact: true })
    .fill(priorDate(today, -2));
  await expect(page.getByTestId("daily-total")).toHaveText("1,050");
  await expect(
    page.locator(".entry-source").filter({ hasText: "recipe v1" }),
  ).toBeVisible();
  await page.getByLabel("Diary date", { exact: true }).fill(today);
  await exact(page, "Progress").click();
  await expect(page.locator(".metric-summary")).toContainText(
    "2/30 days recorded · 3 records · change +4 kg",
  );
  await expect(page.locator(".chart-dot")).toHaveCount(2);
  await exact(page, "Back to diary").click();
  await expect(page.getByTestId("daily-total")).toHaveText("650");
}
