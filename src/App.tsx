import { useMemo, useState } from "react";
import type { Slot } from "./lib/types";
import {
  GROUPS, GROUP_LABEL, availableProducts, groupOf, sortForDisplay,
} from "./lib/picker";
import { buildPool, recommend } from "./lib/recommend";
import { PRODUCTS } from "./lib/expand";
import ResultCard from "./components/ResultCard";

const SLOT_LABEL: Record<Slot, string> = {
  BREAKFAST: "早餐",
  LUNCH_DINNER: "平日時段",
};

/** 選了幾份，以 product_id 為 key。沒有的 key 就是 0 份。 */
type Cart = Record<string, number>;

export default function App() {
  const [slot, setSlot] = useState<Slot | null>(null);
  const [cart, setCart] = useState<Cart>({});
  const [submitted, setSubmitted] = useState<string[] | null>(null);

  const pool = useMemo(() => (slot ? buildPool(slot) : null), [slot]);
  const products = useMemo(
    () => (slot ? sortForDisplay(availableProducts(slot)) : []),
    [slot],
  );
  const result = useMemo(
    () => (pool && submitted?.length ? recommend(pool, submitted) : null),
    [pool, submitted],
  );

  const entries = Object.entries(cart).filter(([, n]) => n > 0);
  const totalUnits = entries.reduce((a, [, n]) => a + n, 0);

  /** 一份一份展開，同一個品項要兩份就出現兩次 —— 推薦邏輯吃的是「份」。 */
  const toUnits = () =>
    entries.flatMap(([id, n]) => Array.from({ length: n }, () => id));

  const nameOf = (id: string) => PRODUCTS.get(id)?.name ?? id;

  /** 換時段等於重來：上一個時段選的東西在這個時段不一定買得到。 */
  function chooseSlot(s: Slot) {
    setSlot(s);
    setCart({});
    setSubmitted(null);
  }

  const bump = (id: string, delta: number) => {
    setSubmitted(null);
    setCart((c) => {
      const n = (c[id] ?? 0) + delta;
      const next = { ...c };
      if (n <= 0) delete next[id];
      else next[id] = n;
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-base-100">
      <header className="border-b border-base-300 bg-base-200">
        <div className="mx-auto max-w-6xl px-5 py-5">
          <h1 className="text-2xl font-bold">麥當勞優惠推薦</h1>
          <p className="text-sm opacity-60">
            選出想吃的東西，系統從 21,190 種可點方案裡找出最便宜與最澎湃的組合
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-8">
        {/* ① 時段 */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-wide opacity-60">
            ① 選擇時段
          </h2>
          <div className="join">
            {(["BREAKFAST", "LUNCH_DINNER"] as Slot[]).map((s) => (
              <button
                key={s}
                className={`btn join-item ${slot === s ? "btn-primary" : "btn-outline"}`}
                onClick={() => chooseSlot(s)}
              >
                {SLOT_LABEL[s]}
              </button>
            ))}
          </div>
        </section>

        {/* ② 品項 */}
        {slot && (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold tracking-wide opacity-60">
              ② 想吃什麼？點一下加一份，可以重複點；右鍵或按 − 減一份
            </h2>

            {GROUPS.map((g) => {
              const items = products.filter((p) => groupOf(p) === g);
              if (!items.length) return null;
              return (
                <div key={g} className="flex flex-col gap-2">
                  <div className="text-xs font-medium opacity-50">
                    {GROUP_LABEL[g]}（{items.length}）
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((p) => {
                      const n = cart[p.id] ?? 0;
                      return (
                        <button
                          key={p.id}
                          className={`btn btn-sm ${n ? "btn-primary" : "btn-outline"}`}
                          onClick={() => bump(p.id, 1)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            bump(p.id, -1);
                          }}
                        >
                          {p.name}
                          <span className="font-mono text-xs opacity-60">
                            ${p.price}
                          </span>
                          {n > 0 && (
                            <span className="badge badge-sm badge-neutral">{n}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ③ 已選 + 送出 */}
        {slot && (
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold tracking-wide opacity-60">
                ③ 已選 {entries.length} 種、共 {totalUnits} 份
              </h2>
              {totalUnits > 0 && (
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => { setCart({}); setSubmitted(null); }}
                >
                  全部清空
                </button>
              )}
            </div>

            {entries.length === 0 ? (
              <p className="text-sm opacity-50">還沒選任何東西。</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {entries.map(([id, n]) => (
                  <div key={id} className="join">
                    <button
                      className="btn btn-xs btn-outline join-item"
                      onClick={() => bump(id, -1)}
                    >
                      −
                    </button>
                    <span className="btn btn-xs join-item pointer-events-none no-animation">
                      {nameOf(id)}
                      <span className="badge badge-xs badge-primary">{n}</span>
                    </span>
                    <button
                      className="btn btn-xs btn-outline join-item"
                      onClick={() => bump(id, 1)}
                    >
                      ＋
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <button
                className="btn btn-primary"
                disabled={!totalUnits}
                onClick={() => setSubmitted(toUnits())}
              >
                產生優惠組合
              </button>
            </div>
          </section>
        )}

        {/* ④ 結果 */}
        {result && (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold tracking-wide opacity-60">
              ④ 推薦結果
            </h2>

            {result.uncovered.length > 0 && (
              <div className="alert alert-warning">
                <span>
                  這些品項在{SLOT_LABEL[slot!]}沒有任何優惠券涵蓋，已略過：
                  {result.uncovered.map(nameOf).join("、")}
                </span>
              </div>
            )}

            {result.dropped.length > 0 && (
              <div className="alert alert-info">
                <span>
                  一次最多只能用 3 張「買套餐送贈品」的券，所以這些沒排進去，
                  需要另外原價單點：
                  <b>
                    {[...new Set(result.dropped)]
                      .map((i) => {
                        const n = result.dropped.filter((x) => x === i).length;
                        return n > 1 ? `${nameOf(i)} x${n}` : nameOf(i);
                      })
                      .join("、")}
                  </b>
                </span>
              </div>
            )}

            {!result.cheapest ? (
              <div className="alert alert-error">找不到任何可用的優惠組合。</div>
            ) : result.same_pick ? (
              <>
                <div className="alert">
                  最便宜和最澎湃是同一個組合，這就是目前最好的選擇。
                </div>
                <ResultCard
                  title="最佳選擇"
                  subtitle="這組品項只有一個最好的答案"
                  bundle={result.cheapest}
                  accent="primary"
                />
              </>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <ResultCard
                  title="最便宜"
                  subtitle="實付金額最少"
                  bundle={result.cheapest}
                  accent="primary"
                />
                {result.biggest && (
                  <ResultCard
                    title="最澎湃"
                    subtitle="拿到的品項最多"
                    bundle={result.biggest}
                    accent="secondary"
                  />
                )}
              </div>
            )}

            {result.usedGreedy && (
              <p className="text-xs opacity-50">
                選了 7 份以上，改用貪婪演算法求解（窮舉法在 15 份時有 13.8 億種切法）。
                結果可能比最佳解多付幾塊錢。
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
