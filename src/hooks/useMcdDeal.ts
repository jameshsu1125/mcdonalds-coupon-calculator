import { useCallback, useMemo, useState } from 'react'
import raw from './data.json'
import { solve, type SolverDeal } from './solver'
import type {
  McdButton, McdData, McdDeal, McdResult, Objective, TimeSlot, UseMcdDeal,
  UseMcdDealOptions,
} from './types'

const DATA = raw as unknown as McdData
const MIN_KEYS = 2
const MAX_KEYS = 6

const DEALS_BY_ID = new Map(DATA.deals.map(d => [d.id, d]))
const BUTTONS_BY_ID = new Map(DATA.buttons.map(b => [b.id, b]))

function toDeal(id: string): McdDeal {
  const d = DEALS_BY_ID.get(id)
  if (!d) throw new Error(`unknown deal id: ${id}`)
  return {
    id: d.id, title: d.title, source: d.source, covers: d.covers,
    priceMin: d.priceMin, priceMax: d.priceMax,
    savingsMin: d.savingsMin, itemCount: d.itemCount,
    breakdown: d.breakdown ?? null,
    products: (d.products ?? []).map(p => ({
      ...p,
      categories: (p.button && BUTTONS_BY_ID.get(p.button)?.categories) || ['none' as const],
    })),
  }
}

function buttonsFor(slot: TimeSlot): McdButton[] {
  // 順序來自 data.json 的 keypadOrder（照客戶 4x4 規格表建置），
  // 不是 buttons 陣列本身的順序 —— 那個順序只是 BUTTON_IDS 字典序，
  // 在 regular 時段會整個排錯。
  return DATA.keypadOrder[slot].map(id => {
    const b = BUTTONS_BY_ID.get(id)
    if (!b) throw new Error(`unknown button id in keypadOrder: ${id}`)
    return {
      id: b.id, label: b.label, categories: b.categories,
      priceMin: b.price_range[slot].min,
      priceMax: b.price_range[slot].max,
    }
  })
}

const HINTS_BY_SLOT: Record<TimeSlot, McdDeal[]> = {
  breakfast: hintsFor('breakfast'),
  regular: hintsFor('regular'),
}

function hintsFor(slot: TimeSlot): McdDeal[] {
  return DATA.deals
    .filter(d => d.hintOnly && (d.timeSlot === 'all_day' || d.timeSlot === slot))
    .map(d => toDeal(d.id))
}

/**
 * 不經過 hook、直接用一組按鍵 id 算結果（例如結果頁拿到使用者在鍵盤上
 * 按的 id 之後一次算）。規則跟 hook 完全一樣——hook 自己也是呼叫這個。
 *
 * - keys 數量不在 2～6 之間時回傳 null（跟 hook 的 result 一樣）
 * - keys 裡有不屬於這個時段的 id（打錯字、或早餐傳了 'fries'）會直接
 *   throw，不像 toggle 那樣默默忽略——一次傳一整組時，默默少算一個按鍵
 *   比報錯更難查
 * - 重複的 id 只算一次（同一個按鍵不能代表兩份）
 */
export function solveMcdDeal(
  timeSlot: TimeSlot,
  keys: string[],
  objective: Objective = DATA.defaultObjective,
): McdResult | null {
  const buttons = buttonsFor(timeSlot)
  const byId = new Map(buttons.map(b => [b.id, b]))
  const unique = [...new Set(keys)]
  const unknown = unique.filter(id => !byId.has(id))
  if (unknown.length > 0) {
    throw new Error(
      `solveMcdDeal: 這些 id 不在 ${timeSlot} 時段的鍵盤上：${unknown.join(', ')}`)
  }
  if (unique.length < MIN_KEYS || unique.length > MAX_KEYS) return null
  // 即時求解（solver.ts，scripts/solver.py 的忠實移植）。DATA.deals 的
  // 形狀是 SolverDeal 的超集合（多帶 title/priceMax 給畫面用），可以直接傳。
  const hit = solve(timeSlot, unique, DATA.deals as SolverDeal[], objective)
  return {
    savingsFrom: hit.savingsFrom,
    itemCount: hit.itemCount,
    priceFrom: hit.priceFrom,
    // 注意：hit.dealIds 是「含重複」的多重集合（星級點／甜心卡可重複
    // 兌換），這裡逐一 map、不去重、不經 Set/Map 收斂，讓重複券在畫面
    // 上如實顯示，否則顯示的商品數與省額會跟卡片上的數字對不上。
    deals: hit.dealIds.map(toDeal),
    uncovered: hit.uncovered.map(id => byId.get(id)!),
    hints: HINTS_BY_SLOT[timeSlot],
  }
}

export function useMcdDeal(options: UseMcdDealOptions = {}): UseMcdDeal {
  const [timeSlot, setSlotState] = useState<TimeSlot>(options.timeSlot ?? 'breakfast')
  const [objective, setObjective] = useState<Objective>(
    options.objective ?? DATA.defaultObjective)
  const [selected, setSelected] = useState<string[]>([])

  const buttons = useMemo(() => buttonsFor(timeSlot), [timeSlot])
  const buttonIds = useMemo(() => new Set(buttons.map(b => b.id)), [buttons])

  const setTimeSlot = useCallback((s: TimeSlot) => {
    setSlotState(s)
    setSelected([])          // 切換時段一律清空
  }, [])

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (!buttonIds.has(id)) return prev        // 不屬於目前時段
      if (prev.length >= MAX_KEYS) return prev   // 已滿 6 個
      return [...prev, id]
    })
  }, [buttonIds])

  const clear = useCallback(() => setSelected([]), [])

  const canSubmit = selected.length >= MIN_KEYS && selected.length <= MAX_KEYS

  // selected 一定都是這個時段的合法 id（toggle 會擋），不會 throw
  const result = useMemo<McdResult | null>(
    () => solveMcdDeal(timeSlot, selected, objective),
    [timeSlot, selected, objective])

  return {
    timeSlot, setTimeSlot, objective, setObjective,
    buttons, selected, toggle, clear, canSubmit, result,
    minKeys: MIN_KEYS, maxKeys: MAX_KEYS,
    mealSavingsBasis: DATA.mealSavingsBasis,
  }
}
