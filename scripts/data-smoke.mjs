import { expect } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

async function open(page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Export & backup", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Export diary CSV" }),
  ).toBeFocused();
}
async function choose(page, name, data) {
  await page.getByLabel("Choose Vitera backup").setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(data),
  });
}
async function exported(page, directory, kind) {
  await page
    .getByRole("button", {
      name: kind === "backup" ? "Save complete backup" : `Export ${kind} CSV`,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved to" }),
  ).toBeVisible();
  const message = await page
    .getByRole("status")
    .filter({ hasText: "Saved to" })
    .textContent();
  const path = message.slice("Saved to ".length);
  expect(path.startsWith(directory)).toBe(true);
  return { path, data: readFileSync(path, "utf8") };
}
const rowTable = (backup, name) => backup.tables.find((t) => t.name === name);

export async function dataExportSmoke(page, directory, accessibility) {
  await open(page);
  const theme = await page.locator("html").getAttribute("data-theme");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await accessibility(page, "data-light");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await accessibility(page, "data-dark");
  await page.evaluate((theme) => {
    document.documentElement.dataset.theme = theme;
  }, theme);
  const csv = await exported(page, directory, "diary");
  expect(csv.data.startsWith("\uFEFF")).toBe(true);
  expect(csv.data).toContain('"Smoke lunch"');
  expect(csv.data).toContain('"650.0"');
  const metrics = await exported(page, directory, "metrics");
  expect(metrics.data).toContain('"canonical_value"');
  const saved = await exported(page, directory, "backup");
  const backup = JSON.parse(saved.data);
  expect(saved.path.endsWith(".vitera")).toBe(true);
  expect(backup.format).toBe("Vitera backup");
  expect(backup.version).toBe(2);
  expect(backup.schema).toBe(6);
  expect(backup.tables.length).toBe(12);
  expect(saved.data).not.toContain("credential_ref");
  expect(saved.data).not.toContain("credentialRef");
  // Exercise both the old extension and format through the actual restore UI.
  const legacy = structuredClone(backup);
  legacy.format = "CalPal backup";
  legacy.version = 1;
  legacy.schema = 5;
  rowTable(legacy, "settings").rows[0].pop();
  await choose(page, "valid.calpal", JSON.stringify(legacy));
  await expect(
    page.getByRole("heading", { name: "Backup ready to restore" }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Replace records from backup" }),
  ).toBeDisabled();
  await accessibility(page, "backup-preview");
  await page
    .getByRole("dialog", { name: "Export & backup" })
    .screenshot({ path: join(directory, "backup-preview.png") });
  await page.setViewportSize({ width: 420, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .getByRole("dialog", { name: "Export & backup" })
      .evaluate((d) => d.scrollWidth <= d.clientWidth),
  ).toBe(true);
  await page
    .getByLabel("I understand this replaces all current records.")
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByLabel("I understand this replaces all current records."),
  ).toBeInViewport();
  await page.screenshot({
    path: join(directory, "backup-narrow.png"),
    fullPage: true,
  });
  await accessibility(page, "backup-narrow");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 1020, height: 800 });
  const cases = [
    ["truncated", "{"],
    ["future", JSON.stringify({ ...backup, version: 99 })],
    [
      "extra-secret-field",
      JSON.stringify({ ...backup, token: "never-import-this" }),
    ],
  ];
  const duplicate = structuredClone(backup);
  rowTable(duplicate, "diary_entries").rows.push(
    rowTable(duplicate, "diary_entries").rows[0],
  );
  cases.push(["duplicate", JSON.stringify(duplicate)]);
  const negative = structuredClone(backup);
  rowTable(negative, "diary_entries").rows[0][4] = -1;
  cases.push(["negative", JSON.stringify(negative)]);
  const invalidPalette = structuredClone(backup);
  rowTable(invalidPalette, "settings").rows[0][2] =
    '{"light":{"canvas":"url(x)"},"dark":null}';
  cases.push(["invalid-palette", JSON.stringify(invalidPalette)]);
  if (rowTable(backup, "photo_attachments").rows.length) {
    const bad = structuredClone(backup);
    rowTable(bad, "photo_attachments").rows[0][1] = "invalid-image";
    cases.push(["invalid-photo", JSON.stringify(bad)]);
  }
  for (const [name, data] of cases) {
    await choose(page, `${name}.calpal`, data);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Backup ready to restore" }),
    ).toHaveCount(0);
    await expect(page.getByTestId("daily-total")).toHaveText("650");
  }
  const after = JSON.parse((await exported(page, directory, "backup")).data);
  expect(after.tables).toEqual(backup.tables);
  // Closing a preview never restores; Escape returns focus to the settings action.
  await choose(page, "cancel.calpal", saved.data);
  await expect(
    page.getByRole("heading", { name: "Backup ready to restore" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Export & backup", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  writeFileSync(
    join(directory, "data-export-results.json"),
    JSON.stringify(
      {
        backup: saved.path,
        invalidCases: cases.map(([n]) => n),
        counts: backup.tables.map((t) => [t.name, t.rows.length]),
      },
      null,
      2,
    ),
  );
  return saved.path;
}

export async function dataImportSmoke(page, directory, source, accessibility) {
  const data = readFileSync(source, "utf8"),
    backup = JSON.parse(data);
  await open(page);
  await choose(page, "populated.calpal", data);
  await expect(
    page.getByRole("heading", { name: "Backup ready to restore" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Replace records from backup" }),
  ).toBeDisabled();
  await page
    .getByLabel("I understand this replaces all current records.")
    .focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Replace records from backup" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Restore complete." }),
  ).toBeVisible();
  const message = await page
    .getByRole("status")
    .filter({ hasText: "Restore complete." })
    .textContent();
  const recovery = message.split("backed up at ")[1];
  expect(existsSync(recovery)).toBe(true);
  const previous = JSON.parse(readFileSync(recovery, "utf8"));
  expect(rowTable(previous, "diary_entries").rows.length).toBe(1);
  expect(rowTable(previous, "diary_entries").rows[0][3]).toBe("Smoke lunch");
  await expect(page.getByTestId("daily-total")).toHaveText("650");
  await accessibility(page, "restore-dark");
  const restored = JSON.parse((await exported(page, directory, "backup")).data);
  const currentDate = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  for (const table of backup.tables) {
    if (table.name !== "ai_config") {
      const expected =
        table.name === "settings" && backup.schema === 5
          ? table.rows.map((row) => [...row, null])
          : table.rows;
      const actual = rowTable(restored, table.name).rows;
      if (table.name === "diary_days") {
        const added = actual.filter(
          (row) => !expected.some((old) => old[0] === row[0]),
        );
        // Opening the diary initializes today's target snapshot. Older backups
        // still have to preserve every original row, with no other extra data.
        const latestGoal = rowTable(backup, "goal_versions")
          .rows.filter((row) => row[1] <= currentDate)
          .sort((a, b) => b[1].localeCompare(a[1]) || b[0] - a[0])[0];
        if (added.length)
          expect(added).toEqual([
            [currentDate, latestGoal ? JSON.parse(latestGoal[2]) : null, 0],
          ]);
        expect(
          actual.filter((row) => expected.some((old) => old[0] === row[0])),
        ).toEqual(expected);
      } else expect(actual).toEqual(expected);
    }
  }
  const config = JSON.parse(rowTable(restored, "ai_config").rows[0][1]);
  expect(config.enabled).toBe(false);
  // Recover the prior installation and then restore the populated copy again.
  for (const [name, contents] of [
    ["recovery", readFileSync(recovery, "utf8")],
    ["populated", data],
  ]) {
    await choose(page, `${name}.calpal`, contents);
    await expect(
      page.getByRole("heading", { name: "Backup ready to restore" }),
    ).toBeVisible();
    await page
      .getByLabel("I understand this replaces all current records.")
      .check();
    await page
      .getByRole("button", { name: "Replace records from backup" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Restore complete." }),
    ).toBeVisible();
    await expect(page.getByTestId("daily-total")).toHaveText("650");
  }
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  writeFileSync(
    join(directory, "data-import-results.json"),
    JSON.stringify(
      {
        source,
        recovery,
        counts: restored.tables.map((t) => [t.name, t.rows.length]),
        tablesPreserved: 11,
        aiDisabled: true,
      },
      null,
      2,
    ),
  );
  const syntheticPhoto = rowTable(backup, "diary_entries").rows.find(
    (row) => row[3] === "Reviewed photo banana",
  );
  const requestId = syntheticPhoto?.[9]
    ? JSON.parse(syntheticPhoto[9]).ai?.requestId
    : null;
  return {
    retainedPhoto: rowTable(backup, "photo_attachments").rows.some(
      (row) => row[0] === requestId,
    ),
  };
}
