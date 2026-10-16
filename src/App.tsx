import { useState } from "react";
import { useMcdDeal, type Objective } from "./hooks";
import Keypad from "./components/Keypad";
import ResultCard from "./components/ResultCard";

const OBJECTIVE_LABELS: Record<Objective, string> = {
  min_price: "花費最少",
  max_savings: "省最多",
  min_coupons: "券數最少",
};

// 下拉選單要顯示哪些排序，第一個是預設值。James 2026-10-13 指示先只留
// 「省最多」，另外兩個暫時隱藏（未定案，之後要恢復就把它們加回這個陣列）。
const VISIBLE_OBJECTIVES: Objective[] = ["max_savings"];

export default function App() {
  const d = useMcdDeal({
    timeSlot: "breakfast",
    objective: VISIBLE_OBJECTIVES[0],
  });
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">麥當勞優惠計算機</h1>
        <select
          className="select select-sm select-bordered"
          value={d.objective}
          onChange={(e) => {
            d.setObjective(e.target.value as Objective);
            setSubmitted(false);
          }}
        >
          {VISIBLE_OBJECTIVES.map((o) => (
            <option key={o} value={o}>
              {OBJECTIVE_LABELS[o]}
            </option>
          ))}
        </select>
      </header>

      <p className="text-sm opacity-60">
        已選 {d.selected.length} / {d.maxKeys} 個，最少要 {d.minKeys} 個
      </p>

      <Keypad
        buttons={d.buttons}
        selected={d.selected}
        timeSlot={d.timeSlot}
        canSubmit={d.canSubmit}
        onToggle={(id) => {
          d.toggle(id);
          setSubmitted(false);
        }}
        onSwitchSlot={() => {
          d.setTimeSlot(d.timeSlot === "breakfast" ? "regular" : "breakfast");
          setSubmitted(false);
        }}
        onSubmit={() => setSubmitted(true)}
      />

      {submitted && d.result && (
        <ResultCard
          result={d.result}
          objective={d.objective}
          mealSavingsBasis={d.mealSavingsBasis}
        />
      )}
    </div>
  );
}
