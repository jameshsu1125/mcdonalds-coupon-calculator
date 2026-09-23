import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMcdDeal } from './useMcdDeal'

describe('useMcdDeal', () => {
  it('defaults to min_coupons when no objective is given', () => {
    // James 2026-09-23 裁示：預設改為「券數最少」。
    // max_savings 會為了衝高省額把同一張星級點/甜心卡買到 n 次
    // （按 6 個鍵可能拿到 18 樣、付 434 元），當預設值容易誤導。
    // 這個值的來源是 config.json 的 default_objective，經 export_package.py
    // 寫進 data.json 的 defaultObjective —— 釘住它，避免重跑匯出時悄悄漂回去。
    const { result } = renderHook(() => useMcdDeal())
    expect(result.current.objective).toBe('min_coupons')
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

  it('exposes 14 buttons per slot', () => {
    const { result } = renderHook(() => useMcdDeal({ timeSlot: 'breakfast' }))
    expect(result.current.buttons).toHaveLength(14)
  })

  // 按鍵順序照客戶的 4x4 規格表（common.BREAKFAST_KEYS / common.REGULAR_KEYS），
  // 不是 data.json 裡 buttons 陣列本身的順序（那是 BUTTON_IDS 字典序，
  // regular 時段會整個排錯）。這裡釘住兩個時段完整、有序的 id 陣列，
  // 只檢查 length 不會抓到順序錯誤。
  it('returns buttons in the exact 4x4 keypad order for each slot', () => {
    const breakfast = renderHook(() => useMcdDeal({ timeSlot: 'breakfast' }))
    expect(breakfast.result.current.buttons.map(b => b.id)).toEqual([
      'muffin', 'mcchicken', 'filet', 'hashbrown',
      'pancake', 'bagel', 'nuggets', 'soda',
      'mccafe', 'tea', 'corn_soup', 'apple_pie',
      'cone', 'mcflurry',
    ])

    const regular = renderHook(() => useMcdDeal({ timeSlot: 'regular' }))
    expect(regular.result.current.buttons.map(b => b.id)).toEqual([
      'beef_burger', 'chicken_burger', 'filet', 'fries',
      'mccrispy', 'spicy_wings', 'nuggets', 'soda',
      'mccafe', 'tea', 'corn_soup', 'apple_pie',
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
    const { result } = renderHook(() => useMcdDeal({ timeSlot: 'regular' }))
    act(() => { result.current.toggle('beef_burger') })
    act(() => { result.current.toggle('soda') })
    const high = result.current.result!.savingsFrom
    act(() => { result.current.setObjective('min_coupons') })
    expect(result.current.result!.savingsFrom).toBeLessThanOrEqual(high)
  })

  it('reports uncovered buttons for the four breakfast meal-only keys', () => {
    const { result } = renderHook(() => useMcdDeal({ timeSlot: 'breakfast' }))
    ;['muffin', 'mcchicken', 'pancake', 'bagel'].forEach(k =>
      act(() => { result.current.toggle(k) }))
    expect(result.current.result!.uncovered).toHaveLength(1)
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
  //  max_savings 查表 d 含兩次 star-12），確認 hook 輸出的 deals 陣列
  // 保留重複，而不是被 Set/Map 去重掉。
  it('keeps repeated deal ids as a multiset, not deduplicated', () => {
    const { result } = renderHook(() => useMcdDeal({ timeSlot: 'breakfast', objective: 'max_savings' }))
    ;['apple_pie', 'bagel', 'cone', 'mcchicken', 'muffin', 'pancake'].forEach(k =>
      act(() => { result.current.toggle(k) }))

    expect(result.current.canSubmit).toBe(true)
    const r = result.current.result!
    // pinned against real lookup entry: s=291, n=18, p=428
    expect(r.savingsFrom).toBe(291)
    expect(r.itemCount).toBe(18)
    expect(r.priceFrom).toBe(428)

    // 6 張券（含重複），不是去重後的 5 張
    expect(r.deals).toHaveLength(6)
    const star12Count = r.deals.filter(d => d.id === 'star-12').length
    expect(star12Count).toBe(2)

    // 逐一加總 savingsMin 應該等於 savingsFrom（含重複才會對得上）
    const sum = r.deals.reduce((acc, d) => acc + d.savingsMin, 0)
    expect(sum).toBe(r.savingsFrom)
  })

})

describe('useMcdDeal — lookup miss', () => {
  it('throws instead of returning a degraded result when data.json has no entry for the selection', async () => {
    vi.resetModules()
    vi.doMock('./data.json', () => ({
      default: {
        generatedFrom: 'test', validFrom: '2026-09-01', validTo: '2026-09-30',
        defaultObjective: 'max_savings',
        buttons: [
          { id: 'soda', label: '汽水', time_slots: ['regular'], price_range: { regular: { min: 30, max: 30 } } },
          { id: 'tea', label: '茶飲', time_slots: ['regular'], price_range: { regular: { min: 30, max: 30 } } },
        ],
        deals: [],
        // 故意留空：任何 2 鍵組合在這張假資料裡都查不到，模擬 data.json 建置有缺
        lookup: { max_savings: {}, min_coupons: {} },
        keypadOrder: { breakfast: [], regular: ['soda', 'tea'] },
      },
    }))
    const { useMcdDeal: hookWithBrokenData } = await import('./useMcdDeal')

    const { result } = renderHook(() => hookWithBrokenData({ timeSlot: 'regular' }))
    act(() => { result.current.toggle('soda') })
    expect(() => {
      act(() => { result.current.toggle('tea') })
    }).toThrow(/lookup miss/)

    vi.doUnmock('./data.json')
    vi.resetModules()
  })
})
