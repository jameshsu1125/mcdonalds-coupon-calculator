import { useMemo, useState } from "react";
import type { Product, Slot } from "./lib/types";
import { GROUPS, GROUP_LABEL, groupOf, randomPick } from "./lib/picker";
import { buildPool, recommend } from "./lib/recommend";
import { PRODUCTS } from "./lib/expand";
import ResultCard from "./components/ResultCard";

const SLOT_LABEL: Record<Slot, string> = {
  BREAKFAST: "早餐",
  LUNCH_DINNER: "平日時段",
};

export default function App() {
  const [slot, setSlot] = useState<Slot | null>(null);
  const [buttons, setButtons] = useState<Product[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState<string[] | null>(null);

  const pool = useMemo(() => (slot ? buildPool(slot) : null), [slot]);
  const result = useMemo(
    () => (pool && submitted?.length ? recommend(pool, submitted) : null),
    [pool, submitted],
  );

  /** 換時段等於重來：上一個時段選的東西在這個時段不一定買得到。 */
  function chooseSlot(s: Slot) {
    setSlot(s);
    setButtons(randomPick(s, 15));
    setSelected([]);
    setSubmitted(null);
  }

  function reroll() {
    if (!slot) return;
    setButtons(randomPick(slot, 15));
    setSelected([]);
    setSubmitted(null);
  }

  const toggle = (id: string) => {
    setSubmitted(null);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const removeButton = (id: string) => {
    setSubmitted(null);
    setButtons((b) => b.filter((p) => p.id !== id));
    setSelected((s) => s.filter((x) => x !== id));
  };

  /**
   * 名稱一律查商品主檔，不要只查當前的 15 個按鈕 ——
   * 被刪掉或重抽掉的品項還是可能出現在結果訊息裡，那時就會露出原始編號。
   */
  const nameOf = (id: string) => PRODUCTS.get(id)?.name ?? id;

  return (
    <div className="min-h-screen bg-base-100">
      <header className="border-b border-base-300 bg-base-200">
        <div className="mx-auto max-w-5xl px-5 py-5">
          <h1 className="text-2xl font-bold">麥當勞優惠推薦</h1>
          <p className="text-sm opacity-60">
            選出想吃的東西，系統從 21,190 種可點方案裡找出最便宜與最澎湃的組合
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-5 py-8">
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold tracking-wide opacity-60">
                ② 想吃什麼？點擊選取，再點一次取消
              </h2>
              <button className="btn btn-sm btn-outline" onClick={reroll}>
                重新抽 15 個
              </button>
            </div>

            {buttons.length === 0 ? (
              <div className="alert alert-warning">
                按鈕都被刪光了，按「重新抽 15 個」再來一次。
              </div>
            ) : (
              GROUPS.map((g) => {
                const items = buttons.filter((p) => groupOf(p) === g);
                if (!items.length) return null;
                return (
                  <div key={g} className="flex flex-col gap-2">
                    <div className="text-xs font-medium opacity-50">
                      {GROUP_LABEL[g]}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {items.map((p) => {
                        const on = selected.includes(p.id);
                        return (
                          <div key={p.id} className="join">
                            <button
                              className={`btn btn-sm join-item ${on ? "btn-primary" : "btn-outline"}`}
                              onClick={() => toggle(p.id)}
                            >
                              {p.name}
                              <span className="ml-1 font-mono text-xs opacity-60">
                                ${p.price}
                              </span>
                            </button>
                            <button
                              className="btn btn-sm btn-outline join-item px-2"
                              title="從清單移除"
                              onClick={() => removeButton(p.id)}
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        )}

        {/* ③ 已選 + 送出 */}
        {slot && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-wide opacity-60">
              ③ 已選 {selected.length} 項
            </h2>
            {selected.length === 0 ? (
              <p className="text-sm opacity-50">還沒選任何東西。</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selected.map((id) => (
                  <span key={id} className="badge badge-lg badge-primary gap-2">
                    {nameOf(id)}
                    <button
                      className="opacity-70 hover:opacity-100"
                      onClick={() => toggle(id)}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div>
              <button
                className="btn btn-primary"
                disabled={!selected.length}
                onClick={() => setSubmitted(selected)}
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
                  一次最多只能用 3 張「買套餐送贈品」的券，所以這些品項這次沒排進去，
                  需要另外原價單點：
                  <b>{result.dropped.map(nameOf).join("、")}</b>
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
                選了 7 個以上的品項，改用貪婪演算法求解（窮舉法在 15 個品項時有
                13.8 億種切法）。結果可能比最佳解多付幾塊錢。
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
