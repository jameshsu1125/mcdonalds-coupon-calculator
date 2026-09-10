import { buildPool, recommend } from "../src/lib/recommend";
import { PRODUCTS } from "../src/lib/expand";

const pool = buildPool("LUNCH_DINNER");
const cases: [string, string[]][] = [
  ["麥香雞x3 + 中薯x5", [...Array(3).fill("burger_mcchicken"), ...Array(5).fill("fries_m")]],
  ["麥香雞x5 + 中薯x5", [...Array(5).fill("burger_mcchicken"), ...Array(5).fill("fries_m")]],
  ["5 種不同主餐各1份", ["bigmac", "burger_mcchicken", "quarter_pounder", "spicy_chicken_burger", "blt_angus"]],
  ["可樂x4 + 大薯x2", [...Array(4).fill("coke_m"), ...Array(2).fill("fries_l")]],
];
for (const [name, units] of cases) {
  const r = recommend(pool, units);
  const c = r.cheapest!;
  const mg = c.coupons.filter((d) => d.offer_type === "MEAL_GIFT").length;
  const types = c.coupons.map((d) => d.offer_type);
  console.log(
    `${name.padEnd(22)} → ${c.coupon_count} 張券（MEAL_GIFT ${mg}、其他 ${c.coupon_count - mg}）` +
    ` $${c.total_price} 省$${c.total_savings}` +
    (r.dropped.length ? `  沒排進去：${r.dropped.map((i) => PRODUCTS.get(i)!.name).join("、")}` : ""),
  );
  console.log(`${" ".repeat(24)}${[...new Set(types)].join(" / ")}`);
}
