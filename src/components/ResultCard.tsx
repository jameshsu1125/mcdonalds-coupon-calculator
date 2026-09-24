import type { McdDeal, McdResult, Objective } from "../hooks";

// 每種券的省額公式，對應 scripts/build_deals.py 裡各 build_*_deals() 的算法
const SOURCE_RULES: Record<McdDeal["source"], { name: string; rule: string }> = {
  star: {
    name: "1+1 星級點",
    rule: "付一個 combo 價拿紅區＋白區兩樣。省額 ＝ 兩樣的單點原價 − combo 價。紅區每個品項的 combo 價不同，所以省額會跟著點的品項變。",
  },
  sweetheart: {
    name: "數位甜心卡",
    rule: "A 區照原價買，B 區免費送。省額 ＝ 送的那樣的原價，A 區花的錢不算省。",
  },
  bogo: {
    name: "買一送一",
    rule: "付一份的錢拿兩份。省額 ＝ 一份的價格。",
  },
  meal_gift: {
    name: "買套餐送贈品",
    rule: "套餐價比主餐、配餐、飲料分開買便宜，另外再送一樣。省額 ＝ 主餐單點＋配餐內容單點＋飲料原價＋贈品原價 − 實付（套餐價＋飲料加價）。",
  },
  spend: { name: "滿額送", rule: "" },
};

const OBJECTIVE_REASON: Record<Objective, string> = {
  min_price: "目前排序是「花費最少」：先挑能蓋到最多按鍵的組合，再挑實付最低的，同價時才比省額。",
  max_savings: "目前排序是「省最多」：先挑能蓋到最多按鍵的組合，再挑省額最高的（可能為了衝省額多疊券、多付錢）。",
  min_coupons: "目前排序是「券數最少」：先挑能蓋到最多按鍵的組合，再挑用券張數最少的，同張數時才比省額。",
};

function DealBlock({ deal }: { deal: McdDeal }) {
  const b = deal.breakdown;
  const original = b ? b.items.reduce((s, i) => s + i.price, 0) : 0;
  return (
    <li className="rounded-box bg-base-100 p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium">{deal.title}</span>
        <span className="badge badge-ghost badge-sm whitespace-nowrap">
          {SOURCE_RULES[deal.source].name}
        </span>
      </div>

      {b && (
        <>
          <table className="mt-2 w-full">
            <tbody>
              {b.items.map((it, i) => (
                <tr key={i}>
                  <td className="w-16 py-0.5 opacity-60">{it.role}</td>
                  <td className="py-0.5">{it.name}</td>
                  <td className="py-0.5 text-right tabular-nums">${it.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 border-t border-base-300 pt-2 text-right tabular-nums">
            原價 ${original} − 實付 ${b.paid} ＝{" "}
            <span className="font-bold text-primary">省 ${deal.savingsMin}</span>
          </div>
        </>
      )}

      <div className="mt-1 text-right text-xs opacity-50">
        這張券依點的品項不同，實付 ${deal.priceMin}
        {deal.priceMax !== deal.priceMin && `~${deal.priceMax}`}
      </div>
    </li>
  );
}

export default function ResultCard({
  result,
  objective,
}: {
  result: McdResult;
  objective: Objective;
}) {
  const withBreakdown = result.deals.filter((d) => d.breakdown);
  const originalTotal = withBreakdown.reduce(
    (s, d) => s + d.breakdown!.items.reduce((t, i) => t + i.price, 0),
    0,
  );
  const paidTotal = withBreakdown.reduce((s, d) => s + d.breakdown!.paid, 0);
  const sources = [...new Set(result.deals.map((d) => d.source))];

  return (
    <div className="card bg-base-200 shadow">
      <div className="card-body gap-4">
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold text-primary">
            省 ${result.savingsFrom} 起
          </span>
          <span className="text-lg opacity-70">
            至少可獲得 {result.itemCount} 樣
          </span>
        </div>

        {/* result.deals 是含重複的多重集合（星級點／甜心卡允許重複兌換）。
            不去重、不用 d.id 當 key —— 否則畫面上的商品數與省額會跟這份
            清單對不上。用陣列索引當 key。 */}
        <ul className="flex flex-col gap-2">
          {result.deals.map((d, i) => (
            <DealBlock key={i} deal={d} />
          ))}
        </ul>

        {/* result.uncovered 是 McdButton[]，顯示用 .label */}
        {result.uncovered.length > 0 && (
          <div className="alert alert-warning text-sm">
            這幾項沒有優惠可搭，需另外原價單點：
            {result.uncovered.map((b) => b.label).join("、")}
          </div>
        )}

        {result.deals.length > 0 && (
          <section className="text-sm">
            <h3 className="mb-1 font-bold">最後省多少怎麼算</h3>
            <p className="tabular-nums">
              {result.deals.map((d) => `$${d.savingsMin}`).join(" ＋ ")} ＝{" "}
              <span className="font-bold text-primary">${result.savingsFrom}</span>
            </p>
            <p className="tabular-nums opacity-70">
              也就是上面所有品項原價合計 ${originalTotal} − 實付合計 ${paidTotal}
            </p>
          </section>
        )}

        <section className="text-sm">
          <h3 className="mb-1 font-bold">為什麼這樣算</h3>
          <ul className="list-disc space-y-1 pl-5 opacity-80">
            {sources
              .filter((s) => SOURCE_RULES[s].rule)
              .map((s) => (
                <li key={s}>
                  <b>{SOURCE_RULES[s].name}</b>：{SOURCE_RULES[s].rule}
                </li>
              ))}
            <li>
              一個按鍵代表一整類商品（例如「滿福堡系列」有十種），同一張券點不同品項，省的錢不一樣。這裡每張券都取<b>整個按鍵裡省最少的那一組</b>，所以寫「省 ${result.savingsFrom} 起」；上面逐項列出的就是那一組。
            </li>
            <li>總省額就是每張券的省額直接相加。</li>
            <li>{OBJECTIVE_REASON[objective]}</li>
            <li>
              疊券規則：同一張鋪底券不能用兩次、不同張可以併用；星級點和甜心卡同一張可以重複用；用券張數不超過按下的按鍵數。
            </li>
            {result.uncovered.length > 0 && (
              <li>沒有券可搭的按鍵照原價單點，不算進省額。</li>
            )}
            {paidTotal !== result.priceFrom && (
              <li>
                注意：上面列的「省最少那組」實付合計是 ${paidTotal}；同樣這幾張券若都點最便宜的品項，只要付 ${result.priceFrom}，但省額會不一樣。省額與實付目前各自取保守值，兩個數字不是同一種點法（等客戶決定省額口徑）。
              </li>
            )}
          </ul>
        </section>

        {result.hints.length > 0 && (
          <div className="text-xs opacity-60">
            另可留意：{result.hints.map((h) => h.title).join("；")}
          </div>
        )}
      </div>
    </div>
  );
}
