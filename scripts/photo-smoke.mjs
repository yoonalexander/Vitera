import { expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
const exact = (page, name) => page.getByRole("button", { name, exact: true });
const invoke = (page, command, args = {}) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const dateBefore = (date, days) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
async function open(page) {
  await exact(page, "＋ Add food").click();
  await exact(page, "Photo").click();
}
async function upload(page, path) {
  await page.getByLabel("Meal photo", { exact: true }).setInputFiles(path);
  await expect(
    page.getByText(
      "Photo prepared. Metadata removed; original file stays on your device.",
      { exact: true },
    ),
  ).toBeVisible();
}
const item = {
  name: "Synthetic photo banana",
  foodId: "usda-v1-173944",
  quantity: 100,
  unit: "g",
  nutrients: { kcal: null, protein: null, carbohydrate: null, fat: null },
  assumptions: ["Synthetic visual portion: 100 g."],
  questions: [],
};

export async function photoSmoke(page, directory, accessibility) {
  let mode = "vision",
    calls = 0,
    pending = false;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/tags")
      return res.end(
        JSON.stringify({
          models: [{ name: "synthetic-vision" }, { name: "synthetic-draft" }],
        }),
      );
    if (req.url === "/api/show")
      return res.end(
        JSON.stringify({
          capabilities:
            mode === "text" || body.model === "synthetic-draft"
              ? ["completion"]
              : ["completion", "vision"],
        }),
      );
    calls++;
    const visual = body.messages.find((m) => m.images);
    expect(body.model).toBe(visual ? "synthetic-vision" : "synthetic-draft");
    if (visual) {
      expect(visual.images).toHaveLength(1);
      const jpeg = Buffer.from(visual.images[0], "base64");
      expect(jpeg.subarray(0, 2).toString("hex")).toBe("ffd8");
      expect(jpeg.includes(Buffer.from("Exif"))).toBe(false);
    } else {
      expect(body.messages[0].content).toContain("PHOTO inference");
      expect(body.messages[1].content).toContain("Photo observations");
      expect(body.format.properties.items).toBeDefined();
    }
    if (mode === "delay" || mode === "timeout") {
      pending = true;
      await new Promise((r) => setTimeout(r, mode === "timeout" ? 6000 : 1500));
    }
    if (mode === "rate") {
      res.statusCode = 503;
      return res.end("Private fixture body");
    }
    res.end(
      JSON.stringify({
        done: true,
        message: {
          content:
            mode === "malformed"
              ? "invalid JSON"
              : visual
                ? "A synthetic banana is visible. Portion uncertain."
                : JSON.stringify({ items: [item] }),
        },
      }),
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const config = {
    enabled: true,
    provider: "ollama",
    port: server.address().port,
    model: "synthetic-draft",
    visionModel: "synthetic-vision",
    timeoutSeconds: 5,
  };
  const today = await page
    .getByLabel("Diary date", { exact: true })
    .inputValue();
  const date = dateBefore(today, 10),
    noPhotoDate = dateBefore(today, 11);
  try {
    await invoke(page, "save_ai_config", { config });
    await open(page);
    await expect(exact(page, "Create draft")).toBeDisabled();
    await exact(page, "AI settings").click();
    await expect(page.getByLabel("Vision model (optional)")).toHaveValue(
      "synthetic-vision",
    );
    await exact(page, "Check models and readiness").click();
    await expect(page.getByText(/Photo model: synthetic-vision/)).toBeVisible();
    await accessibility(page, "photo-model-settings");
    await exact(page, "Close settings").click();
    // A corrupt upload is rejected without creating a diary record.
    await page.getByLabel("Meal photo", { exact: true }).setInputFiles({
      name: "bad.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("corrupt"),
    });
    await expect(page.getByRole("alert")).toContainText("Choose a JPEG");
    await upload(page, resolve("src-tauri/icons/128x128.png"));
    expect(await invoke(page, "get_day", { date })).toMatchObject({
      totalKcal: 0,
    });
    mode = "text";
    await exact(page, "Create draft").click();
    await expect(page.getByRole("alert")).toContainText("text-only");
    expect(calls).toBe(0);
    mode = "vision";
    await exact(page, "Create draft").click();
    const first = page.getByRole("region", {
      name: "Draft item 1",
      exact: true,
    });
    await expect(first).toBeVisible();
    await first.getByLabel("Portion amount").fill("150");
    for (const errorMode of ["malformed", "rate", "timeout"]) {
      mode = errorMode;
      await exact(page, "Generate new draft").click();
      await expect(page.getByRole("alert")).toContainText(
        errorMode === "malformed"
          ? "invalid draft"
          : errorMode === "rate"
            ? "503"
            : "timed out",
        { timeout: 12000 },
      );
      await expect(first.getByLabel("Portion amount")).toHaveValue("150");
      expect((await invoke(page, "get_day", { date })).entries).toHaveLength(0);
    }
    mode = "delay";
    pending = false;
    await exact(page, "Generate new draft").click();
    await expect.poll(() => pending).toBe(true);
    await exact(page, "Cancel request").click();
    await first.getByLabel("Portion amount").fill("100");
    await new Promise((r) => setTimeout(r, 1800));
    await expect(first.getByLabel("Portion amount")).toHaveValue("100");
    await page.getByLabel("Date", { exact: true }).fill(date);
    await first.getByLabel("Item name").fill("Reviewed photo banana");
    await first.getByRole("checkbox").check();
    await page
      .getByRole("checkbox", {
        name: "Keep the prepared photo locally with these diary items.",
      })
      .check();
    await accessibility(page, "photo-review");
    await page.screenshot({
      path: join(directory, "photo-review.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 420, height: 740 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await accessibility(page, "photo-review-narrow");
    await page.screenshot({
      path: join(directory, "photo-review-narrow.png"),
      fullPage: true,
    });
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    await page.setViewportSize({ width: 1020, height: 800 });
    await expect(exact(page, "Save reviewed items")).toBeEnabled();
    await exact(page, "Save reviewed items").evaluate((b) => {
      b.click();
      b.click();
    });
    await expect(page.getByRole("dialog")).not.toBeVisible();
    const day = await invoke(page, "get_day", { date });
    expect(day.entries).toHaveLength(1);
    expect(day.totalKcal).toBe(89);
    const entry = day.entries[0];
    expect(entry.ai.promptVersion).toBe("photo-1");
    expect(entry.ai.model).toBe("synthetic-draft");
    expect(entry.ai.visionModel).toBe("synthetic-vision");
    expect(entry.ai.assumptions.join(" ")).toContain("Photo estimate");
    expect(
      await invoke(page, "get_photo_attachment", {
        requestId: entry.ai.requestId,
      }),
    ).toMatchObject({ width: 128, height: 128 });
    await expect(
      invoke(page, "describe_photo", {
        photoId: entry.ai.photo.id,
        input: {
          requestId: randomUUID(),
          text: "",
          locale: "en",
          portionHints: null,
        },
      }),
    ).rejects.toThrow(/no longer available/);
    // HTML5 drop enters the same native preparation path; retention stays off.
    mode = "vision";
    await open(page);
    const bytes = Array.from(
      readFileSync(resolve("src-tauri/icons/128x128.png")),
    );
    const transfer = await page.evaluateHandle((bytes) => {
      const dt = new DataTransfer();
      dt.items.add(
        new File([new Uint8Array(bytes)], "drop.png", { type: "image/png" }),
      );
      return dt;
    }, bytes);
    await page
      .locator(".photo-drop")
      .dispatchEvent("drop", { dataTransfer: transfer });
    await transfer.dispose();
    await expect(
      page.getByText(
        "Photo prepared. Metadata removed; original file stays on your device.",
        { exact: true },
      ),
    ).toBeVisible();
    await exact(page, "Create draft").click();
    await expect(first).toBeVisible();
    await first.getByLabel("Item name").fill("Unretained photo banana");
    await first.getByRole("checkbox").check();
    await page.getByLabel("Date", { exact: true }).fill(noPhotoDate);
    await expect(
      page.getByRole("checkbox", { name: /Keep the prepared photo/ }),
    ).not.toBeChecked();
    await exact(page, "Save reviewed items").click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    const noPhoto = (await invoke(page, "get_day", { date: noPhotoDate }))
      .entries[0];
    expect(
      await invoke(page, "get_photo_attachment", {
        requestId: noPhoto.ai.requestId,
      }),
    ).toBeNull();
    // Cancel clears native temporary storage; no new diary writes.
    const temp = await invoke(page, "prepare_photo", {
      data: readFileSync(resolve("src-tauri/icons/128x128.png")).toString(
        "base64",
      ),
    });
    await invoke(page, "release_photo", { id: temp.id });
    await expect(
      invoke(page, "describe_photo", {
        photoId: temp.id,
        input: {
          requestId: randomUUID(),
          text: "",
          locale: "en",
          portionHints: null,
        },
      }),
    ).rejects.toThrow(/no longer available/);
    await invoke(page, "save_ai_config", { config: { ...config, port: 1 } });
    await open(page);
    await upload(page, resolve("src-tauri/icons/128x128.png"));
    await exact(page, "Create draft").click();
    await expect(page.getByRole("alert")).toContainText("could not be reached");
    await page.keyboard.press("Escape");
    writeFileSync(
      join(directory, "photo-fixtures.json"),
      JSON.stringify(
        {
          calls,
          date,
          noPhotoDate,
          entry,
          checks: [
            "upload and HTML5 drop",
            "metadata-free JPEG",
            "text-only blocked before chat",
            "malformed/503/timeout/offline recovery",
            "cancel/late reply preserves edit",
            "no automatic saves",
            "explicit review exactly once",
            "optional retention off",
            "temporary memory released",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  await page.getByLabel("Diary date", { exact: true }).fill(today);
}

export async function verifyPhotoPersistence(page, expectRetained = true) {
  const today = await page
    .getByLabel("Diary date", { exact: true })
    .inputValue();
  await page
    .getByLabel("Diary date", { exact: true })
    .fill(dateBefore(today, 10));
  await expect(page.getByTestId("daily-total")).toHaveText("89");
  await page
    .getByRole("button", { name: "Edit Reviewed photo banana", exact: true })
    .click();
  await page.locator("summary").filter({ hasText: "Meal photo" }).click();
  if (expectRetained) {
    await expect(page.getByAltText("Retained meal photo")).toBeVisible();
    await exact(page, "Remove retained photo").click();
  }
  await expect(
    page.getByText("No photo retained. Only estimate provenance is stored.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const day = await invoke(page, "get_day", { date: dateBefore(today, 10) });
  expect(day.totalKcal).toBe(89);
  expect(
    await invoke(page, "get_photo_attachment", {
      requestId: day.entries[0].ai.requestId,
    }),
  ).toBeNull();
  await page.getByLabel("Diary date", { exact: true }).fill(today);
}

export async function livePhotoEvaluation(page, directory, accessibility) {
  const sourceDirectory = resolve(
    process.env.CALPAL_PHOTO_BENCHMARK ?? "artifacts/photo-benchmark",
  );
  const references = JSON.parse(
    readFileSync(join(sourceDirectory, "references.json")),
  );
  expect(references.length).toBeGreaterThanOrEqual(3);
  const visionModel = process.env.CALPAL_VISION_MODEL ?? "gemma3:4b";
  const model = process.env.CALPAL_DRAFT_MODEL ?? "gemma4:e4b-it-q8_0";
  await invoke(page, "save_ai_config", {
    config: {
      enabled: true,
      provider: "ollama",
      port: 11434,
      model,
      visionModel,
      timeoutSeconds: 180,
    },
  });
  const today = await page
    .getByLabel("Diary date", { exact: true })
    .inputValue();
  const evaluations = [];
  for (const [i, reference] of references.entries()) {
    const prepared = await invoke(page, "prepare_photo", {
      data: readFileSync(join(sourceDirectory, reference.file)).toString(
        "base64",
      ),
    });
    const started = Date.now();
    let draft, error;
    try {
      draft = await invoke(page, "describe_photo", {
        photoId: prepared.id,
        input: {
          requestId: randomUUID(),
          text: "",
          locale: "en-CA",
          portionHints: null,
        },
      });
    } catch (e) {
      error = String(e);
    }
    await invoke(page, "release_photo", { id: prepared.id });
    const calories = draft?.items.reduce(
      (total, item) =>
        total + (item.calculated?.kcal ?? item.candidate.nutrients.kcal ?? 0),
      0,
    );
    const missing = draft?.items.some(
      (item) =>
        (item.calculated?.kcal ?? item.candidate.nutrients.kcal) === null,
    );
    evaluations.push({
      reference,
      model,
      visionModel,
      milliseconds: Date.now() - started,
      draft,
      error,
      estimateKcal: missing ? null : calories,
      absoluteErrorKcal:
        !missing && calories !== undefined
          ? Math.abs(calories - reference.kcal)
          : null,
    });
    writeFileSync(
      join(directory, "live-photo-evaluation.json"),
      JSON.stringify(evaluations, null, 2),
    );
    // Each real photo also travels through visible upload, optional context, correction and diary save.
    await open(page);
    await upload(page, join(sourceDirectory, reference.file));
    await page
      .getByLabel("Optional photo context")
      .fill(
        reference.ingredients.map((x) => `${x.grams} g ${x.name}`).join(", "),
      );
    await exact(page, "Create draft").click();
    await expect(
      page.getByRole("region", { name: "Draft item 1", exact: true }),
    ).toBeVisible({ timeout: 200000 });
    // Record the actual contextual UI draft before manual correction.
    evaluations[i].contextualReview = await page
      .locator(".ai-review-item")
      .allTextContents();
    evaluations[i].contextualItems = await Promise.all(
      (await page.locator(".ai-review-item").all()).map(async (row) => ({
        name: await row.getByLabel("Item name").inputValue(),
        quantity: await row.getByLabel("Portion amount").inputValue(),
        unit: await row.getByLabel("Portion unit").inputValue(),
        foodId: await row.getByLabel("Nutrition source").inputValue(),
      })),
    );
    let rows = page.locator(".ai-review-item");
    while ((await rows.count()) > 1)
      await rows
        .last()
        .getByRole("button", { name: /Remove item/ })
        .click();
    const row = rows.first();
    await row.getByLabel("Nutrition source").selectOption("");
    await row.getByLabel("Item name").fill(`Live photo ${reference.id}`);
    await row.getByLabel("Portion amount").fill(String(reference.mass));
    await row.getByLabel("Portion unit").selectOption("g");
    await row.getByLabel("Calories (kcal)").fill(String(reference.kcal));
    for (const key of ["Protein (g)", "Carbohydrate (g)", "Fat (g)"])
      await row.getByLabel(key, { exact: true }).fill("");
    await row.getByRole("checkbox").check();
    const date = dateBefore(today, 12 + i);
    await page.getByLabel("Date", { exact: true }).fill(date);
    if (i === 0)
      await page
        .getByRole("checkbox", { name: /Keep the prepared photo/ })
        .check();
    await accessibility(page, `photo-live-${i}`);
    await page.screenshot({
      path: join(directory, `photo-live-${i}.png`),
      fullPage: true,
    });
    await exact(page, "Save reviewed items").click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    const day = await invoke(page, "get_day", { date });
    const saved = day.entries.find(
      (x) => x.name === `Live photo ${reference.id}`,
    );
    expect(saved.kcal).toBe(reference.kcal);
    expect(saved.ai.model).toBe(model);
    expect(saved.ai.visionModel).toBe(visionModel);
    expect(saved.ai.promptVersion).toBe("photo-1");
    expect(saved.protein).toBeNull();
    evaluations[i].reviewed = {
      date,
      savedKcal: saved.kcal,
      manuallyCorrectedToDataset: true,
      retained: i === 0,
    };
    writeFileSync(
      join(directory, "live-photo-evaluation.json"),
      JSON.stringify(evaluations, null, 2),
    );
    await page.getByLabel("Diary date", { exact: true }).fill(today);
  }
  // Completion-only capability gating is exercised by the installed native fixture.
  // Do not assume any installed real model is text-only; capabilities can change.
  return evaluations;
}

export async function verifyLivePhotoPersistence(page) {
  const refs = JSON.parse(
    readFileSync(
      join(
        resolve(
          process.env.CALPAL_PHOTO_BENCHMARK ?? "artifacts/photo-benchmark",
        ),
        "references.json",
      ),
    ),
  );
  const today = await page
    .getByLabel("Diary date", { exact: true })
    .inputValue();
  for (const [i, reference] of refs.entries()) {
    const day = await invoke(page, "get_day", {
      date: dateBefore(today, 12 + i),
    });
    const saved = day.entries.find(
      (x) => x.name === `Live photo ${reference.id}`,
    );
    expect(saved.kcal).toBe(reference.kcal);
    expect(saved.ai.photo).toBeDefined();
    const retained = await invoke(page, "get_photo_attachment", {
      requestId: saved.ai.requestId,
    });
    if (i === 0) expect(retained).toMatchObject({ width: 640, height: 480 });
    else expect(retained).toBeNull();
  }
}
