import type {
  Availability,
  Deal,
  DealItem,
  Meal,
  Product,
  Role,
  ZoneItem,
  CouponOffer,
} from "./types";

import productsRaw from "../data/products.json";
import onePlusOneRaw from "../data/1plus1.json";
import sweetheartRaw from "../data/sweetheart.json";
import mealsRaw from "../data/meals.json";
import baseCouponRaw from "../data/base_coupon.json";

const products = productsRaw as Product[];
const meals = mealsRaw as unknown as Meal[];
const baseCoupon = baseCouponRaw as unknown as {
  id: string;
  name: string;
  offers: CouponOffer[];
};

export const PRODUCTS: Map<string, Product> = new Map(
  products.map((p) => [p.id, p]),
);

/** 原始寫法 → 商品。這就是商品主檔存在的理由：各活動的寫法不一致。 */
const BY_NAME = new Map<string, Product>();
for (const p of products) {
  for (const n of new Set([...p.source_names, p.name])) BY_NAME.set(n, p);
}

function lookup(item: ZoneItem): Product {
  const p = BY_NAME.get(item.name) ?? BY_NAME.get(item.name_normalized);
  if (!p) throw new Error(`找不到商品：${item.id} ${item.name}`);
  return p;
}

const SIZE_TAG: Record<string, string> = {
  小: "size_s",
  中: "size_m",
  大: "size_l",
};

function tagsOf(p: Product): string[] {
  const t = [p.category];
  if (p.temperature) t.push(p.temperature);
  if (p.size && SIZE_TAG[p.size]) t.push(SIZE_TAG[p.size]);
  return t;
}

/**
 * 兩個品項的供應時段取交集。沒有交集回 null，代表這組買不到
 * （例如甜心卡的「大薯」限午晚餐、「薯餅」限早餐）。
 */
export function intersectAvailability(
  x: Availability,
  y: Availability,
): Availability | null {
  if (x === y) return x;
  if (x === "ALL_DAY") return y;
  if (y === "ALL_DAY") return x;
  return null;
}

type Entry = [Product, number, Role];

function makeDeal(
  sourceId: string,
  sourceName: string,
  key: string,
  label: string,
  entries: Entry[],
  price: number,
  availability: Availability,
  offerType: Deal["offer_type"],
  channel: string | null = null,
  minSpend: number | null = null,
): Deal | null {
  if (entries.some(([p]) => p.price === null)) return null;
  const original = entries.reduce((a, [p, q]) => a + p.price! * q, 0);
  const items: DealItem[] = entries.map(([p, qty, zone]) => ({
    product_id: p.id,
    name: p.name,
    qty,
    zone,
  }));
  return {
    _id: `${sourceId}__${key}`,
    source_id: sourceId,
    source: sourceName,
    label,
    items,
    product_ids: [...new Set(entries.map(([p]) => p.id))].sort(),
    tags: [...new Set(entries.flatMap(([p]) => tagsOf(p)))].sort(),
    price,
    original_price: original,
    savings: original - price,
    item_count: entries.reduce((a, [, q]) => a + q, 0),
    offer_type: offerType,
    availability,
    channel,
    min_spend: minSpend,
  };
}

/** 1+1 星級點、數位甜心卡：A 區 x B 區展開。price 取 A 區的 combo_price。 */
function expandZoneAB(
  sourceId: string,
  sourceName: string,
  rows: ZoneItem[],
): Deal[] {
  const zoneA = rows.filter((r) => r.zone === "A");
  const zoneB = rows.filter((r) => r.zone === "B");
  const out: Deal[] = [];
  for (const a of zoneA) {
    for (const b of zoneB) {
      const avail = intersectAvailability(a.availability, b.availability);
      if (!avail) continue; // 時段湊不起來，這組根本點不到
      const pa = lookup(a),
        pb = lookup(b);
      const d = makeDeal(
        sourceId,
        sourceName,
        `${a.id}__${b.id}`,
        `${sourceName}：${pa.name} + ${pb.name}`,
        [
          [pa, 1, "A"],
          [pb, 1, "B"],
        ],
        a.combo_price!,
        avail,
        "ZONE_AB",
      );
      if (d) out.push(d);
    }
  }
  return out;
}

/** 鋪底優惠券的三種券型。買套餐送贈品要把套餐展開成 主餐 x 配餐 x 飲料。 */
function expandCoupons(): Deal[] {
  const { id: sourceId, name: sourceName, offers } = baseCoupon;
  const mealById = new Map(meals.map((m) => [m.id, m]));
  const out: Deal[] = [];

  for (const o of offers) {
    if (o.type === "BOGO") {
      for (const pid of o.products!) {
        const p = PRODUCTS.get(pid)!;
        const d = makeDeal(
          sourceId,
          sourceName,
          `${o.id}__${pid}`,
          `${sourceName}：${p.name} 買一送一`,
          [[p, 2, "BOGO"]],
          o.unit_price!,
          o.availability,
          "BOGO",
          o.channel,
        );
        if (d) out.push(d);
      }
    } else if (o.type === "MIN_SPEND") {
      const g = PRODUCTS.get(o.gift!)!;
      const d = makeDeal(
        sourceId,
        sourceName,
        o.id,
        `${sourceName}：${o.title}`,
        [[g, 1, "GIFT"]],
        o.min_spend!,
        o.availability,
        "MIN_SPEND",
        o.channel,
        o.min_spend!,
      );
      if (d) out.push(d);
    } else {
      const meal = mealById.get(o.meal_id!)!;
      const gift = PRODUCTS.get(o.gift!)!;
      const upcharge = new Map(
        meal.drinks.map((d) => [d.product_id, d.upcharge]),
      );
      for (const m of meal.mains) {
        if (m.price === null) continue;
        const main = PRODUCTS.get(m.product_id)!;
        for (const c of meal.combos) {
          const picks: [string, number][] =
            c.drinks === "list"
              ? meal.drinks.map((d) => [d.product_id, d.upcharge])
              : c.drinks.map((i) => [i, upcharge.get(i) ?? 0]);
          for (const [drinkId, up] of picks) {
            const drink = PRODUCTS.get(drinkId)!;
            const entries: Entry[] = [
              [main, 1, "MAIN"],
              ...c.includes.map((i) => [PRODUCTS.get(i)!, 1, "SIDE"] as Entry),
              [drink, 1, "DRINK"],
              [gift, 1, "GIFT"],
            ];
            const d = makeDeal(
              sourceId,
              sourceName,
              `${o.id}__${m.product_id}__${c.code}__${drinkId}`,
              `${sourceName}：${meal.name} ${c.code}${c.name} + ${main.name}（送 ${gift.name}）`,
              entries,
              m.price + c.upcharge + up,
              o.availability,
              "MEAL_GIFT",
              o.channel,
            );
            if (d) out.push(d);
          }
        }
      }
    }
  }
  return out;
}

let cache: Deal[] | null = null;

/** 把 92 KB 的來源資料展開成全部方案。結果快取，只算一次。 */
export function allDeals(): Deal[] {
  if (cache) return cache;
  cache = [
    ...expandZoneAB("star_1plus1", "1+1星級點", onePlusOneRaw as ZoneItem[]),
    ...expandZoneAB("sweetheart", "數位甜心卡", sweetheartRaw as ZoneItem[]),
    ...expandCoupons(),
  ];
  return cache;
}
