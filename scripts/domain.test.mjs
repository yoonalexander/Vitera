import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewRows, rowIssue } from "../src/ai.ts";
import {
  localDate,
  shiftDate,
  macroLabel,
  displayMetric,
} from "../src/storage.ts";

test("local calendar dates cross midnight without UTC date substitution", () => {
  process.env.TZ = "America/Toronto";
  assert.equal(localDate(new Date("2026-10-02T03:59:59Z")), "2026-10-01");
  assert.equal(localDate(new Date("2026-10-02T04:00:00Z")), "2026-10-02");
  process.env.TZ = "Asia/Tokyo";
  assert.equal(localDate(new Date("2026-10-01T15:00:00Z")), "2026-10-02");
});
test("calendar navigation crosses DST, month and leap-year boundaries", () => {
  process.env.TZ = "America/Toronto";
  for (const [date, offset, result] of [
    ["2026-03-08", -1, "2026-03-07"],
    ["2026-03-08", 1, "2026-03-09"],
    ["2026-11-01", 1, "2026-11-02"],
    ["2028-03-01", -1, "2028-02-29"],
    ["2026-12-31", 1, "2027-01-01"],
  ])
    assert.equal(shiftDate(date, offset), result);
});
test("macro presentation distinguishes unknown, known zero and partial", () => {
  assert.equal(
    macroLabel({ known: 0, knownEntries: 0, totalEntries: 0 }),
    "Unknown",
  );
  assert.equal(
    macroLabel({ known: 0, knownEntries: 0, totalEntries: 2 }),
    "Unknown",
  );
  assert.equal(
    macroLabel({ known: 0, knownEntries: 2, totalEntries: 2 }),
    "0 g",
  );
  assert.equal(
    macroLabel({ known: 12.5, knownEntries: 1, totalEntries: 2 }),
    "12.5 g · partial (1/2 entries)",
  );
});

test("recipe ingredient coverage stays partial even when every entry contributes", () => {
  assert.equal(
    macroLabel({
      known: 20,
      knownEntries: 1,
      totalEntries: 1,
      partialEntries: 1,
    }),
    "20 g · partial (1/1 entries; some recipe ingredients unknown)",
  );
});
test("metric display converts canonical values without changing stored precision", () => {
  assert.ok(Math.abs(displayMetric(90.718474, "lb") - 200) < 1e-9);
  assert.ok(Math.abs(displayMetric(81.28, "in") - 32) < 1e-9);
  assert.equal(displayMetric(500, "l"), 0.5);
  assert.ok(Math.abs(displayMetric(236.5882365, "fl oz (US)") - 8) < 1e-9);
});

test("AI review blocks missing portions, unsupported units and unconfirmed edits", () => {
  const draft = {
    items: [
      {
        candidate: {
          name: "Synthetic meal",
          foodId: null,
          quantity: null,
          unit: "bucket",
          nutrients: {
            kcal: 400,
            protein: null,
            carbohydrate: null,
            fat: null,
          },
          assumptions: ["Synthetic estimate"],
          questions: [],
        },
        food: null,
      },
    ],
  };
  const [row] = reviewRows(draft);
  assert.match(rowIssue(row), /positive portion/);
  row.quantity = "1";
  assert.match(rowIssue(row), /supported unit/);
  row.unit = "serving";
  assert.match(rowIssue(row), /Confirm/);
  row.reviewed = true;
  assert.equal(rowIssue(row), null);
  assert.equal(row.nutrients.protein, null);
  const id = row.id;
  row.nutrients.kcal = -1;
  assert.match(rowIssue(row), /valid optional macros/);
  assert.equal(row.id, id);
});
