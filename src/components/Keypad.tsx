import type { McdButton, TimeSlot } from "../hooks";

interface Props {
  buttons: McdButton[];
  selected: string[];
  timeSlot: TimeSlot;
  canSubmit: boolean;
  onToggle: (id: string) => void;
  onSwitchSlot: () => void;
  onSubmit: () => void;
}

// 照客戶 2026-10-13 鍵盤圖排成 4x4：前 12 個商品鍵排滿三列，最後一列是
// 切換時段、第 13~14 個商品鍵（蛋捲冰淇淋、冰炫風）、Enter。最上面那列
// （刪除/音效/口播稿）James 指示先不放；要取消已選的按鍵就再按一次。
const ITEMS_BEFORE_LAST_ROW = 12;

export default function Keypad(p: Props) {
  const itemButton = (b: McdButton) => {
    const on = p.selected.includes(b.id);
    return (
      <button
        key={b.id}
        type="button"
        onClick={() => p.onToggle(b.id)}
        aria-pressed={on}
        className={`btn h-20 flex-col gap-0 text-sm leading-tight ${
          on ? "btn-primary" : "btn-outline"
        }`}
      >
        <span>{b.label}</span>
        <span className="text-xs opacity-60">
          ${b.priceMin}
          {b.priceMax !== b.priceMin && `~${b.priceMax}`}
        </span>
      </button>
    );
  };

  return (
    <div className="grid grid-cols-4 gap-2">
      {p.buttons.slice(0, ITEMS_BEFORE_LAST_ROW).map(itemButton)}
      <button
        type="button"
        className="btn btn-ghost h-20 flex-col gap-0"
        onClick={p.onSwitchSlot}
      >
        <span>切換時段</span>
        <span className="text-xs opacity-60">
          {p.timeSlot === "breakfast" ? "目前早餐" : "目前午晚餐"}
        </span>
      </button>
      {p.buttons.slice(ITEMS_BEFORE_LAST_ROW).map(itemButton)}
      <button
        type="button"
        className="btn btn-secondary h-20"
        disabled={!p.canSubmit}
        onClick={p.onSubmit}
      >
        Enter
      </button>
    </div>
  );
}
