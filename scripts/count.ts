import { buildPool, recommend } from "../src/lib/recommend";
import { availableProducts } from "../src/lib/picker";
import type { Slot } from "../src/lib/types";

for (const slot of ["BREAKFAST", "LUNCH_DINNER"] as Slot[]) {
  const pool = buildPool(slot);
  const ids = availableProducts(slot).map((p) => p.id);
  console.log(`\n=== ${slot} ===`);
  console.log("份數   總券數   其中MEAL_GIFT   其他券型");
  for (const n of [3, 5, 8, 12, 20]) {
    const units = Array.from({ length: n }, () => ids[Math.floor(Math.random() * ids.length)]);
    const r = recommend(pool, units);
    const c = r.cheapest;
    if (!c) { console.log(`${String(n).padStart(3)}     無結果`); continue; }
    const mg = c.coupons.filter((d) => d.offer_type === "MEAL_GIFT").length;
    console.log(
      `${String(n).padStart(3)}      ${String(c.coupon_count).padStart(2)}         ` +
      `${mg}              ${c.coupon_count - mg}` +
      (c.coupon_count > 3 ? "   ← 總數超過 3 張" : ""),
    );
  }
}
