import type { Product, Slot } from "./types";
import { PRODUCTS, allDeals } from "./expand";

/** 按鈕分成三區，用商品的 category 對應。 */
export type Group = "main" | "side" | "drink";

export const GROUPS: Group[] = ["main", "side", "drink"];

export const GROUP_LABEL: Record<Group, string> = {
  main: "主餐",
  side: "副餐",
  drink: "飲料",
};

const GROUP_OF: Record<string, Group> = {
  burger: "main", chicken: "main", salad: "main", breakfast_set: "main",
  side: "side", dessert: "side",
  drink_soda: "drink", drink_tea: "drink", drink_coffee: "drink",
  drink_milk: "drink", drink_other: "drink",
};

export const groupOf = (p: Product): Group => GROUP_OF[p.category] ?? "side";

/**
 * 該時段真正點得到的商品。
 *
 * 只收「至少有一張該時段的券涵蓋得到」的商品 —— 隨機抽到永遠湊不齊的
 * 品項（例如午晚餐時段抽到只有早餐供應的薯餅）只會讓使用者一頭霧水。
 */
export function availableProducts(slot: Slot): Product[] {
  const ids = new Set<string>();
  for (const d of allDeals()) {
    if (d.min_spend !== null) continue;
    if (d.availability !== "ALL_DAY" && d.availability !== slot) continue;
    for (const i of d.product_ids) ids.add(i);
  }
  return [...ids].map((i) => PRODUCTS.get(i)!).filter(Boolean);
}

/** Fisher-Yates，用傳進來的亂數來源。 */
function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 隨機抽 n 個不重複的品項，三區都要有。
 * 先各區抽到保底數量，剩下的名額再從全部裡面補。
 */
export function randomPick(slot: Slot, n = 15): Product[] {
  const pool = availableProducts(slot);
  const byGroup: Record<Group, Product[]> = { main: [], side: [], drink: [] };
  for (const p of pool) byGroup[groupOf(p)].push(p);

  const rnd = () => Math.random();
  const quota: Record<Group, number> = { main: 6, side: 4, drink: 5 };
  const picked: Product[] = [];
  for (const g of GROUPS) {
    picked.push(...shuffle(byGroup[g], rnd).slice(0, Math.min(quota[g], byGroup[g].length)));
  }
  if (picked.length < n) {
    const taken = new Set(picked.map((p) => p.id));
    picked.push(...shuffle(pool, rnd).filter((p) => !taken.has(p.id)).slice(0, n - picked.length));
  }
  return picked.slice(0, n);
}
