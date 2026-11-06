import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { solveMcdDeal, useMcdDeal } from './useMcdDeal'

describe('useMcdDeal', () => {
  it('defaults to min_price when no objective is given', () => {
    // 這個值的來源是 config.json 的 default_objective（"min_price"），經
    // export_package.py 寫進 data.json 的 defaultObjective，也是
    // scripts/solver.py solve() 本身的預設參數（tests/test_solver.py 的
    // test_solve_default_objective_is_min_price 釘住 Python 那一半）——
    // 釘住這裡，避免重跑匯出或改動 solver.ts 預設值時兩邊悄悄不一致。
    const { result } = renderHook(() => useMcdDeal())
    expect(result.current.objective).toBe('min_price')
  })

  it('an explicit objective option still overrides the default', () => {
    const { result } = renderHook(() => useMcdDeal({ objective: 'max_savings' }))
    expect(result.current.objective).toBe('max_savings')
  })

  it('starts empty and cannot submit', () => {
    const { result } = renderHook(() => useMcdDeal())
    expect(result.current.selected).toEqual([])
    expect(result.current.canSubmit).toBe(false)
    expect(result.current.result).toBeNull()
  })

  // 結果卡靠這個值決定「買套餐送贈品」的算式說明；data.json 少了它時
  // 說明會整條消失而不會報錯（2026-10-16 真的發生過），所以釘住。
  it('exposes meal_savings.basis from config (set_meal)', () => {
    const { result } = renderHook(() => useMcdDeal())
    expect(result.current.mealSavingsBasis).toBe('set_meal')
  })

  it('exposes 14 buttons per slot', () => {
    const { result } = renderHook(() => useMcdDeal({ timeSlot: 'breakfast' }))
    expect(result.current.buttons).toHaveLength(14)
  })

  // 按鍵順序照客戶 2026-10-13 的鍵盤圖（common.BREAKFAST_KEYS / common.REGULAR_KEYS），
  // 不是 data.json 裡 buttons 陣列本身的順序（那是 BUTTON_IDS 字典序，
  // regular 時段會整個排錯）。這裡釘住兩個時段完整、有序的 id 陣列，
  // 只檢查 length 不會抓到順序錯誤。
  it('returns buttons in the exact 4x4 keypad order for each slot', () => {
    const breakfast = renderHook(() => useMcdDeal({ timeSlot: 'breakfast' }))
    expect(breakfast.result.current.buttons.map(b => b.id)).toEqual([
      'muffin', 'pancake', 'bagel', 'egg_burger',
      'nuggets', 'mcchicken', 'filet', 'hashbrown',
      'soda', 'mccafe', 'tea', 'corn_soup',
      'cone', 'mcflurry',
    ])

    const regular = renderHook(() => useMcdDeal({ timeSlot: 'regular' }))
    expect(regular.result.current.buttons.map(b => b.id)).toEqual([
      'beef_burger', 'chicken_burger', 'filet', 'mccrispy',
      'nuggets', 'spicy_wings', 'fries', 'apple_pie',
      'soda', 'mccafe', 'tea', 'corn_soup',
      'cone', 'mcflurry',
    ])
  })

  it('produces a result once two keys are selected', () => {
    const { result } = renderHook(() => useMcdDeal({ timeSlot: 'regular' }))
    act(() => { result.current.toggle('soda') })
    act(() => { result.current.toggle('tea') })
    expect(result.current.canSubmit).toBe(true)
    expect(result.current.result!.savingsFrom).toBeGreaterThan(0)
    expect(result.current.result!.deals.length).toBeGreaterThan(0)
  })

  it('toggling an already-selected key removes it', () => {
    const { result } = renderHook(() => useMcdDeal({ timeSlot: 'regular' }))
    act(() => { result.current.toggle('soda') })
    act(() => { result.current.toggle('soda') })
    expect(result.current.selected).toEqual([])
  })

  it('refuses a seventh key', () => {
    const { result } = renderHook(() => useMcdDeal({ timeSlot: 'regular' }))
    const seven = ['soda', 'tea', 'mccafe', 'corn_soup', 'fries', 'nuggets', 'cone']
    seven.forEach(k => act(() => { result.current.toggle(k) }))
    expect(result.current.selected).toHaveLength(6)
    expect(result.current.selected).not.toContain('cone')
  })

  it('ignores keys not in the current slot', () => {
    const { result } = renderHook(() => useMcdDeal({ timeSlot: 'regular' }))
    act(() => { result.current.toggle('hashbrown') })   // 早餐限定
    expect(result.current.selected).toEqual([])
  })

  it('clear() empties the selection', () => {
    const { result } = renderHook(() => useMcdDeal({ timeSlot: 'regular' }))
    act(() => { result.current.toggle('soda') })
    act(() => { result.current.clear() })
    expect(result.current.selected).toEqual([])
  })

  it('switching slot clears the selection', () => {
    const { result } = renderHook(() => useMcdDeal({ timeSlot: 'regular' }))
    act(() => { result.current.toggle('soda') })
    act(() => { result.current.setTimeSlot('breakfast') })
    expect(result.current.selected).toEqual([])
    expect(result.current.timeSlot).toBe('breakfast')
  })

  it('max_savings never reports less than min_coupons', () => {
    // 明確指定 objective，不要靠預設值 —— 這個測試原本假設預設是 max_savings，
    // 預設改成 min_price 之後就失效了（min_price 的省額本來就比 min_coupons 低）。
    const { result } = renderHook(() =>
      useMcdDeal({ timeSlot: 'regular', objective: 'max_savings' }))
    act(() => { result.current.toggle('beef_burger') })
    act(() => { result.current.toggle('soda') })
    const high = result.current.result!.savingsFrom
    act(() => { result.current.setObjective('min_coupons') })
    expect(result.current.result!.savingsFrom).toBeLessThanOrEqual(high)
  })

  it('covers all four breakfast meal-only keys now that meal coupons are unlimited', () => {
    // 2026-11-03 起同一種套餐券不限張數（coupon_rules），以前這 4 個主餐
    // 只有 3 張套餐券可用、一定有一個沒券可用；現在每個都能各配一張。
    const { result } = renderHook(() => useMcdDeal({ timeSlot: 'breakfast' }))
    ;['muffin', 'mcchicken', 'pancake', 'bagel'].forEach(k =>
      act(() => { result.current.toggle(k) }))
    expect(result.current.result!.uncovered).toHaveLength(0)
  })

  it('always exposes the spend-threshold hints', () => {
    const { result } = renderHook(() => useMcdDeal({ timeSlot: 'regular' }))
    act(() => { result.current.toggle('soda') })
    act(() => { result.current.toggle('tea') })
    expect(result.current.result!.hints.every(h => h.source === 'spend')).toBe(true)
  })

  // deal_ids 是多重集合：星級點／甜心卡允許重複兌換，同一張券可以在 d 陣列
  // 出現兩次以上。這裡釘住一筆真實資料裡的重複案例
  // （breakfast: apple_pie, bagel, cone, mcchicken, muffin, pancake，
  //  max_savings 的 d 含兩次 star-11），確認 hook 輸出的 deals 陣列
  // 保留重複，而不是被 Set/Map 去重掉。
  it('every coupon includes a pressed item and covers a button no other coupon covers', () => {
    // 2026-11-03 James 的選券規則（coupon_rules.irredundant）：
    // 1. 每張券至少包含一個使用者按的品項；
    // 2. 不能為了省更多硬塞券——每張券都要有只有它蓋到的按鍵，
    //    所以同一張券也不會重複出現。
    const keys = ['beef_burger', 'filet', 'fries', 'mccrispy', 'soda', 'tea']
    const { result } = renderHook(() => useMcdDeal({ timeSlot: 'regular', objective: 'max_savings' }))
    keys.forEach(k => act(() => { result.current.toggle(k) }))
    const r = result.current.result!
    const pressed = new Set(keys)
    const own = r.deals.map(d => new Set(d.covers.filter(c => pressed.has(c))))
    own.forEach((mine, i) => {
      expect(mine.size).toBeGreaterThan(0)
      const others = new Set(own.filter((_, j) => j !== i).flatMap(s => [...s]))
      expect([...mine].some(c => !others.has(c))).toBe(true)
    })
    expect(new Set(r.deals.map(d => d.id)).size).toBe(r.deals.length)

    // 逐一加總應該等於卡片上的總數
    expect(r.deals.reduce((acc, d) => acc + d.savingsMin, 0)).toBe(r.savingsFrom)
    expect(r.deals.reduce((acc, d) => acc + d.itemCount, 0)).toBe(r.itemCount)
    expect(r.deals.reduce((acc, d) => acc + d.priceMin, 0)).toBe(r.priceFrom)
  })

})

