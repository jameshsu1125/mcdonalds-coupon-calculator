import { useCallback, useMemo, useState } from 'react'
import raw from './data.json'
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
      id: b.id, label: b.label,
      priceMin: b.price_range[slot].min,
      priceMax: b.price_range[slot].max,
    }
  })
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

  const hints = useMemo(
    () => DATA.deals
      .filter(d => d.hintOnly && (d.timeSlot === 'all_day' || d.timeSlot === timeSlot))
      .map(d => toDeal(d.id)),
    [timeSlot])

  const result = useMemo<McdResult | null>(() => {
    if (!canSubmit) return null
    const key = `${timeSlot}:${[...selected].sort().join(',')}`
    const hit = DATA.lookup[objective][key]
    if (!hit) throw new Error(`lookup miss: ${key} (${objective})`)
    const byId = new Map(buttons.map(b => [b.id, b]))
    return {
      savingsFrom: hit.s,
      itemCount: hit.n,
      priceFrom: hit.p,
      // 注意：hit.d 是「含重複」的多重集合（星級點／甜心卡可重複兌換），
      // 這裡逐一 map、不去重、不經 Set/Map 收斂，讓重複券在畫面上如實顯示，
      // 否則顯示的商品數與省額會跟卡片上的數字對不上。
      deals: hit.d.map(toDeal),
      uncovered: hit.u.map(id => byId.get(id)!),
      hints,
    }
  }, [canSubmit, timeSlot, selected, objective, buttons, hints])

  return {
    timeSlot, setTimeSlot, objective, setObjective,
    buttons, selected, toggle, clear, canSubmit, result,
    minKeys: MIN_KEYS, maxKeys: MAX_KEYS,
  }
}
