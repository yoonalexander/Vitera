import { expect } from "@playwright/test";
import { join } from "node:path";
import { presets, colorFields } from "../src/palette.ts";

const rootColor = (page, name) =>
  page.evaluate(
    (name) => document.documentElement.style.getPropertyValue(`--${name}`),
    name,
  );
const paletteDialog = (page) =>
  page.getByRole("dialog", { name: "Color palette", exact: true });
async function open(page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: /^Color palette/ }).click();
  await expect(paletteDialog(page)).toBeVisible();
}
async function cancel(page) {
  await paletteDialog(page)
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Color palette/ }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Done", exact: true }).click();
}
export async function paletteSmoke(page, directory, accessibility) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Appearance" })
    .selectOption("light");
  await page.getByRole("button", { name: /^Color palette/ }).click();
  const dialog = paletteDialog(page);
  await expect(
    dialog.getByRole("button", { name: "Light colors", exact: true }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Ocean", exact: true }).click();
  await expect
    .poll(() => rootColor(page, "canvas"))
    .toBe(presets[1].light.canvas);
  await dialog.getByRole("checkbox", { name: "Preview across app" }).uncheck();
  await expect
    .poll(() => rootColor(page, "canvas"))
    .toBe(presets[0].light.canvas);
  await dialog.getByRole("checkbox", { name: "Preview across app" }).check();
  await dialog
    .getByRole("textbox", { name: "Header hex", exact: true })
    .fill("#133453");
  await dialog.getByRole("textbox", { name: "Header hex", exact: true }).blur();
  await expect.poll(() => rootColor(page, "header")).toBe("#133453");
  // Simulate a native color pick through the same input/change events.
  await dialog
    .getByLabel("Accent & buttons color", { exact: true })
    .evaluate((input) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(input, "#214e87");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await expect(
    dialog.getByRole("textbox", { name: "Accent & buttons hex", exact: true }),
  ).toHaveValue("#214e87");
  await accessibility(page, "palette-light");
  await dialog.screenshot({ path: join(directory, "palette-light.png") });

  const accent = dialog.getByRole("textbox", {
    name: "Accent & buttons hex",
    exact: true,
  });
  await accent.fill("#ffffff");
  await expect(dialog.getByRole("status")).toContainText(
    "Some text may be hard to read",
  );
  await expect(
    dialog.getByRole("button", { name: "Save palette", exact: true }),
  ).toBeEnabled();
  expect(await dialog.evaluate((el) => getComputedStyle(el).color)).toBe(
    "rgb(32, 36, 45)",
  );
  await accent.fill("invalid");
  await expect(
    dialog.getByRole("button", { name: "Save palette", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Dark colors", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Save palette", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Plum", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Light colors", exact: true })
    .click();
  await accent.fill("214E87");
  await accent.blur();
  await expect(accent).toHaveValue("#214e87");

  await page.setViewportSize({ width: 420, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dialog
    .getByRole("button", { name: "Save palette", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole("button", { name: "Save palette", exact: true }),
  ).toBeInViewport();
  await accessibility(page, "palette-narrow");
  await page.screenshot({ path: join(directory, "palette-narrow.png") });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 1020, height: 800 });
  await dialog
    .getByRole("button", { name: "Save palette", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Color palette/ }),
  ).toBeFocused();
  await expect.poll(() => rootColor(page, "header")).toBe("#133453");
  await page.getByRole("button", { name: "Done", exact: true }).click();

  await open(page);
  await paletteDialog(page)
    .getByRole("button", { name: "Ember", exact: true })
    .click();
  await paletteDialog(page).press("Escape");
  await expect.poll(() => rootColor(page, "header")).toBe("#133453");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await open(page);
  await paletteDialog(page)
    .getByRole("button", { name: "Reset light colors", exact: true })
    .click();
  await expect
    .poll(() => rootColor(page, "canvas"))
    .toBe(presets[0].light.canvas);
  await cancel(page);
  await expect.poll(() => rootColor(page, "header")).toBe("#133453");

  await open(page);
  await paletteDialog(page)
    .getByRole("button", { name: "Reset light colors", exact: true })
    .click();
  await paletteDialog(page)
    .getByRole("button", { name: "Save palette", exact: true })
    .click();
  await expect
    .poll(() => rootColor(page, "canvas"))
    .toBe(presets[0].light.canvas);
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
  await expect
    .poll(() => rootColor(page, "canvas"))
    .toBe(presets[2].dark.canvas);
  await page
    .getByRole("combobox", { name: "Appearance" })
    .selectOption("light");
  await page.getByRole("button", { name: /^Color palette/ }).click();
  await paletteDialog(page)
    .getByRole("button", { name: "Ocean", exact: true })
    .click();
  await paletteDialog(page)
    .getByRole("textbox", { name: "Header hex", exact: true })
    .fill("#133453");
  await paletteDialog(page)
    .getByRole("textbox", { name: "Accent & buttons hex", exact: true })
    .fill("#214e87");
  await paletteDialog(page)
    .getByRole("button", { name: "Save palette", exact: true })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Appearance" })
    .selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect
    .poll(() => rootColor(page, "canvas"))
    .toBe(presets[2].dark.canvas);
  await page.emulateMedia({ colorScheme: "light" });
  await expect
    .poll(() => rootColor(page, "canvas"))
    .toBe(presets[1].light.canvas);
  await page.emulateMedia({ colorScheme: null });
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  return "Custom light/dark palettes, presets, hex and picker edits, live preview, contrast guidance, safe invalid edits, cancel/reset, system switching and narrow accessible editor";
}
export async function verifyPalettePersistence(page) {
  await expect
    .poll(() => rootColor(page, "canvas"))
    .toBe(presets[2].dark.canvas);
  await open(page);
  for (const mode of ["dark", "light"]) {
    const dialog = paletteDialog(page);
    await dialog
      .getByRole("button", {
        name: `${mode === "dark" ? "Dark" : "Light"} colors`,
        exact: true,
      })
      .click();
    const expected =
      mode === "dark"
        ? presets[2].dark
        : { ...presets[1].light, header: "#133453", accent: "#214e87" };
    for (const { key, label } of colorFields)
      await expect(
        dialog.getByRole("textbox", { name: `${label} hex`, exact: true }),
      ).toHaveValue(expected[key]);
  }
  await cancel(page);
  await expect
    .poll(() => rootColor(page, "canvas"))
    .toBe(presets[2].dark.canvas);
}