describe('useMcdDeal — computed instead of looked up', () => {
  // v2 不再內嵌 lookup 表（見 solver.test.ts 的完整 oracle 比對），
  // useMcdDeal 改成呼叫 solve() 即時算答案。這裡釘住的行為變化是：
  // 就算 deals 資料完全湊不到任何一張券，也不再是「查表 miss 就丟例外」
  // ——solve() 對任何合法輸入都會回傳一個結果（可能 deals 是空陣列、
  // uncovered 是全部按鍵），呼叫端不需要再處理「miss」這個舊概念。
  it('still returns a (possibly empty) result when no deal in the data covers the selection', async () => {
    vi.resetModules()
    vi.doMock('./data.json', () => ({
      default: {
        generatedFrom: 'test', validFrom: '2026-09-01', validTo: '2026-09-30',
        defaultObjective: 'min_price',
        buttons: [
          { id: 'soda', label: '汽水', time_slots: ['regular'], price_range: { regular: { min: 30, max: 30 } } },
          { id: 'tea', label: '茶飲', time_slots: ['regular'], price_range: { regular: { min: 30, max: 30 } } },
        ],
        // 故意留空：這張假資料裡沒有任何一張券蓋得到 soda/tea
        deals: [],
        keypadOrder: { breakfast: [], regular: ['soda', 'tea'] },
      },
    }))
    const { useMcdDeal: hookWithNoDeals } = await import('./useMcdDeal')

    const { result } = renderHook(() => hookWithNoDeals({ timeSlot: 'regular' }))
    act(() => { result.current.toggle('soda') })
    act(() => { result.current.toggle('tea') })

    expect(result.current.canSubmit).toBe(true)
    const r = result.current.result!
    expect(r.savingsFrom).toBe(0)
    expect(r.deals).toEqual([])
    expect(r.uncovered.map(b => b.id).sort()).toEqual(['soda', 'tea'])

    vi.doUnmock('./data.json')
    vi.resetModules()
  })
})

