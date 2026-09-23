import type { McdButton, TimeSlot } from "../hooks";

interface Props {
  buttons: McdButton[];
  selected: string[];
  timeSlot: TimeSlot;
  canSubmit: boolean;
  onToggle: (id: string) => void;
  onClear: () => void;
  onSwitchSlot: () => void;
  onSubmit: () => void;
}

// 4x4 鍵盤：14 個商品鍵（按 hook 回傳的順序，不重排、不分組）
// + 切換時段 + 刪除 補滿第 16 格，Enter 另外整列。
export default function Keypad(p: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2">
        {p.buttons.map((b) => {
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
        })}
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
        <button
          type="button"
          className="btn btn-ghost h-20"
          onClick={p.onClear}
        >
          刪除
        </button>
      </div>
      <button
        type="button"
        className="btn btn-secondary h-16 w-full"
        disabled={!p.canSubmit}
        onClick={p.onSubmit}
      >
        Enter
      </button>
    </div>
  );
}
