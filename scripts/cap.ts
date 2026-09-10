/** 比較「只限 MEAL_GIFT 3 張」與「總券數也限 3 張」的差別。 */
import { buildPool, recommend, MAX_MEAL_GIFT } from "../src/lib/recommend";
import { availableProducts } from "../src/lib/picker";
import type { Slot, Deal } from "../src/lib/types";

const pool = buildPool("LUNCH_DINNER" as Slot);
const ids = availableProducts("LUNCH_DINNER").map((p) => p.id);

/** 模擬「總券數上限 N」：貪婪挑 N 張之後就停，剩下的算沒排進去。 */
function capped(
  pool: ReturnType<typeof buildPool>,
  units: string[],
  cap: number,
) {
  const need = new Map<string, number>();
  for (const i of units) need.set(i, (need.get(i) ?? 0) + 1);
  const picked: Deal[] = [];
  while (need.size && picked.length < cap) {
    const mg = picked.filter((d) => d.offer_type === "MEAL_GIFT").length;
    let best: Deal | null = null,
      bestCov = 0,
      bestN = -1;
    pool.deals.forEach((d, n) => {
      if (d.offer_type === "MEAL_GIFT" && mg >= MAX_MEAL_GIFT) return;
      let cov = 0;
      for (const [i, w] of need) cov += Math.min(w, pool.qty[n].get(i) ?? 0);
      if (cov > bestCov || (cov === bestCov && best && d.price < best.price)) {
        best = d;
        bestCov = cov;
        bestN = n;
      }
    });
    if (!best || !bestCov) break;
    picked.push(best);
    for (const [i, w] of [...need]) {
      const got = Math.min(w, pool.qty[bestN].get(i) ?? 0);
      if (got >= w) need.delete(i);
      else if (got) need.set(i, w - got);
    }
  }
  let left = 0;
  for (const [, n] of need) left += n;
  return { picked, left };
}

console.log("份數  ── 現在（只限MEAL_GIFT 3張）──   ── 若總券數也限3張 ──");
console.log(
  "       券數  實付   省    沒排進去      券數  實付   省    沒排進去",
);
for (const n of [3, 5, 8, 12, 20]) {
  const units = Array.from(
    { length: n },
    () => ids[Math.floor(Math.random() * ids.length)],
  );
  const now = recommend(pool, units);
  const cap = capped(pool, units, 3);
  const c = now.cheapest!;
  const capPrice = cap.picked.reduce((a, d) => a + d.price, 0);
  const capSave = cap.picked.reduce((a, d) => a + d.savings, 0);
  console.log(
    `${String(n).padStart(3)}     ${String(c.coupon_count).padStart(2)}   $${String(c.total_price).padStart(4)}  $${String(c.total_savings).padStart(3)}   ${String(now.dropped.length).padStart(2)} 份` +
      `        ${String(cap.picked.length).padStart(2)}   $${String(capPrice).padStart(4)}  $${String(capSave).padStart(3)}   ${String(cap.left).padStart(2)} 份`,
  );
}