// 結果頁一次拿到整組按鍵 id 時用的純函式（不經過 toggle）。hook 內部也是
// 呼叫它，所以兩邊對同一組輸入必須回傳一模一樣的結果。
describe('solveMcdDeal', () => {
  it('returns exactly what the hook returns for the same keys', () => {
    const keys = ['beef_burger', 'fries', 'soda']
    const { result } = renderHook(() =>
      useMcdDeal({ timeSlot: 'regular', objective: 'max_savings' }))
    keys.forEach(k => act(() => { result.current.toggle(k) }))
    expect(solveMcdDeal('regular', keys, 'max_savings')).toEqual(result.current.result)
  })

  it('does not depend on the order of keys', () => {
    expect(solveMcdDeal('regular', ['soda', 'fries', 'beef_burger'], 'max_savings'))
      .toEqual(solveMcdDeal('regular', ['beef_burger', 'fries', 'soda'], 'max_savings'))
  })

  it('returns null when fewer than 2 or more than 6 distinct keys', () => {
    expect(solveMcdDeal('regular', ['fries'])).toBeNull()
    expect(solveMcdDeal('regular', [])).toBeNull()
    expect(solveMcdDeal('regular', [
      'beef_burger', 'chicken_burger', 'filet', 'mccrispy', 'nuggets', 'fries', 'soda',
    ])).toBeNull()
  })

  it('counts a repeated id once (one button never means two portions)', () => {
    expect(solveMcdDeal('regular', ['fries', 'fries'])).toBeNull()
    expect(solveMcdDeal('regular', ['fries', 'soda', 'fries'], 'max_savings'))
      .toEqual(solveMcdDeal('regular', ['fries', 'soda'], 'max_savings'))
  })

  it('throws on ids that are not on this time slot\'s keypad', () => {
    // 早餐沒有薯條；打錯字也一樣。一次傳整組時默默少算一個按鍵比報錯難查
    expect(() => solveMcdDeal('breakfast', ['fries', 'soda'])).toThrow(/fries/)
    expect(() => solveMcdDeal('regular', ['soda', 'frise'])).toThrow(/frise/)
  })

  it('defaults to data.json defaultObjective (min_price)', () => {
    expect(solveMcdDeal('regular', ['beef_burger', 'soda']))
      .toEqual(solveMcdDeal('regular', ['beef_burger', 'soda'], 'min_price'))
  })
})

describe('McdDeal.products', () => {
  it('lists one entry per item, each tagged with its button', () => {
    const r = solveMcdDeal('regular', ['beef_burger', 'fries', 'soda'], 'max_savings')!
    for (const d of r.deals) {
      expect(d.products).toHaveLength(d.itemCount)
      const buttons = new Set(d.products.map(p => p.button).filter(Boolean))
      expect(buttons).toEqual(new Set(d.covers))
    }
    // 套餐券的 products 依序是 主餐、配餐(0~2)、飲料(可能沒有)、贈品
    const meal = r.deals.find(d => d.source === 'meal_gift')!
    expect(meal.products[0]).toMatchObject({ role: '主餐', button: 'beef_burger' })
    expect(meal.products[meal.products.length - 1].role).toBe('贈品')
  })
})

describe('category', () => {
  it('every button carries its category', () => {
    const { result } = renderHook(() => useMcdDeal({ timeSlot: 'breakfast' }))
    const byId = Object.fromEntries(result.current.buttons.map(b => [b.id, b.categories]))
    expect(byId.muffin).toEqual(['肉類'])
    expect(byId.hashbrown).toEqual(['炸物'])
    expect(byId.nuggets).toEqual(['炸物', '肉類'])
    expect(byId.tea).toEqual(['湯／甜點／飲料'])
    expect(byId.mccafe).toEqual(['咖啡／茶'])
    expect(byId.egg_burger).toEqual(['肉類'])
  })

  it('every deal product carries its button category', () => {
    const r = solveMcdDeal('regular', ['beef_burger', 'fries', 'soda'], 'max_savings')!
    // 每份商品的分類 = 它所屬按鍵的分類；沒有按鍵的（四季沙拉）是 ['none']
    const { result } = renderHook(() => useMcdDeal({ timeSlot: 'regular' }))
    const catOf = new Map(result.current.buttons.map(b => [b.id, b.categories]))
    for (const d of r.deals) {
      for (const p of d.products) {
        expect(p.categories).toEqual(p.button ? catOf.get(p.button) : ['none'])
      }
    }
  })
})
