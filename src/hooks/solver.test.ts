import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { OBJECTIVES, solve, type Objective, type SolveResult, type SolverDeal } from './solver'
import rawData from './data.json'

// ---------------------------------------------------------------------------
// Test data plumbing
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url))
// web/src/hooks -> v2 (三層)
const V2_ROOT = path.resolve(HERE, '../../..')

// data.json 是實際跑在瀏覽器裡的資料（export_package.py 產出），跟
// useMcdDeal.ts 用的是同一份，所以拿它來餵 solve() 才是驗證「正式路徑」，
// 不是另外用 data/deals.json 湊一份形狀相近但不完全一樣的假資料。
const DEALS = (rawData as { deals: SolverDeal[] }).deals
const KEYPAD_ORDER = (rawData as { keypadOrder: Record<string, string[]> }).keypadOrder

type LookupFile = {
  objective: Objective
  entries: Record<string, { s: number; n: number; p: number; d: string[]; u: string[] }>
}

function loadLookup(fname: string): LookupFile {
  const p = path.join(V2_ROOT, 'lookup', fname)
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as LookupFile
}

const LOOKUPS: Record<Objective, LookupFile> = {
  max_savings: loadLookup('lookup-max-savings.json'),
  min_coupons: loadLookup('lookup-min-coupons.json'),
  min_price: loadLookup('lookup-min-price.json'),
}

function combinations<T>(arr: T[], k: number): T[][] {
  const out: T[][] = []
  const combo: T[] = []
  const backtrack = (start: number) => {
    if (combo.length === k) {
      out.push([...combo])
      return
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i])
      backtrack(i + 1)
      combo.pop()
    }
  }
  backtrack(0)
  return out
}

// 跟 scripts/build_lookup.py 的 SLOTS/build() 完全同構：每個時段的按鍵先
// 依字母排序，再取 2..6 個一組的所有組合，查表鍵是 "slot:k1,k2,...".
function allQueries(): { slot: string; keys: string[]; lookupKey: string }[] {
  const out: { slot: string; keys: string[]; lookupKey: string }[] = []
  for (const slot of ['breakfast', 'regular']) {
    const sortedKeys = [...KEYPAD_ORDER[slot]].sort()
    for (let n = 2; n <= 6; n++) {
      for (const combo of combinations(sortedKeys, n)) {
        out.push({ slot, keys: combo, lookupKey: `${slot}:${combo.join(',')}` })
      }
    }
  }
  return out
}

function toLookupShape(r: SolveResult) {
  return { s: r.savingsFrom, n: r.itemCount, p: r.priceFrom, d: r.dealIds, u: r.uncovered }
}

