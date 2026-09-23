import { useState } from "react";
import { useMcdDeal, type Objective } from "./hooks";
import Keypad from "./components/Keypad";
import ResultCard from "./components/ResultCard";

export default function App() {
  const d = useMcdDeal({ timeSlot: "breakfast" });
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">麥當勞優惠計算機 v2</h1>
        <select
          className="select select-sm select-bordered"
          value={d.objective}
          onChange={(e) => {
            d.setObjective(e.target.value as Objective);
            setSubmitted(false);
          }}
        >
          <option value="min_price">花費最少</option>
          <option value="max_savings">省最多</option>
          <option value="min_coupons">券數最少</option>
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
        onClear={() => {
          d.clear();
          setSubmitted(false);
        }}
        onSwitchSlot={() => {
          d.setTimeSlot(d.timeSlot === "breakfast" ? "regular" : "breakfast");
          setSubmitted(false);
        }}
        onSubmit={() => setSubmitted(true)}
      />

      {submitted && d.result && <ResultCard result={d.result} />}
    </div>
  );
}
