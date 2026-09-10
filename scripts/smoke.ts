/** 端到端煙霧測試：兩個時段 x 各種份數（含重複品項），檢查有結果、有效能、金額正確。 */
import { buildPool, recommend } from "../src/lib/recommend";
import { availableProducts } from "../src/lib/picker";
import type { Slot } from "../src/lib/types";
import { PRODUCTS } from "../src/lib/expand";

function pickUnits(ids: string[], n: number, dupRate = 0.3): string[] {
  const out: string[] = [];
  while (out.length < n) {
    const id = ids[Math.floor(Math.random() * ids.length)];
    const times = Math.random() < dupRate ? 2 : 1;
    for (let k = 0; k < times && out.length < n; k++) out.push(id);
  }
  return out;
}

for (const slot of ["BREAKFAST", "LUNCH_DINNER"] as Slot[]) {
  const t0 = performance.now();
  const pool = buildPool(slot);
  const ids = availableProducts(slot).map((p) => p.id);
  console.log(`\n=== ${slot} ===`);
  console.log(`  可用方案 ${pool.deals.length.toLocaleString()} 筆、可選商品 ${ids.length} 個、建池 ${(performance.now() - t0).toFixed(0)}ms`);

  for (const n of [1, 2, 3, 6, 7, 10, 15, 25]) {
    const units = pickUnits(ids, n);
    const t = performance.now();
    const r = recommend(pool, units);
    const ms = performance.now() - t;
    const c = r.cheapest, b = r.biggest;
    if (!c) { console.log(`  ${String(n).padStart(2)} 份  無結果`); continue; }

    // 驗算：每張券的 savings 必須等於 原價-實付，合計必須等於各券加總
    const bad = c.coupons.filter((d) => d.savings !== d.original_price - d.price);
    const sumOk = c.total_price === c.coupons.reduce((a, d) => a + d.price, 0);
    const mg = c.coupons.filter((d) => d.offer_type === "MEAL_GIFT").length;

    // 驗算：券涵蓋的份數 + 沒排進去的份數，要等於使用者要的份數
    const got = new Map<string, number>();
    for (const d of c.coupons)
      for (const it of d.items)
        got.set(it.product_id, (got.get(it.product_id) ?? 0) + it.qty);
    const want = new Map<string, number>();
    for (const i of units) want.set(i, (want.get(i) ?? 0) + 1);
    for (const i of r.dropped) want.set(i, want.get(i)! - 1);
    const short = [...want].filter(([i, q]) => (got.get(i) ?? 0) < q);

    console.log(
      `  ${String(n).padStart(2)} 份  ${r.usedGreedy ? "貪婪" : "窮舉"}  ${ms.toFixed(0).padStart(4)}ms  ` +
      `最便宜 ${c.coupon_count}張 $${c.total_price} 省$${c.total_savings} | ` +
      `最澎湃 ${b!.coupon_count}張 $${b!.total_price} 省$${b!.total_savings}  ` +
      `MEAL_GIFT=${mg}${mg > 3 ? " ✗超過3張" : ""}${bad.length ? " ✗金額不符" : ""}${sumOk ? "" : " ✗合計不符"}` +
      `${short.length ? ` ✗份數不足:${short.map(([i, q]) => `${PRODUCTS.get(i)?.name}需${q}得${got.get(i) ?? 0}`).join()}` : ""}` +
      `${r.dropped.length ? ` 擠不進:${r.dropped.length}份` : ""}`,
    );
  }
}
