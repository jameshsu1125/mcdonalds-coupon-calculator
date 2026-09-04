/**
 * 拿 TS 版的展開結果跟 Python 版（mongo/deals-*.json）逐筆比對。
 * 兩邊必須一模一樣，否則網站算出來的優惠會跟資料庫對不上。
 */
import { readFileSync } from "node:fs";
import { allDeals } from "../src/lib/expand";
import type { Deal } from "../src/lib/types";

const ROOT = new URL("../../mongo/", import.meta.url);
const py: Deal[] = ["deals-1plus1", "deals-sweetheart", "deals-base-coupon"]
  .flatMap((f) => JSON.parse(readFileSync(new URL(`${f}.json`, ROOT), "utf8")));

const ts = allDeals();
const FIELDS = [
  "source_id", "source", "label", "product_ids", "tags", "price",
  "original_price", "savings", "item_count", "offer_type", "availability",
  "channel", "min_spend",
] as const;

const norm = (d: Deal) => JSON.stringify({
  ...Object.fromEntries(FIELDS.map((k) => [k, d[k]])),
  items: d.items.map((i) => [i.product_id, i.qty, i.zone]),
});

const pyMap = new Map(py.map((d) => [d._id, d]));
const tsMap = new Map(ts.map((d) => [d._id, d]));

const onlyPy = [...pyMap.keys()].filter((k) => !tsMap.has(k));
const onlyTs = [...tsMap.keys()].filter((k) => !pyMap.has(k));
const diff = [...tsMap.entries()]
  .filter(([k, d]) => pyMap.has(k) && norm(d) !== norm(pyMap.get(k)!))
  .slice(0, 5);

console.log(`Python ${py.length.toLocaleString()} 筆 / TypeScript ${ts.length.toLocaleString()} 筆`);
console.log(`  只在 Python 有：${onlyPy.length}`);
console.log(`  只在 TS 有：    ${onlyTs.length}`);
console.log(`  內容不同：      ${diff.length ? `${diff.length}+ 筆` : 0}`);
for (const [k, d] of diff) {
  console.log(`\n  ✗ ${k}\n    py: ${norm(pyMap.get(k)!)}\n    ts: ${norm(d)}`);
}
for (const k of [...onlyPy, ...onlyTs].slice(0, 5)) console.log(`  ✗ 單邊存在：${k}`);

const ok = !onlyPy.length && !onlyTs.length && !diff.length;
console.log(ok ? "\n✓ 兩邊完全一致" : "\n✗ 有差異");
process.exit(ok ? 0 : 1);
