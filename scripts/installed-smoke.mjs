import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import {
  nutritionSmoke,
  verifyNutritionPersistence,
} from "./nutrition-smoke.mjs";
import {
  metricsRecipesSmoke,
  verifyMetricsRecipesPersistence,
} from "./metrics-recipes-smoke.mjs";
import { aiSmoke, verifyAIPersistence, liveAiEvaluation } from "./ai-smoke.mjs";

// Tests the actual installed WebView2 application and native SQLite commands.
// All diary records, browser profiles, and screenshots stay in an isolated directory.
const executable = resolve(
  process.env.CALPAL_EXE ?? "src-tauri/target/debug/calpal.exe",
);
if (!existsSync(executable))
  throw new Error(`Build or install CalPal first: ${executable}`);
mkdirSync("artifacts", { recursive: true });
const directory = process.env.CALPAL_SMOKE_DIR
  ? resolve(process.env.CALPAL_SMOKE_DIR)
  : mkdtempSync(resolve("artifacts/smoke-"));
mkdirSync(directory, { recursive: true });
const dataDirectory = join(directory, "data");
const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
let child;
let browser;
const errors = [];
const results = [];

async function launch() {
  child = spawn(executable, [], {
    windowsHide: true,
    env: {
      ...process.env,
      CALPAL_DATA_DIR: dataDirectory,
      WEBVIEW2_USER_DATA_FOLDER: join(directory, "webview"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
    stdio: "ignore",
  });
  child.on("error", (failure) => errors.push(failure.message));
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  if (!browser)
    throw new Error(
      "Installed application did not expose its test WebView2 connection.",
    );
  const context = browser.contexts()[0];
  let page = context.pages()[0];
  if (!page) page = await context.waitForEvent("page", { timeout: 15000 });
  page.on("pageerror", (failure) => errors.push(failure.message));
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "＋ Add food", exact: true }),
  ).toBeEnabled();
  await context.setOffline(true);
  return page;
}

async function stop() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = undefined;
  }
  if (child?.pid && child.exitCode === null) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  child = undefined;
}

async function accessibility(page, label) {
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  writeFileSync(
    join(directory, `accessibility-${label}.json`),
    JSON.stringify(audit.violations, null, 2),
  );
  expect(
    audit.violations.map(
      (item) =>
        `${item.id}: ${item.nodes.map((node) => node.target).join(", ")}`,
    ),
  ).toEqual([]);
}

try {
  let page = await launch();
  const total = () => page.getByTestId("daily-total");
  const existing = await total().textContent();
  const repeat = process.argv.includes("--verify-existing");
  if (!repeat) {
    await expect(total()).toHaveText("0");
    await page
      .getByRole("button", { name: "＋ Add food", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Food name" }),
    ).toBeFocused();
    await page.getByRole("textbox", { name: "Food name" }).fill("Smoke lunch");
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("spinbutton", { name: "Calories (kcal)" }),
    ).toBeFocused();
    await page.keyboard.type("450.5");
    await page.keyboard.press("Enter");
    await expect(total()).toHaveText("451");
    await page.getByRole("button", { name: "Edit Smoke lunch" }).click();
    await page.getByRole("spinbutton", { name: "Calories (kcal)" }).fill("650");
    await page.getByRole("button", { name: "Save to diary" }).click();
    await expect(total()).toHaveText("650");
    await page.getByRole("button", { name: "Delete Smoke lunch" }).click();
    await expect(total()).toHaveText("0");
    await page.getByRole("button", { name: "Undo delete" }).click();
    await expect(total()).toHaveText("650");
    await page.getByRole("button", { name: "Dismiss notification" }).click();
    results.push("Offline add/edit/delete/undo and keyboard form submission");

    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(total()).toHaveText("0");
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(total()).toHaveText("650");
    results.push("Separate diary dates");
  } else {
    expect(existing).toBe("650");
    results.push("Existing diary survives installer reinstallation");
  }
  if (process.argv.includes("--nutrition") && !repeat)
    results.push(await nutritionSmoke(page, directory, accessibility));
  if (process.argv.includes("--metrics-recipes") && !repeat)
    results.push(await metricsRecipesSmoke(page, directory, accessibility));
  if (process.argv.includes("--ai") && !repeat)
    results.push(await aiSmoke(page, directory, accessibility));
  if (
    process.argv.includes("--ai-live") &&
    (!repeat || process.argv.includes("--evaluate-live"))
  )
    results.push(await liveAiEvaluation(page, directory, accessibility));
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Appearance" })
    .selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await accessibility(page, "diary-light");
  await page.screenshot({
    path: join(directory, "diary-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "＋ Add food", exact: true }).click();
  await accessibility(page, "food-form");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "＋ Add food", exact: true }),
  ).toBeFocused();
  results.push("Dialog accessibility, Escape, and focus restoration");

  for (const destination of ["Recipes", "Progress"]) {
    await page.getByRole("button", { name: destination, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: destination, exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to diary" }).click();
  }
  results.push("Today / Recipes / Progress navigation");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await accessibility(page, "diary-dark");
  await page.screenshot({
    path: join(directory, "diary-dark.png"),
    fullPage: true,
  });
  // Browser viewport emulation also checks layout at a narrow width and doubled text size.
  await page.setViewportSize({ width: 420, height: 800 });
  if (await page.getByRole("button", { name: "Dismiss notification" }).count())
    await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: join(directory, "diary-narrow.png"),
    fullPage: true,
  });
  await stop();
  page = await launch();
  await expect(page.getByTestId("daily-total")).toHaveText("650");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "Edit Smoke lunch" }),
  ).toBeVisible();
  if (process.argv.includes("--nutrition")) {
    await verifyNutritionPersistence(
      page,
      process.argv.includes("--metrics-recipes") ? 1 : 0,
    );
    results.push(
      "Restart preserves goals, favorites, custom food versions, original nutrition snapshots and completion coverage",
    );
  }
  if (process.argv.includes("--metrics-recipes")) {
    await verifyMetricsRecipesPersistence(page);
    results.push(
      "Restart preserves metrics, original recipe/ingredient snapshots, recipe versions and saved meal copies",
    );
  }
  expect(existsSync(join(dataDirectory, "calpal.sqlite3"))).toBe(true);
  if (process.argv.includes("--ai")) {
    await verifyAIPersistence(page);
    results.push(
      "Restart preserves reviewed AI provenance, source snapshots and two-item diary total",
    );
  }
  expect(errors).toEqual([]);
  results.push("Actual app restart preserves SQLite diary and settings");
  writeFileSync(
    join(directory, "results.json"),
    JSON.stringify({ executable, directory, results, errors }, null, 2),
  );
  console.log(
    JSON.stringify({ passed: results, artifacts: directory }, null, 2),
  );
} catch (failure) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    await page
      .screenshot({ path: join(directory, "failure.png"), fullPage: true })
      .catch(() => {});
    writeFileSync(join(directory, "failure.txt"), String(failure));
  }
  throw failure;
} finally {
  await stop();
}
