export type TimeSlot = 'breakfast' | 'regular'
export type Objective = 'max_savings' | 'min_coupons' | 'min_price'

export interface McdButton {
  id: string
  label: string
  priceMin: number
  priceMax: number
}

// savingsMin 是哪一組實際品項算出來的：sum(items.price) - paid === savingsMin
// （build_deals.py 建置時就 assert 過）。只有 hint 券（滿額送）是 null。
export interface McdBreakdownItem {
  role: string
  name: string
  price: number
}

export interface McdBreakdown {
  items: McdBreakdownItem[]
  paid: number
}

export interface McdDeal {
  id: string
  title: string
  source: 'star' | 'sweetheart' | 'bogo' | 'meal_gift' | 'spend'
  covers: string[]
  priceMin: number
  priceMax: number
  savingsMin: number
  itemCount: number
  breakdown: McdBreakdown | null
}

export interface McdResult {
  savingsFrom: number
  itemCount: number
  priceFrom: number
  deals: McdDeal[]
  uncovered: McdButton[]
  hints: McdDeal[]
}

export interface UseMcdDealOptions {
  timeSlot?: TimeSlot
  objective?: Objective
}

export interface UseMcdDeal {
  timeSlot: TimeSlot
  setTimeSlot: (s: TimeSlot) => void
  objective: Objective
  setObjective: (o: Objective) => void
  buttons: McdButton[]
  selected: string[]
  toggle: (id: string) => void
  clear: () => void
  canSubmit: boolean
  result: McdResult | null
  minKeys: 2
  maxKeys: 6
}

// 內部型別：v2/package/data.json 的實際形狀（build-time 產物，呼叫端不需要引用）
export interface McdData {
  generatedFrom: string
  validFrom: string
  validTo: string
  defaultObjective: Objective
  buttons: Array<{
    id: string
    label: string
    time_slots: TimeSlot[]
    price_range: Record<string, { min: number; max: number }>
  }>
  deals: Array<{
    id: string
    title: string
    source: McdDeal['source']
    covers: string[]
    priceMin: number
    priceMax: number
    savingsMin: number
    itemCount: number
    timeSlot: TimeSlot | 'all_day'
    hintOnly: boolean
    // solve() 用來判斷「同一張實體券不能重複選用」（bogo/meal_gift 專用，
    // star/sweetheart 可以重複，見 solver.ts 的 REPEATABLE_SOURCES）
    baseCoupon: string
    breakdown: McdBreakdown | null
  }>
  // 每個時段按鍵的顯示順序，照客戶 4x4 規格表（common.BREAKFAST_KEYS /
  // common.REGULAR_KEYS），不是 buttons 陣列本身的順序
  keypadOrder: Record<TimeSlot, string[]>
}
