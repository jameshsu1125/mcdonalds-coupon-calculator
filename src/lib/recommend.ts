import type { Bundle, Deal, Slot } from "./types";
import { allDeals } from "./expand";

/** 一次推薦最多能用幾張「買套餐送X」券。客戶給的規則。 */
export const MAX_MEAL_GIFT = 3;

/** 超過這個品項數就改用貪婪法：窮舉的切法數是貝爾數，8 個就 4,140 種、15 個 13.8 億種。 */
const EXACT_LIMIT = 6;

export type Mode = "cheapest" | "biggest";

/**
 * 單張券的排序。兩者都用 savings 決勝：並列的方案攤開來比誰省最多。
 * 最澎湃最後再比 price，同樣澎湃、同樣省的時候優先給便宜的。
 */
const KEY: Record<Mode, (d: Deal) => number[]> = {
  cheapest: (d) => [d.price, -d.savings, -d.item_count],
  biggest: (d) => [-d.item_count, -d.savings, d.price],
};

/** 多張券的總分。券數已經先比過了，這裡只比同樣券數下的好壞。 */
const SCORE: Record<Mode, (ds: Deal[]) => number[]> = {
  cheapest: (ds) => [sum(ds, "price"), -sum(ds, "savings")],
  biggest: (ds) => [-sum(ds, "item_count"), -sum(ds, "savings"), sum(ds, "price")],
};

const sum = (ds: Deal[], k: "price" | "savings" | "item_count") =>
  ds.reduce((a, d) => a + d[k], 0);

/** 逐項比大小。不能用 JS 的 < ——它會把陣列轉字串，[10] < [9] 會是 true。 */
function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export interface Pool {
  deals: Deal[];
  /** product_id → 含有該商品的方案索引，交集用。 */
  inv: Map<string, Set<number>>;
}

/**
 * 依時段建可用方案池。
 *
 * - 排除滿額送：它的 price 放的是門檻金額，跟其他券的「實付多少」不是同一個
 *   東西，混在一起排序會得到 savings 為負的結果。
 * - 時段過濾是必要的不是選配：ALL_DAY 只有 397 筆（1.9%），套餐全部限時段。
 */
export function buildPool(slot: Slot): Pool {
  const deals = allDeals().filter(
    (d) => d.min_spend === null && (d.availability === "ALL_DAY" || d.availability === slot),
  );
  const inv = new Map<string, Set<number>>();
  deals.forEach((d, n) => {
    for (const i of d.product_ids) {
      let s = inv.get(i);
      if (!s) inv.set(i, (s = new Set()));
      s.add(n);
    }
  });
  return { deals, inv };
}

/** 這一組品項有哪些方案同時涵蓋。 */
function candidates(pool: Pool, group: string[]): number[] {
  let s = pool.inv.get(group[0]);
  if (!s) return [];
  let acc = [...s];
  for (const i of group.slice(1)) {
    const t = pool.inv.get(i);
    if (!t) return [];
    acc = acc.filter((n) => t.has(n));
  }
  return acc;
}

function bestOf(pool: Pool, idx: number[], mode: Mode, skipMealGift = false): Deal | null {
  let best: Deal | null = null, bestKey: number[] = [];
  for (const n of idx) {
    const d = pool.deals[n];
    if (skipMealGift && d.offer_type === "MEAL_GIFT") continue;
    const k = KEY[mode](d);
    if (!best || cmp(k, bestKey) < 0) { best = d; bestKey = k; }
  }
  return best;
}

/** 把品項切成幾組，每組派一張券。品項少時窮舉，多了會爆炸。 */
function* partitions(items: string[]): Generator<string[][]> {
  if (!items.length) { yield []; return; }
  const [first, ...rest] = items;
  for (const p of partitions(rest)) {
    for (let k = 0; k < p.length; k++)
      yield [...p.slice(0, k), [first, ...p[k]], ...p.slice(k + 1)];
    yield [[first], ...p];
  }
}

