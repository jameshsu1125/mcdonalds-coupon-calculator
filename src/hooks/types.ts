export type TimeSlot = 'breakfast' | 'regular'
export type Objective = 'max_savings' | 'min_coupons' | 'min_price'
// 「買套餐送X」的原價：set_meal＝套餐價（省額＝贈品），a_la_carte＝各單品加總
export type MealSavingsBasis = 'set_meal' | 'a_la_carte'

// 按鍵分類（v2/config.json 的 button_categories）；還沒定的是 'none'
export type McdCategory = '肉類' | '炸物' | '湯／甜點／飲料' | '咖啡／茶' | 'none'

export interface McdButton {
  id: string
  label: string
  category: McdCategory
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

// 這張券拿到的一份商品。一份一筆（買一送一就是兩筆），button 是這份商品
// 屬於哪個按鍵 id；只有「B清爽配餐」的四季沙拉沒有按鍵，是 null。
export interface McdDealProduct {
  role: string
  name: string
  button: string | null
  category: McdCategory   // 所屬按鍵的分類；沒有按鍵的（四季沙拉）是 'none'
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
  products: McdDealProduct[]
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
  mealSavingsBasis: MealSavingsBasis
}

// 內部型別：v2/package/data.json 的實際形狀（build-time 產物，呼叫端不需要引用）
export interface McdData {
  generatedFrom: string
  validFrom: string
  validTo: string
  defaultObjective: Objective
  mealSavingsBasis: MealSavingsBasis
  buttons: Array<{
    id: string
    label: string
    category: McdCategory
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
    // data.json 不帶 category（省檔案大小），toDeal 從 buttons 補上
    products: Omit<McdDealProduct, 'category'>[]
  }>
  // 每個時段按鍵的顯示順序，照客戶 4x4 規格表（common.BREAKFAST_KEYS /
  // common.REGULAR_KEYS），不是 buttons 陣列本身的順序
  keypadOrder: Record<TimeSlot, string[]>
}
