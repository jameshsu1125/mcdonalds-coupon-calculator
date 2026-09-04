/** 端到端煙霧測試：兩個時段 x 各種品項數，檢查有結果、有效能、金額正確。 */
import { buildPool, recommend } from "../src/lib/recommend";
import { randomPick, availableProducts } from "../src/lib/picker";
import type { Slot } from "../src/lib/types";

for (const slot of ["BREAKFAST", "LUNCH_DINNER"] as Slot[]) {
  const t0 = performance.now();
  const pool = buildPool(slot);
  const avail = availableProducts(slot);
  console.log(`\n=== ${slot} ===`);
  console.log(`  可用方案 ${pool.deals.length.toLocaleString()} 筆、可選商品 ${avail.length} 個、建池 ${(performance.now() - t0).toFixed(0)}ms`);

  for (const n of [1, 3, 6, 7, 10, 15]) {
    const picked = randomPick(slot, 15).slice(0, n).map((p) => p.id);
    const t = performance.now();
    const r = recommend(pool, picked);
    const ms = performance.now() - t;
    const c = r.cheapest, b = r.biggest;
    if (!c) { console.log(`  ${String(n).padStart(2)} 項  無結果`); continue; }

    // 驗算：每張券的 savings 必須等於 原價-實付，總額必須等於各券加總
    const bad = c.coupons.filter((d) => d.savings !== d.original_price - d.price);
    const sumOk = c.total_price === c.coupons.reduce((a, d) => a + d.price, 0);
    const mg = c.coupons.filter((d) => d.offer_type === "MEAL_GIFT").length;

    console.log(
      `  ${String(n).padStart(2)} 項  ${r.usedGreedy ? "貪婪" : "窮舉"}  ${ms.toFixed(0).padStart(4)}ms  ` +
      `最便宜 ${c.coupon_count}張 $${c.total_price} 省$${c.total_savings} | ` +
      `最澎湃 ${b!.coupon_count}張 $${b!.total_price} 省$${b!.total_savings}  ` +
      `MEAL_GIFT=${mg}${mg > 3 ? " ✗超過3張" : ""}${bad.length ? " ✗金額不符" : ""}${sumOk ? "" : " ✗合計不符"}` +
      `${r.uncovered.length ? ` 無法涵蓋:${r.uncovered.length}` : ""}`,
    );
  }
}