function exact(pool: Pool, want: string[], mode: Mode): Deal[] | null {
  let best: { cand: number[]; ds: Deal[] } | null = null;
  const memo = new Map<string, { best: Deal | null; alt: Deal | null }>();

  for (const part of partitions(want)) {
    const picks = part.map((g) => {
      const key = g.join(",");
      let m = memo.get(key);
      if (!m) {
        const idx = candidates(pool, g);
        m = { best: bestOf(pool, idx, mode), alt: bestOf(pool, idx, mode, true) };
        memo.set(key, m);
      }
      return m;
    });
    if (picks.some((m) => !m.best)) continue;
    const ds = picks.map((m) => m.best!);

    // MEAL_GIFT 超額時，換掉損失最小的那幾張
    let over = ds.filter((d) => d.offer_type === "MEAL_GIFT").length - MAX_MEAL_GIFT;
    if (over > 0) {
      const swappable = ds
        .map((_, i) => i)
        .filter((i) => ds[i].offer_type === "MEAL_GIFT" && picks[i].alt)
        .sort((i, j) => cmp(KEY[mode](picks[i].alt!), KEY[mode](picks[j].alt!)));
      if (swappable.length < over) continue;
      for (const i of swappable.slice(0, over)) ds[i] = picks[i].alt!;
    }

    const cand = [ds.length, ...SCORE[mode](ds)]; // 券數優先最少
    if (!best || cmp(cand, best.cand) < 0) best = { cand, ds };
  }
  return best?.ds ?? null;
}

/**
 * 每次挑「還沒被涵蓋的品項裡能一次蓋掉最多的」那張券，挑到不能再挑為止。
 *
 * 品項多到窮舉不動時用它求解，窮舉無解時也用它退而求其次 ——
 * 大部分主餐（大麥克、BLT 系列、松露黑堡系列…）只出現在「買套餐送X」的券裡，
 * 一次最多 3 張的規則會讓「選了 4 個以上這種主餐」變成真的湊不齊。
 * 這時給部分解比給空白有用，沒蓋到的品項另外回報。
 */
function greedy(
  pool: Pool, want: string[], mode: Mode,
): { picked: Deal[]; left: string[] } {
  const left = new Set(want);
  const picked: Deal[] = [];
  const relevant = [...new Set(want.flatMap((i) => [...(pool.inv.get(i) ?? [])]))];

  while (left.size) {
    let best: Deal | null = null, bestKey: number[] = [], bestCov: string[] = [];
    const mgUsed = picked.filter((d) => d.offer_type === "MEAL_GIFT").length;
    for (const n of relevant) {
      const d = pool.deals[n];
      if (d.offer_type === "MEAL_GIFT" && mgUsed >= MAX_MEAL_GIFT) continue;
      const cov = d.product_ids.filter((i) => left.has(i));
      if (!cov.length) continue;
      const k = [-cov.length, ...KEY[mode](d)]; // 先蓋最多，再比好壞
      if (!best || cmp(k, bestKey) < 0) { best = d; bestKey = k; bestCov = cov; }
    }
    if (!best) break; // 受 3 張上限所限，剩下的湊不進來了
    picked.push(best);
    for (const i of bestCov) left.delete(i);
  }
  return { picked, left: [...left] };
}

const wrap = (ds: Deal[]): Bundle => ({
  coupons: ds,
  coupon_count: ds.length,
  total_price: sum(ds, "price"),
  total_savings: sum(ds, "savings"),
  total_items: sum(ds, "item_count"),
});

export interface Result {
  /** 兩個推薦指到同一組券時為 true，前端只畫一張卡。 */
  same_pick: boolean;
  cheapest: Bundle | null;
  biggest: Bundle | null;
  /** 這個時段完全沒有任何券涵蓋得到的品項。 */
  uncovered: string[];
  /** 有券可用，但受「最多 3 張買套餐送X券」所限而擠不進來的品項。 */
  dropped: string[];
  usedGreedy: boolean;
}

function solveOne(
  pool: Pool, want: string[], mode: Mode, useGreedy: boolean,
): { ds: Deal[] | null; left: string[] } {
  if (!useGreedy) {
    const e = exact(pool, want, mode);
    if (e) return { ds: e, left: [] };
  }
  const g = greedy(pool, want, mode); // 窮舉無解就退到部分解
  return { ds: g.picked.length ? g.picked : null, left: g.left };
}

export function recommend(pool: Pool, want: string[]): Result {
  const uncovered = want.filter((i) => !pool.inv.get(i)?.size);
  const solvable = want.filter((i) => !uncovered.includes(i));
  const usedGreedy = solvable.length > EXACT_LIMIT;

  const c = solvable.length
    ? solveOne(pool, solvable, "cheapest", usedGreedy)
    : { ds: null, left: [] };
  const b = solvable.length
    ? solveOne(pool, solvable, "biggest", usedGreedy)
    : { ds: null, left: [] };
  const key = (ds: Deal[] | null) =>
    ds ? ds.map((d) => d._id).sort().join("|") : "";

  return {
    same_pick: !!c.ds && key(c.ds) === key(b.ds),
    cheapest: c.ds ? wrap(c.ds) : null,
    biggest: b.ds ? wrap(b.ds) : null,
    uncovered,
    dropped: c.left,
    usedGreedy,
  };
}
