import { environment } from "./environment.mjs";
// Explicit developer fixture download; never part of Vitera startup or inference.
// Nutrition5k, Thames et al., CVPR 2021, CC BY 4.0.
// https://github.com/google-research-datasets/Nutrition5k
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const directory = resolve(
  environment("PHOTO_BENCHMARK") ?? "artifacts/photo-benchmark",
);
mkdirSync(directory, { recursive: true });
const base =
  "https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/";
const metadata = await fetch(`${base}metadata/dish_metadata_cafe1.csv`);
if (!metadata.ok)
  throw new Error(`Metadata download failed: ${metadata.status}`);
const rows = (await metadata.text())
  .trim()
  .split(/\r?\n/)
  .map((row) => row.split(","));
// Fixed references chosen before evaluation: vegetables, olives and cooked rice.
const ids = ["dish_1560455030", "dish_1556572657", "dish_1558459276"];
const references = [];
for (const id of ids) {
  const row = rows.find((row) => row[0] === id);
  if (!row || (row.length - 6) % 7) throw new Error(`Invalid reference: ${id}`);
  const ingredients = [];
  for (let i = 6; i < row.length; i += 7)
    ingredients.push({
      name: row[i + 1],
      grams: Number(row[i + 2]),
      kcal: Number(row[i + 3]),
    });
  const url = `${base}imagery/realsense_overhead/${id}/rgb.png`;
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Photo download failed: ${response.status}`);
  const file = `${id}.png`;
  writeFileSync(
    join(directory, file),
    Buffer.from(await response.arrayBuffer()),
  );
  references.push({
    id,
    url,
    file,
    kcal: Number(row[1]),
    mass: Number(row[2]),
    ingredients,
  });
}
writeFileSync(
  join(directory, "references.json"),
  JSON.stringify(references, null, 2),
);
console.log(
  `Downloaded ${references.length} attributed real meal fixtures to ${directory}`,
);
