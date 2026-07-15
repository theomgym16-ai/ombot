import "dotenv/config";
import { supabase } from "../utils/supabase.js";

const plans = [
  {
    name: "1 Month – Without Cardio",
    duration_days: 30,
    price: 800,
    billing_cycle: "monthly",
    features: { cardio: false },
  },
  {
    name: "3 Months – Without Cardio",
    duration_days: 90,
    price: 2100,
    billing_cycle: "quarterly",
    features: { cardio: false },
  },
  {
    name: "1 Month – With Cardio",
    duration_days: 30,
    price: 1000,
    billing_cycle: "monthly",
    features: { cardio: true },
  },
  {
    name: "3 Months – With Cardio",
    duration_days: 90,
    price: 2500,
    billing_cycle: "quarterly",
    features: { cardio: true },
  },
];

async function main() {
  const { data: existing, error: fetchError } = await supabase
    .from("plans")
    .select("name");

  if (fetchError) {
    console.error("Failed to read plans:", fetchError.message);
    process.exit(1);
  }

  const existingNames = new Set(existing.map((p) => p.name));
  const toInsert = plans.filter((p) => !existingNames.has(p.name));

  if (toInsert.length === 0) {
    console.log("All plans already exist, nothing to do.");
    return;
  }

  const { error } = await supabase.from("plans").insert(toInsert);

  if (error) {
    console.error("Failed to seed plans:", error.message);
    process.exit(1);
  }

  console.log(`Seeded ${toInsert.length} plan(s): ${toInsert.map((p) => p.name).join(", ")}`);
}

main();
