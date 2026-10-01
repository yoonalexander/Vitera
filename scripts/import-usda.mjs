import { readFileSync, writeFileSync } from "node:fs";

// Normalize the six public USDA API records into the immutable v1 offline catalog.
// Supply the downloaded JSON path; no key, network access or health records are needed here.
const ids = [173944, 173424, 168878, 171477, 173904, 171265];
const rows = JSON.parse(
  readFileSync(process.argv[2] ?? "artifacts/usda-source.json", "utf8"),
);
const foods = ids.map((id) => {
  const food = rows.find((f) => f.fdcId === id);
  if (!food || food.dataType !== "SR Legacy")
    throw new Error(`Missing SR Legacy record ${id}`);
  const nutrient = (id) =>
    food.foodNutrients.find((n) => n.nutrient.id === id)?.amount ?? null;
  return {
    id: `usda-v1-${food.fdcId}`,
    version: 1,
    name: food.description,
    state: food.description.includes("raw")
      ? "Raw"
      : food.description.includes("dry")
        ? "Dry"
        : food.description.includes("cooked")
          ? "Cooked"
          : "As sold",
    source: "USDA SR Legacy (April 2018), catalog v1",
    sourceId: String(food.fdcId),
    basisQuantity: 100,
    basisUnit: "g",
    density: null,
    nutrients: {
      kcal: nutrient(1008),
      protein: nutrient(1003),
      carbohydrate: nutrient(1005),
      fat: nutrient(1004),
    },
    portions: food.foodPortions
      .filter((p) => p.gramWeight > 0)
      .map((p) => ({
        label: [p.amount, p.modifier].filter(Boolean).join(" "),
        quantity: p.gramWeight,
      })),
    favorite: false,
  };
});
writeFileSync("catalog/foods-v1.json", JSON.stringify(foods, null, 2) + "\n");
console.log(`Wrote ${foods.length} SR Legacy foods to catalog/foods-v1.json`);
