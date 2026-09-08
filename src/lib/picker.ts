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

/** 同一區裡照類別、再照價格排，讓相似的東西排在一起。 */
export function sortForDisplay(items: Product[]): Product[] {
  return [...items].sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      (a.price ?? 0) - (b.price ?? 0) ||
      a.name.localeCompare(b.name, "zh-Hant"),
  );
}
