import type { McdResult } from "../hooks";

export default function ResultCard({ result }: { result: McdResult }) {
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
            <li key={i} className="flex justify-between gap-4 text-sm">
              <span>{d.title}</span>
              <span className="whitespace-nowrap opacity-70">
                ${d.priceMin}
                {d.priceMax !== d.priceMin && `~${d.priceMax}`}
              </span>
            </li>
          ))}
        </ul>

        {/* result.uncovered 是 McdButton[]，顯示用 .label */}
        {result.uncovered.length > 0 && (
          <div className="alert alert-warning text-sm">
            這幾項沒有優惠可搭，需另外原價單點：
            {result.uncovered.map((b) => b.label).join("、")}
          </div>
        )}

        {result.hints.length > 0 && (
          <div className="text-xs opacity-60">
            另可留意：{result.hints.map((h) => h.title).join("；")}
          </div>
        )}
      </div>
    </div>
  );
}