// 每處理一批查詢就讓出一次事件迴圈：純同步跑好幾萬次 solve() 會長時間
// 佔住 worker thread，讓 vitest 主行程與 worker 之間的心跳（onTaskUpdate）
// 逾時，報出跟測試本身無關的 "Unhandled Error"。定期 yield 不影響任何
// 斷言，只是避免這個雜訊。
function yieldNow(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function shuffled<T>(arr: T[], seed: number): T[] {
  // 簡單的線性同餘亂數，只求「跟輸入順序無關」這個性質有被打亂到，
  // 不追求密碼學品質。
  let s = seed
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ---------------------------------------------------------------------------
// 1) Exhaustive oracle comparison — the whole point of this port.
// ---------------------------------------------------------------------------

describe('solve() reproduces every precomputed lookup answer exactly', () => {
  const queries = allQueries()

  it('sanity: 12,922 queries per objective (breakfast + regular combined)', () => {
    expect(queries.length).toBe(12922)
  })

  for (const objective of OBJECTIVES) {
    it(`objective=${objective}: 0 disagreements across all ${queries.length} entries`, async () => {
      const lookup = LOOKUPS[objective]
      expect(Object.keys(lookup.entries).length).toBe(queries.length)

      let disagreements = 0
      const mismatchSamples: string[] = []
      for (let i = 0; i < queries.length; i++) {
        if (i % 1000 === 0) await yieldNow()
        const q = queries[i]
        const expected = lookup.entries[q.lookupKey]
        if (!expected) {
          disagreements++
          mismatchSamples.push(`${q.lookupKey}: missing from lookup file`)
          continue
        }
        const got = toLookupShape(solve(q.slot, q.keys, DEALS, objective))
        const ok =
          got.s === expected.s &&
          got.n === expected.n &&
          got.p === expected.p &&
          got.u.length === expected.u.length &&
          got.u.every((v, i2) => v === expected.u[i2]) &&
          got.d.length === expected.d.length &&
          got.d.every((v, i2) => v === expected.d[i2])
        if (!ok) {
          disagreements++
          if (mismatchSamples.length < 10) {
            mismatchSamples.push(
              `${q.lookupKey}: got ${JSON.stringify(got)} vs expected ${JSON.stringify(expected)}`,
            )
          }
        }
      }
      if (disagreements > 0) {
        // eslint-disable-next-line no-console
        console.error(`[${objective}] disagreements=${disagreements}`, mismatchSamples)
      }
      expect(disagreements).toBe(0)
    }, 180_000)
  }
})

// ---------------------------------------------------------------------------
// 2) Determinism — shuffling `keys` and `deals` must never change the answer.
// ---------------------------------------------------------------------------

describe('determinism under shuffled keys/deals', () => {
  it('0 mismatches across several hundred shuffled queries (all 3 objectives)', () => {
    const queries = allQueries()
    // 421 個查詢 x 3 個 objective x 2 個 shuffle seed = 2,526 次比對，
    // 遠超過「幾百次」的門檻。用固定 step 抽樣讓測試本身也是決定性的。
    const sample = queries.filter((_, i) => i % 30 === 0)
    expect(sample.length).toBeGreaterThan(300)

    let checked = 0
    for (const q of sample) {
      for (const objective of OBJECTIVES) {
        const canonical = solve(q.slot, q.keys, DEALS, objective)
        for (const seed of [1, 2]) {
          const shuffledDeals = shuffled(DEALS, seed + 1000)
          const shuffledKeys = shuffled(q.keys, seed + 2000)
          const got = solve(q.slot, shuffledKeys, shuffledDeals, objective)
          expect(got).toEqual(canonical)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(300)
  }, 60_000)
})

// ---------------------------------------------------------------------------
// 3) Pinned case from the task brief.
// ---------------------------------------------------------------------------

describe('pinned case: nuggets+soda under min_price', () => {
  it('returns the cheap sweetheart coupon, not a meal-gift bundle', () => {
    const r = solve('regular', ['nuggets', 'soda'], DEALS, 'min_price')
    expect(r.priceFrom).toBe(48)
    expect(r.savingsFrom).toBe(38)
    expect(r.itemCount).toBe(2)
    expect(r.dealIds).toEqual(['sweet-19'])
    expect(r.uncovered).toEqual([])
    const byId = new Map(DEALS.map((d) => [d.id, d]))
    for (const id of r.dealIds) {
      expect(byId.get(id)!.source).not.toBe('meal_gift')
    }
  })

  it('solve() defaults to min_price, matching config.json default_objective', () => {
    const withDefault = solve('regular', ['nuggets', 'soda'], DEALS)
    const explicit = solve('regular', ['nuggets', 'soda'], DEALS, 'min_price')
    expect(withDefault).toEqual(explicit)
  })
})

// ---------------------------------------------------------------------------
// 4) Coverage-shape sanity: 56 uncovered breakfast combos, 0 for regular.
// ---------------------------------------------------------------------------

describe('uncovered-combo counts', () => {
  it('breakfast has exactly 56 combos with non-empty uncovered; regular has none', async () => {
    const queries = allQueries()
    let n = 0
    for (const objective of OBJECTIVES) {
      let breakfastUncovered = 0
      let regularUncovered = 0
      for (const q of queries) {
        if (n++ % 1000 === 0) await yieldNow()
        const r = solve(q.slot, q.keys, DEALS, objective)
        if (r.uncovered.length > 0) {
          if (q.slot === 'breakfast') breakfastUncovered++
          else regularUncovered++
        }
      }
      expect(breakfastUncovered).toBe(56)
      expect(regularUncovered).toBe(0)
    }
  }, 60_000)
})

// ---------------------------------------------------------------------------
// Focused unit tests, ported from tests/test_solver.py.
// ---------------------------------------------------------------------------

let dealSeq = 0
function D(
  id: string,
  covers: string[],
  price = 10,
  savings = 10,
  opts: {
    items?: number
    meal?: boolean
    slot?: string
    hint?: boolean
    baseCoupon?: string
    source?: string
  } = {},
): SolverDeal {
  dealSeq++
  const source = opts.source ?? (opts.meal ? 'meal_gift' : 'bogo')
  return {
    id,
    source,
    timeSlot: opts.slot ?? 'all_day',
    covers,
    priceMin: price,
    savingsMin: savings,
    itemCount: opts.items ?? 2,
    baseCoupon: opts.baseCoupon ?? id,
    hintOnly: opts.hint ?? false,
  }
}

describe('solve() basics (ported from TestSolveBasics)', () => {
  it('a single deal covering both keys', () => {
    const r = solve('regular', ['soda', 'tea'], [D('a', ['soda', 'tea'], 50, 38)])
    expect(r.dealIds).toEqual(['a'])
    expect(r.savingsFrom).toBe(38)
    expect(r.uncovered).toEqual([])
  })

  it('two deals when no single deal covers both', () => {
    const deals = [D('a', ['soda'], 38, 38), D('b', ['tea'], 41, 41)]
    const r = solve('regular', ['soda', 'tea'], deals)
    expect([...r.dealIds].sort()).toEqual(['a', 'b'])
    expect(r.savingsFrom).toBe(79)
  })

  it('a deal covering more than asked is allowed', () => {
    const r = solve('regular', ['apple_pie', 'cone'], [
      D('a', ['apple_pie', 'soda'], 50, 28),
      D('b', ['cone'], 18, 18),
    ])
    expect([...r.dealIds].sort()).toEqual(['a', 'b'])
    expect(r.uncovered).toEqual([])
  })

  it('uncovered when no deal matches', () => {
    const r = solve('regular', ['soda', 'corn_soup'], [D('a', ['soda'], 38, 38)])
    expect(r.dealIds).toEqual(['a'])
    expect(r.uncovered).toEqual(['corn_soup'])
  })

  it('hint_only deals are excluded', () => {
    const r = solve('regular', ['soda', 'tea'], [D('h', ['soda', 'tea'], 300, 0, { hint: true })])
    expect(r.dealIds).toEqual([])
    expect([...r.uncovered].sort()).toEqual(['soda', 'tea'])
  })

  it('wrong-slot deals are excluded', () => {
    const r = solve('regular', ['hashbrown', 'soda'], [
      D('a', ['hashbrown', 'soda'], 37, 37, { slot: 'breakfast' }),
    ])
    expect(r.dealIds).toEqual([])
  })

  it('all_day deals are usable in both slots', () => {
    for (const slot of ['breakfast', 'regular']) {
      const r = solve(slot, ['soda', 'tea'], [D('a', ['soda', 'tea'], 38, 38, { slot: 'all_day' })])
      expect(r.dealIds).toEqual(['a'])
    }
  })

  it('an invalid objective throws', () => {
    expect(() => solve('regular', ['soda', 'tea'], [], 'cheapest' as Objective)).toThrow()
  })
})

describe('objective-specific ordering (ported from TestObjectives)', () => {
  const DEALS_2: SolverDeal[] = [
    D('one', ['soda', 'tea'], 90, 30),
    D('s', ['soda'], 38, 38),
    D('t', ['tea'], 41, 41),
  ]

  it('max_savings prefers two coupons over a smaller single one', () => {
    const r = solve('regular', ['soda', 'tea'], DEALS_2, 'max_savings')
    expect([...r.dealIds].sort()).toEqual(['s', 't'])
    expect(r.savingsFrom).toBe(79)
  })

  it('min_coupons prefers a single coupon', () => {
    const r = solve('regular', ['soda', 'tea'], DEALS_2, 'min_coupons')
    expect(r.dealIds).toEqual(['one'])
    expect(r.savingsFrom).toBe(30)
  })

  const MIN_PRICE_DEALS: SolverDeal[] = [
    D('bundle', ['soda', 'tea'], 48, 38),
    D('s2', ['soda'], 100, 90),
    D('t2', ['tea'], 100, 90),
  ]

  it('min_price prefers the cheapest full coverage over bigger savings', () => {
    const r = solve('regular', ['soda', 'tea'], MIN_PRICE_DEALS, 'min_price')
    expect(r.dealIds).toEqual(['bundle'])
    expect(r.priceFrom).toBe(48)
    expect(r.savingsFrom).toBe(38)
    expect(r.uncovered).toEqual([])
  })

  it('max_savings on the same data still prefers bigger savings (control)', () => {
    const r = solve('regular', ['soda', 'tea'], MIN_PRICE_DEALS, 'max_savings')
    expect([...r.dealIds].sort()).toEqual(['s2', 't2'])
    expect(r.savingsFrom).toBe(180)
  })

  it('min_price tie-break prefers fewer coupons', () => {
    const deals = [
      D('one_c', ['soda', 'tea'], 50, 40),
      D('s3', ['soda'], 25, 20),
      D('t3', ['tea'], 25, 20),
    ]
    const r = solve('regular', ['soda', 'tea'], deals, 'min_price')
    expect(r.dealIds).toEqual(['one_c'])
    expect(r.priceFrom).toBe(50)
    expect(r.savingsFrom).toBe(40)
  })
})

describe('_better() must stay objective-aware (ported from TestMinPriceBetterTrap)', () => {
  it('a cheaper partial DP state must survive for min_price even though it saves less', () => {
    const deals = [
      D('x1', ['soda'], 200, 100),
      D('x2', ['soda'], 100, 50),
      D('g3', ['tea'], 1, 1000),
    ]
    const r = solve('regular', ['soda', 'tea'], deals, 'min_price')
    expect(r.uncovered).toEqual([])
    expect([...r.dealIds].sort()).toEqual(['g3', 'x2'])
    expect(r.priceFrom).toBe(101)
    expect(r.savingsFrom).toBe(1050)
  })
})

describe('base_coupon exclusivity (ported from TestBaseCouponExclusivity)', () => {
  it('two variants of the same base coupon: pick the higher-savings one', () => {
    const deals = [
      D('v-apple', ['apple_pie'], 50, 10, { baseCoupon: 'X' }),
      D('v-soda', ['soda'], 50, 99, { baseCoupon: 'X' }),
    ]
    const r = solve('regular', ['apple_pie', 'soda'], deals)
    expect(r.dealIds).toEqual(['v-soda'])
    expect(r.savingsFrom).toBe(99)
    expect(r.uncovered).toEqual(['apple_pie'])
  })

  it('distinct base coupons allow both', () => {
    const deals = [
      D('v-apple', ['apple_pie'], 50, 10, { baseCoupon: 'X' }),
      D('v-soda', ['soda'], 50, 99, { baseCoupon: 'Y' }),
    ]
    const r = solve('regular', ['apple_pie', 'soda'], deals)
    expect([...r.dealIds].sort()).toEqual(['v-apple', 'v-soda'])
    expect(r.savingsFrom).toBe(109)
    expect(r.uncovered).toEqual([])
  })

  it('4 keys, only 3 base coupons: hits the limit', () => {
    const deals = [
      D('m-muffin', ['muffin'], 100, 50, { meal: true, baseCoupon: 'X' }),
      D('m-bagel', ['bagel'], 100, 50, { meal: true, baseCoupon: 'X' }),
      D('m-mcchicken', ['mcchicken'], 100, 50, { meal: true, baseCoupon: 'Y' }),
      D('m-pancake', ['pancake'], 100, 50, { meal: true, baseCoupon: 'Z' }),
    ]
    const keys = ['muffin', 'mcchicken', 'pancake', 'bagel']
    const r = solve('breakfast', keys, deals)
    expect(r.dealIds.length).toBe(3)
    expect(r.uncovered.length).toBe(1)
    expect(['muffin', 'bagel']).toContain(r.uncovered[0])
  })

  it('deal count never exceeds pressed-button count', () => {
    const keys = ['soda', 'tea']
    const deals = [
      D('a', ['soda'], 30, 30),
      D('b', ['tea'], 30, 30),
      D('c', ['soda'], 10, 5),
      D('d', ['tea'], 10, 5),
    ]
    const r = solve('regular', keys, deals, 'max_savings')
    expect(r.dealIds.length).toBeLessThanOrEqual(2)
    expect(r.savingsFrom).toBe(60)
    expect([...r.dealIds].sort()).toEqual(['a', 'b'])
  })

  it('star/sweetheart may repeat the same deal', () => {
    const deals = [D('rep', ['soda'], 50, 50, { source: 'star' })]
    const r = solve('regular', ['soda', 'tea'], deals, 'max_savings')
    expect(r.dealIds).toEqual(['rep', 'rep'])
    expect(r.savingsFrom).toBe(100)
    expect(r.priceFrom).toBe(100)
    expect(r.itemCount).toBe(4)
    expect(r.uncovered).toEqual(['tea'])
  })

  it('repeat is still bounded by pressed-button count', () => {
    const deals = [D('rep', ['soda'], 50, 50, { source: 'star' })]
    const r = solve('regular', ['soda'], deals, 'max_savings')
    expect(r.dealIds).toEqual(['rep'])
    expect(r.savingsFrom).toBe(50)
  })
})

describe('regression pins (ported from TestMustNotRegressMutations)', () => {
  it('ranks by savings_min, not a savings_max that is not tracked at all', () => {
    // solver.ts 沒有 savings_max 欄位（前端不需要，slim 匯出時就丟了），
    // 這裡改成釘住「排名只看 savingsMin」本身：兩張都覆蓋 soda、
    // n=1（只按一個鍵）逼著二選一，savingsMin 較高的必須贏。
    const deals = [D('high-min', ['soda'], 50, 50), D('low-min', ['soda'], 50, 20)]
    const r = solve('regular', ['soda'], deals, 'max_savings')
    expect(r.savingsFrom).toBe(50)
    expect(r.dealIds).toEqual(['high-min'])
  })

  it('item_count reflects the chosen deals item counts', () => {
    const deals = [
      D('a', ['soda'], 30, 30, { items: 3 }),
      D('b', ['tea'], 30, 30, { items: 5 }),
    ]
    const r = solve('regular', ['soda', 'tea'], deals)
    expect([...r.dealIds].sort()).toEqual(['a', 'b'])
    expect(r.itemCount).toBe(8)
  })

  it('deal_ids keeps repeated ids as a multiset (real data, breakfast 6-key combo)', () => {
    // 釘住 useMcdDeal.test.ts 同一組真實資料案例：s=287,n=18,p=428，
    // deal_ids 含兩次 star-11。
    const r = solve(
      'breakfast',
      ['apple_pie', 'bagel', 'cone', 'mcchicken', 'muffin', 'pancake'],
      DEALS,
      'max_savings',
    )
    expect(r.savingsFrom).toBe(287)
    expect(r.itemCount).toBe(18)
    expect(r.priceFrom).toBe(428)
    expect(r.dealIds).toHaveLength(6)
    expect(r.dealIds.filter((id) => id === 'star-11')).toHaveLength(2)
  })
})

describe('performance', () => {
  it('a realistic 6-key query resolves in well under 50ms', () => {
    const keys = ['beef_burger', 'chicken_burger', 'filet', 'fries', 'mccrispy', 'soda']
    // 先跑一次熱身（JIT），再量測，跟題目「~3ms/query」的量測方式一致。
    solve('regular', keys, DEALS, 'min_price')
    const iterations = 200
    const t0 = performance.now()
    for (let i = 0; i < iterations; i++) {
      solve('regular', keys, DEALS, 'min_price')
    }
    const elapsedMs = performance.now() - t0
    const perQueryMs = elapsedMs / iterations
    // eslint-disable-next-line no-console
    console.log(`[perf] 6-key query: ${perQueryMs.toFixed(3)} ms/query (avg over ${iterations})`)
    expect(perQueryMs).toBeLessThan(50)
  })
})
