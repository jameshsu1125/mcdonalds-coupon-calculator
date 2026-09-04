import type { Bundle, Deal, Role } from "../lib/types";

const ROLE_LABEL: Record<Role, string> = {
  A: "A區", B: "B區", BOGO: "買一送一",
  MAIN: "主餐", SIDE: "副餐", DRINK: "飲料", GIFT: "贈品",
};

const ROLE_STYLE: Record<Role, string> = {
  A: "badge-primary", B: "badge-secondary", BOGO: "badge-accent",
  MAIN: "badge-primary", SIDE: "badge-ghost", DRINK: "badge-info",
  GIFT: "badge-success",
};

function CouponRow({ deal, index }: { deal: Deal; index: number }) {
  return (
    <li className="rounded-box border border-base-300 bg-base-100 p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="mr-2 font-mono text-xs opacity-50">券 {index + 1}</span>
          <span className="text-sm font-medium">{deal.source}</span>
          {deal.channel && (
            <span className="badge badge-warning badge-sm ml-2">{deal.channel}</span>
          )}
        </div>
        <span className="shrink-0 font-mono text-sm tabular-nums">${deal.price}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {deal.items.map((it, i) => (
          <span key={i} className="badge badge-sm gap-1 whitespace-nowrap">
            <span className={`badge badge-xs ${ROLE_STYLE[it.zone]}`} />
            {it.name}
            {it.qty > 1 && <span className="opacity-60">x{it.qty}</span>}
            <span className="opacity-40">{ROLE_LABEL[it.zone]}</span>
          </span>
        ))}
      </div>
    </li>
  );
}

/**
 * Tailwind 是靠掃描原始碼裡的字面字串產生 class 的，所以顏色必須寫死，
 * 不能用 `border-${accent}` 這種樣板字串組出來 —— 那樣掃不到、樣式不會生成。
 */
const ACCENT = {
  primary: { border: "border-primary", text: "text-primary" },
  secondary: { border: "border-secondary", text: "text-secondary" },
} as const;

export default function ResultCard({
  title, subtitle, bundle, accent,
}: {
  title: string;
  subtitle: string;
  bundle: Bundle;
  accent: keyof typeof ACCENT;
}) {
  const c = ACCENT[accent];
  return (
    <div className={`card border-2 bg-base-200 ${c.border}`}>
      <div className="card-body gap-4 p-5">
        <div>
          <h3 className={`card-title ${c.text}`}>{title}</h3>
          <p className="text-sm opacity-60">{subtitle}</p>
        </div>

        <div className="stats stats-horizontal bg-base-100 shadow-sm">
          <div className="stat place-items-center px-3 py-2">
            <div className="stat-title text-xs">實付</div>
            <div className="stat-value text-2xl tabular-nums">${bundle.total_price}</div>
          </div>
          <div className="stat place-items-center px-3 py-2">
            <div className="stat-title text-xs">省下</div>
            <div className="stat-value text-2xl text-success tabular-nums">
              ${bundle.total_savings}
            </div>
          </div>
          <div className="stat place-items-center px-3 py-2">
            <div className="stat-title text-xs">品項</div>
            <div className="stat-value text-2xl tabular-nums">{bundle.total_items}</div>
          </div>
          <div className="stat place-items-center px-3 py-2">
            <div className="stat-title text-xs">用券</div>
            <div className="stat-value text-2xl tabular-nums">{bundle.coupon_count}</div>
          </div>
        </div>

        <ul className="flex flex-col gap-2">
          {bundle.coupons.map((d, i) => (
            <CouponRow key={d._id} deal={d} index={i} />
          ))}
        </ul>
      </div>
    </div>
  );
}
