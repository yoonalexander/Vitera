import { expect } from "@playwright/test";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const exact = (page, name) => page.getByRole("button", { name, exact: true });
const invoke = (page, command, args = {}) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const priorDate = (date, offset) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const candidate = (patch = {}) => ({
  name: "Synthetic sandwich",
  foodId: null,
  quantity: 1,
  unit: "serving",
  nutrients: { kcal: 350, protein: null, carbohydrate: 30, fat: null },
  assumptions: ["Synthetic fixture assumes one sandwich."],
  questions: [],
  ...patch,
});
const valid = () => ({
  items: [
    candidate({
      name: "Synthetic banana",
      foodId: "usda-v1-173944",
      quantity: 100,
      unit: "g",
      nutrients: { kcal: 999, protein: null, carbohydrate: null, fat: null },
      assumptions: [],
    }),
    candidate(),
  ],
});
async function open(page) {
  await exact(page, "＋ Add food").click();
  await exact(page, "Describe").click();
}

export async function aiSmoke(page, directory, accessibility) {
  let mode = "valid",
    calls = 0,
    delayed = false;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : {};
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/tags")
      return res.end(JSON.stringify({ models: [{ name: "synthetic-local" }] }));
    if (req.url === "/api/show")
      return res.end(JSON.stringify({ capabilities: ["completion"] }));
    expect(req.url).toBe("/api/chat");
    calls++;
    expect(body.stream).toBe(false);
    expect(body.format.properties.items).toBeDefined();
    expect(body.messages[1].content).toContain("Synthetic meal");
    if (mode === "delayed" || mode === "timeout") {
      delayed = true;
      await new Promise((r) => setTimeout(r, mode === "timeout" ? 6000 : 1200));
    }
    if (mode === "malformed")
      return res.end(
        JSON.stringify({ done: true, message: { content: "not JSON" } }),
      );
    if (mode === "rate") {
      res.statusCode = 429;
      return res.end("Synthetic private error body");
    }
    const result = valid();
    if (mode === "unresolved") {
      result.items[0].quantity = null;
      result.items[0].unit = null;
      result.items[1].unit = "bucket";
    }
    res.end(
      JSON.stringify({
        done: true,
        message: { content: JSON.stringify(result) },
      }),
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const config = {
    enabled: true,
    provider: "ollama",
    port,
    model: "synthetic-local",
    timeoutSeconds: 5,
  };
  const today = await page
    .getByLabel("Diary date", { exact: true })
    .inputValue();
  try {
    await open(page);
    await expect(exact(page, "Create draft")).toBeDisabled();
    await page
      .getByLabel("Meal description")
      .fill("Synthetic meal: banana and sandwich");
    await exact(page, "AI settings").click();
    await page.getByRole("combobox", { name: "Local AI" }).selectOption("true");
    await page.getByLabel("Ollama port").fill(String(port));
    await page
      .getByLabel("Local model", { exact: true })
      .fill("synthetic-local");
    await page.getByLabel("Request timeout (seconds)").fill("5");
    await exact(page, "Check models and readiness").click();
    await expect(page.getByText(/Local model is ready/)).toBeVisible();
    await accessibility(page, "ai-settings");
    await exact(page, "Save AI settings").click();
    await expect(
      page.getByText("AI settings saved.", { exact: true }),
    ).toBeVisible();
    await exact(page, "Close settings").click();
    await expect(page.getByLabel("Meal description")).toHaveValue(
      "Synthetic meal: banana and sandwich",
    );
    await exact(page, "Create draft").click();
    const first = page.getByRole("region", {
      name: "Draft item 1",
      exact: true,
    });
    const second = page.getByRole("region", {
      name: "Draft item 2",
      exact: true,
    });
    await expect(first).toBeVisible();
    await expect(
      first.getByText("89 kcal · local record with reviewed portion"),
    ).toBeVisible();
    await first.getByLabel("Portion amount").fill("150");
    await expect(
      first.getByText("134 kcal · local record with reviewed portion"),
    ).toBeVisible();
    await second.getByLabel("Calories (kcal)").fill("400");
    // Opening settings preserves an edited draft and original text.
    await exact(page, "AI settings").click();
    await exact(page, "Close settings").click();
    await expect(second.getByLabel("Calories (kcal)")).toHaveValue("400");
    mode = "malformed";
    await exact(page, "Generate new draft").click();
    await expect(page.getByRole("alert")).toContainText("invalid draft");
    await expect(second.getByLabel("Calories (kcal)")).toHaveValue("400");
    mode = "rate";
    await exact(page, "Generate new draft").click();
    await expect(page.getByRole("alert")).toContainText("HTTP 429");
    await expect(page.getByRole("alert")).not.toContainText(
      "private error body",
    );
    mode = "delayed";
    delayed = false;
    await exact(page, "Generate new draft").click();
    await expect.poll(() => delayed).toBe(true);
    await second.getByLabel("Item name").fill("Corrected synthetic sandwich");
    await expect(exact(page, "Generate new draft")).toBeVisible();
    await page.waitForTimeout(1400);
    await expect(second.getByLabel("Item name")).toHaveValue(
      "Corrected synthetic sandwich",
    );
    await expect(second.getByLabel("Calories (kcal)")).toHaveValue("400");
    mode = "timeout";
    await exact(page, "Generate new draft").click();
    await expect(page.getByRole("alert")).toContainText("timed out", {
      timeout: 10000,
    });
    await expect(first.getByLabel("Portion amount")).toHaveValue("150");
    await invoke(page, "save_ai_config", {
      config: { ...config, model: "missing-local" },
    });
    await exact(page, "Generate new draft").click();
    await expect(page.getByRole("alert")).toContainText(
      "not installed locally",
    );
    await expect(second.getByLabel("Calories (kcal)")).toHaveValue("400");
    await invoke(page, "save_ai_config", { config });
    mode = "unresolved";
    await exact(page, "Generate new draft").click();
    await expect(first.getByLabel("Portion amount")).toHaveValue("");
    await expect(second.getByLabel("Portion unit")).toHaveValue("bucket");
    await expect(exact(page, "Save reviewed items")).toBeDisabled();
    await first.getByLabel("Portion amount").fill("150");
    await first.getByLabel("Portion unit").selectOption("g");
    await second.getByLabel("Portion unit").selectOption("serving");
    await second.getByLabel("Calories (kcal)").fill("400");
    await second.getByLabel("Item name").fill("Corrected synthetic sandwich");
    for (const item of [first, second])
      await item.getByRole("checkbox").check();
    await expect(exact(page, "Save reviewed items")).toBeEnabled();
    await accessibility(page, "ai-review");
    await page.screenshot({
      path: join(directory, "ai-review.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 420, height: 800 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await page
        .getByRole("dialog", { name: "Describe a meal" })
        .evaluate((d) => d.scrollWidth <= d.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: join(directory, "ai-review-narrow.png"),
      fullPage: true,
    });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await page.setViewportSize({ width: 1020, height: 800 });
    await page
      .getByRole("dialog", { name: "Describe a meal" })
      .getByLabel("Date", { exact: true })
      .fill(priorDate(today, -8));
    // Two clicks in the same event turn exercise the real UI mutation guard.
    await exact(page, "Save reviewed items").evaluate((button) => {
      button.click();
      button.click();
    });
    await expect(
      page.getByRole("dialog", { name: "Describe a meal" }),
    ).not.toBeVisible();
    await expect(page.getByTestId("daily-total")).toHaveText("650");
    const day = await invoke(page, "get_day", { date: priorDate(today, -8) });
    expect(day.entries.length).toBe(2);
    expect(day.totalKcal).toBe(533.5);
    expect(day.entries[0].ai || day.entries[1].ai).toBeTruthy();
    // The same native reviewed receipt cannot be copied with newly generated IDs.
    const entries = day.entries.map(
      ({ id, date, meal, name, kcal, revision, deleted, ...nutrition }) => ({
        id,
        date,
        meal,
        name,
        kcal,
        revision: null,
        nutrition,
      }),
    );
    const retry = await invoke(page, "save_ai_draft", { entries }).then(
      () => "saved",
      (e) => String(e),
    );
    expect(retry).toContain("already been saved"); // request differs: native-calculated values versus original review input
    expect(
      (await invoke(page, "get_day", { date: priorDate(today, -8) })).entries
        .length,
    ).toBe(2);
    await invoke(page, "save_ai_config", {
      config: { ...config, model: "missing-local" },
    });
    await exact(page, "＋ Add food").click();
    await page
      .getByLabel("Food name", { exact: true })
      .fill("Manual with unavailable AI");
    await page.getByLabel("Calories (kcal)", { exact: true }).fill("42");
    await exact(page, "Save to diary").click();
    await expect(page.getByTestId("daily-total")).toHaveText("692");
    await exact(page, "Delete Manual with unavailable AI").click();
    await expect(page.getByTestId("daily-total")).toHaveText("650");
    await invoke(page, "save_ai_config", {
      config: { ...config, enabled: false, port: 11434, model: "" },
    });
    expect(calls).toBe(6);
    await verifyAIPersistence(page);
    return "Installed native AI fixtures: settings/draft retention, corrected multi-item save once, unknown units/missing portions, malformed replies, HTTP failures, unavailable model, cancellation/late reply, timeout, accessibility and narrow text layout";
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

export async function verifyAIPersistence(page) {
  const today = await page
    .getByLabel("Diary date", { exact: true })
    .inputValue();
  await page
    .getByLabel("Diary date", { exact: true })
    .fill(priorDate(today, -8));
  await expect(page.getByTestId("daily-total")).toHaveText("534");
  await expect(exact(page, "Edit Corrected synthetic sandwich")).toBeVisible();
  await expect(
    page
      .locator(".entry-source")
      .filter({ hasText: "AI-only reviewed estimate" }),
  ).toBeVisible();
  await expect(page.locator(".entry-assumptions")).toHaveCount(2);
  await exact(page, "Edit Corrected synthetic sandwich").click();
  await page.getByText("Original AI item", { exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("synthetic-local");
  await page.keyboard.press("Escape");
  await page.getByLabel("Diary date", { exact: true }).fill(today);
  await expect(page.getByTestId("daily-total")).toHaveText("650");
}

export async function liveAiEvaluation(page, directory, accessibility) {
  const config = {
    enabled: true,
    provider: "ollama",
    port: 11434,
    model: process.env.CALPAL_OLLAMA_MODEL ?? "gemma3:4b",
    timeoutSeconds: 180,
  };
  await invoke(page, "save_ai_config", { config });
  const samples = [
    {
      text: "100 g raw banana and 100 g hard-boiled whole egg.",
      expectedKcal: 244,
      expectedItems: 2,
    },
    {
      text: "40 g dry oats and 200 g whole milk (3.25% fat).",
      expectedKcal: 273.6,
      expectedItems: 2,
    },
    {
      text: "Two hard-boiled eggs and one medium raw banana.",
      expectedKcal: 260.02,
      expectedItems: 2,
    },
    {
      text: "One sandwich with toast, butter and cheese. I don't know the amounts.",
      expectedKcal: null,
      expectedItems: null,
    },
  ];
  const evaluation = [];
  for (const sample of samples) {
    const start = Date.now();
    try {
      const draft = await invoke(page, "describe_meal", {
        input: {
          requestId: crypto.randomUUID(),
          text: sample.text,
          locale: "en-CA",
          portionHints: null,
        },
      });
      const known = draft.items.filter(
        (i) => i.calculated?.kcal !== null && !!i.calculated,
      );
      const total = known.reduce((n, i) => n + i.calculated.kcal, 0);
      const complete =
        known.length === draft.items.length &&
        draft.items.length === sample.expectedItems;
      evaluation.push({
        ...sample,
        elapsedMs: Date.now() - start,
        items: draft.items.length,
        matches: known.length,
        resolvedItems: draft.items.filter((i) => !i.issues.length).length,
        totalLocalKcal: total,
        absoluteKcalError:
          sample.expectedKcal === null || !complete
            ? null
            : Math.abs(total - sample.expectedKcal),
        draft,
      });
    } catch (e) {
      evaluation.push({
        ...sample,
        elapsedMs: Date.now() - start,
        error: String(e),
      });
    }
  }
  writeFileSync(
    join(directory, "live-ai-evaluation.json"),
    JSON.stringify(
      {
        model: config.model,
        promptVersion: "description-1",
        samples: evaluation,
      },
      null,
      2,
    ),
  );
  expect(evaluation.some((e) => !e.error)).toBe(true);
  // Exercise a real description through the visible composer; save an explicitly corrected draft.
  await open(page);
  await page.getByLabel("Meal description").fill(samples[0].text);
  await exact(page, "Create draft").click();
  const rows = page.locator(".ai-review-item");
  await expect(rows).toHaveCount(2, { timeout: 190000 });
  const catalog = await invoke(page, "get_library");
  for (const [i, id] of ["usda-v1-173944", "usda-v1-173424"].entries()) {
    const row = rows.nth(i);
    const food = catalog.foods.find((f) => f.id === id);
    expect(food).toBeDefined();
    await row.getByLabel("Nutrition source").selectOption(id);
    await row.getByLabel("Portion amount").fill("100");
    await row.getByLabel("Portion unit").selectOption("g");
    await row
      .getByLabel("Item name")
      .fill(`Live reviewed ${i === 0 ? "banana" : "egg"}`);
    await row.getByRole("checkbox").check();
  }
  await accessibility(page, "ai-live-review");
  await page.screenshot({
    path: join(directory, "ai-live-review.png"),
    fullPage: true,
  });
  const today = await page
    .getByLabel("Diary date", { exact: true })
    .inputValue();
  const prior = await invoke(page, "get_day", { date: priorDate(today, -9) });
  for (const entry of prior.entries.filter((e) =>
    e.name.startsWith("Live reviewed "),
  ))
    await invoke(page, "delete_entry", {
      id: entry.id,
      revision: entry.revision,
    });
  await page
    .getByRole("dialog")
    .getByLabel("Date", { exact: true })
    .fill(priorDate(today, -9));
  await exact(page, "Save reviewed items").click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const saved = await invoke(page, "get_day", { date: priorDate(today, -9) });
  expect(saved.totalKcal).toBe(244);
  expect(saved.entries.length).toBe(2);
  expect(saved.entries.every((e) => e.ai?.model === config.model)).toBe(true);
  await invoke(page, "save_ai_config", {
    config: { ...config, enabled: false },
  });
  return `Real local ${config.model}: ${evaluation.filter((e) => !e.error).length}/${samples.length} descriptions produced drafts; independently corrected visible two-item review saved at 244 kcal. Detailed raw results are recorded separately from fixtures.`;
}
