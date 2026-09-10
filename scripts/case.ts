import { buildPool, recommend } from "../src/lib/recommend";
import { PRODUCTS } from "../src/lib/expand";

const pool = buildPool("LUNCH_DINNER");
const units = (globalThis as any).CASE ?? [
  ...Array(3).fill("burger_mcchicken"),
  ...Array(5).fill("fries_m"),
];
const r = recommend(pool, units);
const c = r.cheapest!;
const label = [...new Set(units)]
  .map(
    (i) =>
      `${PRODUCTS.get(i as string)!.name} x${units.filter((u: string) => u === i).length}`,
  )
  .join("、");
console.log(`要：${label}   共 ${units.length} 份`);
console.log(
  `結果：${c.coupon_count} 張券、實付 $${c.total_price}、省 $${c.total_savings}`,
);
console.log(
  `      MEAL_GIFT ${c.coupons.filter((d) => d.offer_type === "MEAL_GIFT").length} 張、其他 ${c.coupons.filter((d) => d.offer_type !== "MEAL_GIFT").length} 張\n`,
);

const got = new Map<string, number>();
for (const [n, d] of c.coupons.entries()) {
  console.log(
    `券 ${n + 1}  [${d.offer_type.padEnd(9)}] $${String(d.price).padStart(3)}  ${d.label}`,
  );
  for (const it of d.items)
    got.set(it.product_id, (got.get(it.product_id) ?? 0) + it.qty);
}
console.log("\n份數對帳：");
for (const id of [...new Set(units)] as string[]) {
  const want = units.filter((u: string) => u === id).length;
  const drop = r.dropped.filter((u) => u === id).length;
  const g = got.get(id) ?? 0;
  console.log(
    `  ${PRODUCTS.get(id)!.name.padEnd(8)} 要 ${want} 份、券提供 ${g} 份、沒排進去 ${drop} 份  ${g + drop >= want ? "✓" : "✗ 不足"}`,
  );
}
if (r.dropped.length)
  console.log(
    `\n沒排進去：${r.dropped.map((i) => PRODUCTS.get(i)!.name).join("、")}`,
  );
