import { test } from "node:test";
import assert from "node:assert/strict";
import { localDate, shiftDate, macroLabel } from "../src/storage.ts";

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
