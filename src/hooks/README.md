# useMcdDeal：麥當勞優惠計算機 hook

使用者在鍵盤上按 2～6 個商品按鍵，這個 hook 就會算出「用哪幾張券最划算」：一共省多少、實付多少、拿到幾樣，每張券的明細，以及哪些按鍵沒有券可用。

計算在瀏覽器裡即時完成，一次查詢只要幾毫秒，不需要後端。

- 資料來源：`麥當勞APP週年慶精打計算機優惠總整理_0922.xlsx`，鍵盤排法依客戶 2026-10-13 的版本
- 唯一的外部依賴是 React（`useState` / `useMemo` / `useCallback`），沒有其他套件

---

## 目錄

1. [安裝：要複製哪些檔案](#1-安裝要複製哪些檔案)
2. [最小可用範例](#2-最小可用範例)（含不用 hook 的 `solveMcdDeal`）
3. [鍵盤：每個按鍵要傳什麼](#3-鍵盤每個按鍵要傳什麼)
4. [hook 的輸入：`useMcdDeal(options)`](#4-hook-的輸入usemcddealoptions)
5. [hook 的輸出：`UseMcdDeal`](#5-hook-的輸出usemcddeal)
6. [結果：`McdResult`](#6-結果mcdresult)
7. [券：`McdDeal`](#7-券mcddeal)
8. [券的明細：`McdBreakdown`](#8-券的明細mcdbreakdown)
9. [完整輸出範例（真實資料）](#9-完整輸出範例真實資料)
10. [計算規則](#10-計算規則)
11. [三種排序 `objective`](#11-三種排序-objective)
12. [常見陷阱](#12-常見陷阱)
13. [更新資料](#13-更新資料)

---

## 1. 安裝：要複製哪些檔案

把這個資料夾（`hooks/`）整個複製到你的專案。

| 檔案 | 必要 | 說明 |
|---|---|---|
| `index.ts` | ✅ | 對外出口，只從這裡 import |
| `useMcdDeal.ts` | ✅ | hook 本體 |
| `solver.ts` | ✅ | 求解器（找出最佳的券組合） |
| `types.ts` | ✅ | 所有型別 |
| `data.json` | ✅ | 按鍵、券、鍵盤順序（建置產物，約 300 KB，gzip 後約 16 KB） |
| `solver.test.ts`、`useMcdDeal.test.ts` | ❌ | 測試，不用帶。`solver.test.ts` 會讀原專案的 `lookup/`，複製過去跑不了 |

TypeScript 要開 `resolveJsonModule`（hook 會直接 `import raw from './data.json'`）：

```jsonc
// tsconfig.json
{ "compilerOptions": { "resolveJsonModule": true } }
```

React 18 以上都可以用（原專案用的是 19）。

---

## 2. 最小可用範例

```tsx
import { useState } from 'react'
import { useMcdDeal } from './hooks'

export default function Calculator() {
  const d = useMcdDeal({ timeSlot: 'breakfast', objective: 'max_savings' })
  const [submitted, setSubmitted] = useState(false)

  return (
    <div>
      {/* 商品鍵：照 d.buttons 的順序排，就是客戶指定的鍵盤順序 */}
      {d.buttons.map(b => (
        <button
          key={b.id}
          aria-pressed={d.selected.includes(b.id)}
          onClick={() => { d.toggle(b.id); setSubmitted(false) }}
        >
          {b.label} ${b.priceMin}{b.priceMax !== b.priceMin && `~${b.priceMax}`}
        </button>
      ))}

      {/* 切換時段 */}
      <button onClick={() => {
        d.setTimeSlot(d.timeSlot === 'breakfast' ? 'regular' : 'breakfast')
        setSubmitted(false)
      }}>
        切換時段（目前{d.timeSlot === 'breakfast' ? '早餐' : '午晚餐'}）
      </button>

      {/* Enter：選 2～6 個才能按 */}
      <button disabled={!d.canSubmit} onClick={() => setSubmitted(true)}>Enter</button>

      {submitted && d.result && (
        <div>
          <p>省 ${d.result.savingsFrom} 起，付 ${d.result.priceFrom} 起，至少拿 {d.result.itemCount} 樣</p>
          <ul>
            {d.result.deals.map((deal, i) => (   // 用 index 當 key，見「常見陷阱」
              <li key={i}>{deal.title}：省 ${deal.savingsMin}</li>
            ))}
          </ul>
          {d.result.uncovered.length > 0 && (
            <p>沒有券可用，要原價單點：{d.result.uncovered.map(b => b.label).join('、')}</p>
          )}
        </div>
      )}
    </div>
  )
}
```

> `result` 只要選取的按鍵一變就會重新計算，「按 Enter 才顯示」是畫面自己的事。上面的例子用 `submitted` 控制顯示，所以每次改選取都要把它重設成 `false`，不然畫面會直接顯示新的結果。

### 2.1 不用 hook：`solveMcdDeal(timeSlot, ids, objective?)`

如果鍵盤狀態由你自己的程式管理（例如按 Enter 時把整組按鍵存進 context，再到結果頁一次算），用這個純函式比較直接，不用一個一個 `toggle`：

```ts
import { solveMcdDeal } from './hooks'

const result = solveMcdDeal('regular', ['beef_burger', 'fries', 'soda'], 'max_savings')
// result 的型別就是 McdResult | null，跟 hook 的 d.result 完全一樣
```

| 參數 | 型別 | 說明 |
|---|---|---|
| `timeSlot` | `'breakfast' \| 'regular'` | 時段。如果你的鍵盤用 `'allDay'` 表示午晚餐，要自己轉成 `'regular'` |
| `ids` | `string[]` | 按鍵 id（見 §3），順序不影響結果 |
| `objective` | `Objective`（可省略） | 排序，預設跟 hook 一樣讀 `data.json` 的 `defaultObjective` |

它跟 hook 的規則完全一樣（hook 內部就是呼叫它），差別在對輸入的處理：

| 情況 | `solveMcdDeal` | hook 的 `toggle` |
|---|---|---|
| 不同的 id 不到 2 個或超過 6 個 | 回傳 `null` | 第 7 個按不進去；不到 2 個時 `result` 是 `null` |
| 同一個 id 傳兩次 | 只算一次 | 第二次是取消 |
| id 不在這個時段的鍵盤上（打錯字、早餐傳 `'fries'`） | **直接 throw**，錯誤訊息會列出是哪些 id | 默默忽略 |

會直接 throw 是故意的：一次傳一整組時，默默少算一個按鍵會讓結果看起來正常但其實是錯的，比報錯更難查。

---

## 3. 鍵盤：每個按鍵要傳什麼

### 3.1 商品鍵 → `toggle(id)`

呼叫 `toggle(id)` 時要傳下面表格裡的 **`id`**（英文），不是中文的 `label`。

`d.buttons` 回傳的順序就是下表的順序，對應客戶的鍵盤圖（逐列由左到右）。價格是該按鍵底下最便宜到最貴的**單點價**，鍵盤上可以拿來顯示「$50~105」。

#### 早餐時段 `timeSlot: 'breakfast'`（14 個）

| 鍵盤位置 | `id` | `label` | `priceMin` | `priceMax` |
|---|---|---|---|---|
| 第 1 列 | `muffin` | 滿福堡系列 | 50 | 105 |
| | `pancake` | 鬆餅系列 | 57 | 111 |
| | `bagel` | 焙果系列 | 57 | 91 |
| | `egg_burger` | 蛋堡系列 | 34 | 64 |
| 第 2 列 | `nuggets` | 麥克鷄塊 | 48 | 109 |
| | `mcchicken` | 麥香鷄 | 48 | 48 |
| | `filet` | 麥香魚 | 52 | 92 |
| | `hashbrown` | 薯餅 | 37 | 37 |
| 第 3 列 | `soda` | 汽水 | 33 | 38 |
| | `mccafe` | McCafe | 50 | 87 |
| | `tea` | 茶飲 | 33 | 68 |
| | `corn_soup` | 玉米湯 | 48 | 58 |
| 第 4 列 | （切換時段） | | | |
| | `cone` | 蛋捲冰淇淋 | 18 | 32 |
| | `mcflurry` | 冰炫風 | 59 | 65 |
| | （Enter） | | | |

#### 午晚餐時段 `timeSlot: 'regular'`（14 個）

| 鍵盤位置 | `id` | `label` | `priceMin` | `priceMax` |
|---|---|---|---|---|
| 第 1 列 | `beef_burger` | 牛肉類漢堡 | 36 | 132 |
| | `chicken_burger` | 鷄肉類漢堡 | 48 | 129 |
| | `filet` | 麥香魚 | 52 | 92 |
| | `mccrispy` | 麥脆鷄腿 | 68 | 126 |
| 第 2 列 | `nuggets` | 麥克鷄塊 | 48 | 109 |
| | `spicy_wings` | 勁辣香鷄翅 | 49 | 49 |
| | `fries` | 薯條 | 40 | 66 |
| | `apple_pie` | 蘋果派 | 40 | 40 |
| 第 3 列 | `soda` | 汽水 | 33 | 38 |
| | `mccafe` | McCafe | 50 | 87 |
| | `tea` | 茶飲 | 33 | 68 |
| | `corn_soup` | 玉米湯 | 48 | 58 |
| 第 4 列 | （切換時段） | | | |
| | `cone` | 蛋捲冰淇淋 | 18 | 32 |
| | `mcflurry` | 冰炫風 | 59 | 65 |
| | （Enter） | | | |

兩個時段共用 8 個按鍵：`filet`、`nuggets`、`soda`、`mccafe`、`tea`、`corn_soup`、`cone`、`mcflurry`。同一個按鍵在兩個時段的價格範圍可能不一樣，要以 `d.buttons` 回傳的為準，不要寫死。

> 建議不要把上面的表格寫死在程式裡，直接拿 `d.buttons` 來排鍵盤。這樣客戶改鍵盤或價格時，換掉 `data.json` 就好。

### 3.1.1 按鍵分類 `categories`

每個按鍵有一到兩個分類，按鍵底下的每個品項都沿用同一組分類（設定在 `v2/config.json` 的 `button_categories`，依客戶 2026-10-24 的分類圖）。客戶畫面上的用語：

| `categories` 的值 | 客戶用語 |
|---|---|
| `肉類` | 肌不可失 |
| `炸物` | 快樂多巴胺 |
| `湯／甜點／飲料` | 好療癒 |
| `咖啡／茶` | 獨自清醒 |

| 按鍵 | `categories` |
|---|---|
| 滿福堡系列、蛋堡系列、麥香鷄、麥香魚、牛肉類漢堡、鷄肉類漢堡 | `['肉類']` |
| 麥克鷄塊、麥脆鷄腿、勁辣香鷄翅 | `['炸物', '肉類']` |
| 薯餅、薯條 | `['炸物']` |
| 鬆餅系列、焙果系列、汽水、玉米湯、蛋捲冰淇淋、冰炫風、蘋果派 | `['湯／甜點／飲料']` |
| McCafe、茶飲 | `['湯／甜點／飲料', '咖啡／茶']` |

`d.buttons` 的每個按鍵、`deal.products` 的每份商品都有 `categories` 陣列，順序照客戶圖上由上而下。只有沒有按鍵的四季沙拉是 `['none']`。

統計分類數量時要注意：一份麥克鷄塊會同時算進「炸物」和「肉類」，所以各分類加總會大於品項數。

### 3.2 功能鍵

| 鍵盤上的按鍵 | 要呼叫 | 說明 |
|---|---|---|
| **切換時段** | `setTimeSlot('breakfast' \| 'regular')` | hook 只提供「設成某個時段」，要切換請自己判斷：`d.setTimeSlot(d.timeSlot === 'breakfast' ? 'regular' : 'breakfast')`。**切換時會清空所有已選的按鍵。** |
| **Enter** | 不用呼叫任何東西 | 用 `d.canSubmit` 控制能不能按，按下後顯示 `d.result`。 |
| **刪除**（清空） | `clear()` | 一次清掉全部選取。目前網站上沒放這個鍵（客戶 10/13 的版本拿掉了），但 hook 仍然提供。 |
| **取消單一按鍵** | `toggle(id)` | 對已選的按鍵再呼叫一次 `toggle` 就會取消。 |

### 3.3 `toggle(id)` 的行為

| 情況 | 結果 |
|---|---|
| `id` 還沒選、目前時段有這個鍵、而且還沒滿 6 個 | 加到 `selected` 最後面 |
| `id` 已經選了 | 從 `selected` 移除（**同一個鍵不能選兩次**，按第二次就是取消） |
| `id` 不屬於目前時段（例如早餐時傳 `'fries'`） | 什麼都不做，也不會報錯 |
| 已經選滿 6 個，再傳一個新的 | 什麼都不做，也不會報錯 |
| 傳了不存在的 `id`（例如打錯字） | 什麼都不做，也不會報錯 |

因為不合法的輸入都會被默默忽略，按下按鍵沒反應時，先檢查 `id` 有沒有拼錯、時段對不對。

---

## 4. hook 的輸入：`useMcdDeal(options)`

```ts
const d = useMcdDeal(options?: UseMcdDealOptions)

interface UseMcdDealOptions {
  timeSlot?: TimeSlot      // 初始時段，預設 'breakfast'
  objective?: Objective    // 初始排序，預設讀 data.json 的 defaultObjective（目前是 'min_price'）
}

type TimeSlot  = 'breakfast' | 'regular'                    // 早餐 | 午晚餐
type Objective = 'min_price' | 'max_savings' | 'min_coupons' // 花費最少 | 省最多 | 券數最少
```

- `options` 只在第一次 render 時讀取，之後再傳新的值不會有作用。之後要改，請用 `setTimeSlot` / `setObjective`。
- 目前的網站固定用 `{ timeSlot: 'breakfast', objective: 'max_savings' }`（客戶 10/13 要求只留「省最多」）。
- hook 不會依目前時間自動判斷早餐或午晚餐，要自動切的話，自己算好再傳 `timeSlot`。

---

## 5. hook 的輸出：`UseMcdDeal`

```ts
interface UseMcdDeal {
  // ── 時段 ──
  timeSlot: TimeSlot                       // 目前時段
  setTimeSlot: (s: TimeSlot) => void       // 換時段，會清空 selected

  // ── 排序 ──
  objective: Objective                     // 目前排序
  setObjective: (o: Objective) => void     // 換排序，不會清空 selected，result 會立刻重算

  // ── 鍵盤 ──
  buttons: McdButton[]                     // 目前時段的 14 個商品鍵，已照鍵盤順序排好
  selected: string[]                       // 已選的按鍵 id，依按下的先後順序
  toggle: (id: string) => void             // 選 / 取消一個按鍵
  clear: () => void                        // 清空全部選取

  // ── 送出 ──
  canSubmit: boolean                       // selected 有 2～6 個時為 true
  result: McdResult | null                 // canSubmit 為 false 時是 null

  // ── 常數 ──
  minKeys: 2                               // 最少要選幾個
  maxKeys: 6                               // 最多能選幾個
  mealSavingsBasis: 'set_meal' | 'a_la_carte'  // 「買套餐送X」的省額怎麼算，見 §10.2
}

interface McdButton {
  id: string        // 'muffin'，傳給 toggle 用的
  label: string     // '滿福堡系列'，畫面顯示用
  categories: McdCategory[]  // 例如 ['炸物', '肉類']，見 §3.1.1
  priceMin: number  // 這個按鍵底下最便宜的單點價（目前時段）
  priceMax: number  // 這個按鍵底下最貴的單點價（目前時段）
}
```

`buttons` 只會在換時段時更新，`result` 會在 `selected`、`timeSlot`、`objective` 任一個改變時重算。兩者都有 memo，可以直接當 props 往下傳。

---

## 6. 結果：`McdResult`

```ts
interface McdResult {
  savingsFrom: number    // 一共省多少（各張券的 savingsMin 加總）
  priceFrom: number      // 一共付多少（各張券的 priceMin 加總）
  itemCount: number      // 一共拿到幾樣商品（各張券的 itemCount 加總）
  deals: McdDeal[]       // 用到的券（可能重複，見下方說明）
  uncovered: McdButton[] // 按了但沒有券可用的按鍵，要原價單點
  hints: McdDeal[]       // 額外提示（滿額送），不參與計算
}
```

| 欄位 | 說明 |
|---|---|
| `savingsFrom` | 畫面上的「省 $X 起」。等於 `deals.reduce((s, d) => s + d.savingsMin, 0)`。之所以是「起」，是因為一個按鍵代表一整類商品，每張券都取最保守的算法，見 §10.3。 |
| `priceFrom` | 「付 $X 起」。等於 `deals.reduce((s, d) => s + d.priceMin, 0)`，也就是每張券都點最便宜的品項。**不包含** `uncovered` 那些要原價單點的按鍵。 |
| `itemCount` | 「至少拿到 X 樣」。等於 `deals.reduce((s, d) => s + d.itemCount, 0)`，會比按下的按鍵數多（例如套餐券一張就有 3～5 樣）。 |
| `deals` | 用到的券。**同一張券可能出現兩次以上**（星級點、甜心卡可以重複用），要逐筆顯示，不要去重。順序沒有特別意義。 |
| `uncovered` | 沒有任何券可用的按鍵。空陣列就代表每個按鍵都有券可用。 |
| `hints` | 目前時段可以參考的「滿額送」券（例如「滿$300送6塊鷄塊」）。**不管選了什麼都會出現**，跟這次的計算無關，只是提示。 |

### 6.1 按下的按鍵和 `deals[].covers` 的關係

- 每個按下的按鍵一定會出現在某張券的 `covers`，或者出現在 `uncovered`。
- 一張券的 `covers` 可以**包含使用者沒按的按鍵**。例如「買汽水送McCafe」會蓋到 `soda` 和 `mccafe`，就算使用者沒按 McCafe，系統也可能選這張券，因為它的 McCafe 是送的。

---

## 7. 券：`McdDeal`

```ts
interface McdDeal {
  id: string             // 'meal-274'、'sweet-09'…，同一份 data.json 裡不會變，但重新建置後可能改編號，不要寫死
  title: string          // '買超值全餐送中薯（A經典配餐＋汽水）'
  source: 'star' | 'sweetheart' | 'bogo' | 'meal_gift' | 'spend'
  covers: string[]       // 這張券會用到哪些按鍵 id
  priceMin: number       // 這張券點最便宜的品項時要付多少
  priceMax: number       // 這張券點最貴的品項時要付多少
  savingsMin: number     // 這張券最少省多少（保守值）
  itemCount: number      // 這張券拿到幾樣商品
  breakdown: McdBreakdown | null   // savingsMin 的明細；只有 source = 'spend' 時是 null
  products: McdDealProduct[]       // 這張券拿到的每一份商品，見 §7.3
}
```

### 7.1 `source`：券的種類

| `source` | 名稱 | 原價怎麼算 | 實付 | 省多少 | 同一張能重複用嗎 |
|---|---|---|---|---|---|
| `star` | 1+1 星級點 | 紅區單點＋白區單點 | combo 價 | 原價 − combo 價 | ✅ 可以 |
| `sweetheart` | 數位甜心卡 | A 區＋B 區 | A 區原價 | B 區（送的那樣）的原價 | ✅ 可以 |
| `bogo` | 買一送一 | 兩份 | 一份 | 一份的價格 | ❌ 不行 |
| `meal_gift` | 買套餐送X | 套餐價＋贈品（`set_meal`） | 套餐價（含飲料加價） | 贈品的原價 | ❌ 同一種券只能用一張 |
| `spend` | 滿額送 | — | — | 0，只會出現在 `hints` | — |

- **星級點只能用在午晚餐**。早餐的結果不會出現 `star`。
- **`meal_gift` 是同一種券的不同點法**：例如「買超值全餐送中薯」展開成 100 種點法（主餐 × 配餐 × 飲料），但一次結果裡同一種只能用一張。

### 7.2 `priceMin` / `priceMax`

一個按鍵代表一整類商品（例如「牛肉類漢堡」有 13 種），所以同一張券點不同品項，要付的錢不一樣。`priceMin` / `priceMax` 就是這個範圍，畫面上可以顯示成「這張券實付 $142~202」。

---

### 7.3 `products`：這張券拿到的每一份商品

```ts
interface McdDealProduct {
  role: string           // 這份商品在券裡的角色
  name: string           // 實際品項名稱，例如 '雙層牛肉吉事堡'、'薯條(中)'
  button: string | null  // 屬於哪個按鍵 id（見 §3），畫面可以拿它去查圖示 / className
  categories: McdCategory[]  // 所屬按鍵的分類（見 §3.1.1）；沒有按鍵的四季沙拉是 ['none']
}
```

**一份商品一筆**，所以 `products.length === itemCount`。例如：

| 券 | `products` |
|---|---|
| 買超值全餐送中薯（A經典配餐＋汽水），主餐牛肉類漢堡 | 主餐 `beef_burger`、配餐 `fries`、飲料 `soda`、贈品 `fries` |
| 單點勁辣香鷄翅(一份兩塊)買一送一 | 買 `spicy_wings`、送 `spicy_wings` |
| 買汽水送McCafe | A區 `soda`、B區（送） `mccafe` |

| `source` | `role` 依序是 |
|---|---|
| `star` | `紅區`、`白區` |
| `sweetheart` | `A區`、`B區（送）` |
| `bogo` | `買`、`送` |
| `meal_gift` | `主餐`、`配餐`（0～2 個）、`飲料`（早餐 C美式咖啡配餐沒有）、`贈品` |

跟 `breakdown` 的差別：`breakdown` 是算省額用的明細，`set_meal` 底下套餐會併成一行「套餐」；`products` 則是一份一份拆開，而且每份都標出屬於哪個按鍵。

注意：

- 同一個按鍵可能出現好幾次（例如 A經典配餐的中薯加上送的中薯，就是兩筆 `fries`）。
- `products` 裡所有非 null 的 `button`，剛好就是 `covers`。
- **`button` 只有一種情況是 `null`**：午晚餐「B清爽配餐」的四季沙拉，因為沙拉按鍵已經移除了。
- `name` 跟 `breakdown` 取同一組點法（`set_meal` 是最便宜的那組），所以主餐、飲料的名稱跟明細對得上。

## 8. 券的明細：`McdBreakdown`

```ts
interface McdBreakdown {
  items: McdBreakdownItem[]  // 一組實際的品項，以及各自的原價
  paid: number               // 這組品項要付多少
}

interface McdBreakdownItem {
  role: string   // 這個品項在券裡扮演什麼角色，見下表
  name: string   // 實際品項名稱，例如 '雙層牛肉吉事堡 A經典配餐＋可口可樂(中)'
  price: number  // 原價
}
```

**這個公式一定成立**（資料建置時就檢查過）：

```ts
deal.breakdown.items.reduce((s, i) => s + i.price, 0) - deal.breakdown.paid === deal.savingsMin
```

所以畫面上可以直接寫「原價 $192 − 實付 $142 ＝ 省 $50」。

### 8.1 `role` 的值

| `source` | `role` 依序是 |
|---|---|
| `star` | `紅區`、`白區` |
| `sweetheart` | `A區`、`B區（送）` |
| `bogo` | `買`、`送` |
| `meal_gift`（`set_meal`，目前） | `套餐`、`贈品` |
| `meal_gift`（`a_la_carte`，舊算法） | `主餐`、`配餐`（0～2 個）、`飲料`（早餐 C 美式咖啡配餐沒有）、`贈品` |

### 8.2 明細列的是哪一組品項？

| `source` | 明細列的是 |
|---|---|
| `meal_gift`（`set_meal`） | **最便宜的點法**，所以 `breakdown.paid === priceMin`。每種點法省的錢都一樣（都是贈品價），列最便宜的才會跟「付 $X 起」對得上。 |
| `star` | **省最少的那組**，`paid` 可能比 `priceMin` 貴。 |
| `sweetheart` | A 區取最便宜的品項，B 區取省最少的品項。 |
| `bogo` | 只有一種點法。 |

所以把所有 `deals` 的 `breakdown.paid` 加起來，**不一定**等於 `result.priceFrom`（有星級點的時候可能比較貴）。要顯示「付多少」的話，用 `priceFrom`。

---

## 9. 完整輸出範例（真實資料）

下面兩個例子是用目前的 `data.json` 和 `solver.ts` 實際跑出來的，不是手寫的。

### 9.1 午晚餐：牛肉類漢堡＋薯條＋汽水，排序「省最多」

```ts
const d = useMcdDeal({ timeSlot: 'regular', objective: 'max_savings' })
d.toggle('beef_burger'); d.toggle('fries'); d.toggle('soda')
d.result
```

```json
{
  "savingsFrom": 150,
  "itemCount": 8,
  "priceFrom": 218,
  "deals": [
    {
      "id": "meal-274",
      "title": "買超值全餐送中薯（A經典配餐＋汽水）",
      "source": "meal_gift",
      "covers": ["beef_burger", "fries", "soda"],
      "priceMin": 142,
      "priceMax": 202,
      "savingsMin": 50,
      "itemCount": 4,
      "breakdown": {
        "items": [
          { "role": "套餐", "name": "雙層牛肉吉事堡 A經典配餐＋可口可樂(中)", "price": 142 },
          { "role": "贈品", "name": "薯條(中)", "price": 50 }
        ],
        "paid": 142
      }
    },
    {
      "id": "sweet-09",
      "title": "買汽水送McCafe",
      "source": "sweetheart",
      "covers": ["soda", "mccafe"],
      "priceMin": 38,
      "priceMax": 38,
      "savingsMin": 50,
      "itemCount": 2,
      "breakdown": {
        "items": [
          { "role": "A區", "name": "可口可樂(中)", "price": 38 },
          { "role": "B區（送）", "name": "冰經典美式咖啡", "price": 50 }
        ],
        "paid": 38
      }
    },
    {
      "id": "sweet-09",
      "title": "買汽水送McCafe",
      "source": "sweetheart",
      "covers": ["soda", "mccafe"],
      "priceMin": 38,
      "priceMax": 38,
      "savingsMin": 50,
      "itemCount": 2,
      "breakdown": {
        "items": [
          { "role": "A區", "name": "可口可樂(中)", "price": 38 },
          { "role": "B區（送）", "name": "冰經典美式咖啡", "price": 50 }
        ],
        "paid": 38
      }
    }
  ],
  "uncovered": [],
  "hints": [
    { "id": "spend-01", "title": "滿$300送6塊鷄塊(歡樂送限定)", "source": "spend", "covers": [],
      "priceMin": 300, "priceMax": 300, "savingsMin": 0, "itemCount": 1, "breakdown": null },
    { "id": "spend-02", "title": "滿$150送4塊鷄塊(手機點餐限定)", "source": "spend", "covers": [],
      "priceMin": 150, "priceMax": 150, "savingsMin": 0, "itemCount": 1, "breakdown": null }
  ]
}
```

從這個例子可以看到：

- `sweet-09` 出現**兩次**（甜心卡可以重複用），`savingsFrom` 150 ＝ 50 ＋ 50 ＋ 50。
- 使用者沒按 McCafe，但結果裡有 McCafe，因為「買汽水送McCafe」送的就是它。
- 「省最多」會為了衝省額多疊券：這裡用了 3 張券、付 218 元，拿到 8 樣。

### 9.2 早餐：滿福堡＋麥香鷄＋鬆餅＋焙果，排序「省最多」（有按鍵沒券可用）

```json
{
  "savingsFrom": 133,
  "itemCount": 9,
  "priceFrom": 230,
  "deals": [
    {
      "id": "meal-064",
      "title": "買早餐套餐送薯餅（D指定飲料配餐＋汽水）",
      "source": "meal_gift",
      "covers": ["bagel", "hashbrown", "soda"],
      "priceMin": 82, "priceMax": 116, "savingsMin": 37, "itemCount": 3,
      "breakdown": {
        "items": [
          { "role": "套餐", "name": "現烤焙果 D指定飲料配餐＋可口可樂(中)", "price": 82 },
          { "role": "贈品", "name": "薯餅", "price": 37 }
        ],
        "paid": 82
      }
    },
    {
      "id": "meal-167",
      "title": "買早餐套餐送4塊麥克鷄塊（D指定飲料配餐＋汽水）",
      "source": "meal_gift",
      "covers": ["mcchicken", "nuggets", "soda"],
      "priceMin": 73, "priceMax": 73, "savingsMin": 48, "itemCount": 3,
      "breakdown": {
        "items": [
          { "role": "套餐", "name": "麥香鷄 D指定飲料配餐＋可口可樂(中)", "price": 73 },
          { "role": "贈品", "name": "麥克鷄塊(4塊)", "price": 48 }
        ],
        "paid": 73
      }
    },
    {
      "id": "meal-262",
      "title": "買早餐套餐送小玉米湯（D指定飲料配餐＋汽水）",
      "source": "meal_gift",
      "covers": ["corn_soup", "muffin", "soda"],
      "priceMin": 75, "priceMax": 130, "savingsMin": 48, "itemCount": 3,
      "breakdown": {
        "items": [
          { "role": "套餐", "name": "豬肉滿福堡 D指定飲料配餐＋可口可樂(中)", "price": 75 },
          { "role": "贈品", "name": "玉米湯(小)", "price": 48 }
        ],
        "paid": 75
      }
    }
  ],
  "uncovered": [
    { "id": "pancake", "label": "鬆餅系列", "priceMin": 57, "priceMax": 111 }
  ],
  "hints": [
    { "id": "spend-01", "title": "滿$300送6塊鷄塊(歡樂送限定)", "source": "spend", "covers": [],
      "priceMin": 300, "priceMax": 300, "savingsMin": 0, "itemCount": 1, "breakdown": null }
  ]
}
```

為什麼鬆餅沒有券可用？這四個早餐主餐都只能靠「買早餐套餐送X」，而這種券只有 3 種（送薯餅／送4塊鷄塊／送小玉米湯），每種只能用一張、每張只搭一個主餐，所以四個主餐裡一定有一個用不到券（見 §10.4）。

另外，早餐的 `hints` 只有 `spend-01`，因為 `spend-02` 只限午晚餐。

---

## 10. 計算規則

### 10.1 疊券規則（客戶裁示）

1. **鋪底券（`bogo`、`meal_gift`）同一張不能用兩次**，不同張可以一起用。`meal_gift` 是看券的種類，例如「買超值全餐送中薯」不管配什麼，一次只能用一張。
2. **星級點（`star`）、甜心卡（`sweetheart`）同一張可以重複用。**
3. **用券的總張數不超過按下的按鍵數**（包含重複使用的）。
4. **星級點只能用在午晚餐。**

### 10.2 「買套餐送X」的省額：`mealSavingsBasis`

| 值 | 原價 | 省多少 | 狀態 |
|---|---|---|---|
| `set_meal` | 套餐價（含配餐飲料加價）＋贈品 | 贈品的原價 | **目前使用**（客戶 2026-10-16 要求） |
| `a_la_carte` | 主餐單點＋配餐內容單點＋飲料原價＋贈品 | 原價 − 套餐價 − 飲料加價 | 舊算法，保留成開關 |

舉例：大麥克 A經典配餐＋汽水，送中薯

- `set_meal`：原價 148＋50，實付 148，**省 50**
- `a_la_carte`：原價 78＋50＋38＋50，實付 148，**省 68**

這個值是建置資料時決定的（`v2/config.json` 的 `meal_savings.basis`），hook 只是把它回傳出來，讓畫面可以顯示對應的說明文字，**hook 這邊沒辦法切換**。

### 10.3 為什麼是「省 X 起」

一個按鍵代表一整類商品，同一張券點不同品項，省的錢可能不一樣。所以每張券的 `savingsMin` 都取**整個按鍵裡最保守（省最少）**的那一組，加總起來就是「省 X 起」：照著點，至少會省這麼多。

`set_meal` 底下套餐券省的錢固定（就是贈品價），所以只有星級點會因為點的品項不同而省得不一樣。

### 10.4 早餐哪些組合一定有按鍵沒券可用

早餐的 `muffin`、`pancake`、`bagel`、`egg_burger`、`mcchicken`、`filet` 這 6 個主餐，**只能靠「買早餐套餐送X」**，而這種券只有 3 種。所以同時選 **4 個以上** 這些主餐，就一定有按鍵會出現在 `uncovered`。

除此之外，早餐任選 2～6 個都能每個按鍵都有券可用；午晚餐任何組合也都可以。

---

## 11. 三種排序 `objective`

三種排序**都會先挑「能讓最多按下的按鍵用到券」的組合**，接著才依下表決定：

| `objective` | 畫面名稱 | 比較順序 | 適合的情境 |
|---|---|---|---|
| `min_price` | 花費最少 | 實付 ↑ → 省額 ↓ → 券數 ↑ | 「我要點這些，怎麼點最便宜」 |
| `max_savings` | 省最多 | 省額 ↓ → 券數 ↑ → 實付 ↑ | 數字好看，但可能為了省更多而多疊券、多付錢 |
| `min_coupons` | 券數最少 | 券數 ↑ → 省額 ↓ → 實付 ↑ | 不想一次用很多張券 |

（↑ 越小越好，↓ 越大越好）

同分的情況下，結果是固定的：同樣的輸入每次都會得到同樣的答案，跟按下按鍵的先後順序無關。

---

## 12. 常見陷阱

1. **`deals` 不要去重，也不要拿 `deal.id` 當 React key。** 同一張券可能出現兩次以上，去重之後畫面上的省額加總會跟 `savingsFrom` 對不上，用 id 當 key 也會撞。請用陣列 index：`deals.map((d, i) => <li key={i}>…)`。
2. **`toggle` 傳的是 `id`（`'muffin'`），不是 `label`（`'滿福堡系列'`）。** 傳錯不會報錯，只會沒反應（`solveMcdDeal` 則會直接 throw）。
3. **切換時段會清空選取**。如果畫面有「已送出」的狀態，記得一起重設。
4. **`result` 在選取改變時會立刻重算**，「按 Enter 才顯示」要自己控制（見 §2）。
5. **`priceFrom` 不包含 `uncovered` 的按鍵**。如果要顯示「總共要付多少」，記得提醒使用者那些按鍵要另外原價買。
6. **`breakdown.paid` 的加總不一定等於 `priceFrom`**（見 §8.2）。
7. **券的 `id` 在重新建置資料後可能改變**（例如加了新按鍵，套餐券會重新編號），不要寫死。
8. **同一個按鍵不能代表「兩份」**。按第二次是取消，不是加點一份。
9. **hook 沒有驗證優惠期間**。`data.json` 裡有 `validFrom` / `validTo`（目前是 2026-09-01 ～ 2026-09-30），但 hook 不會檢查，也沒有回傳。

---

## 13. 更新資料

`data.json` 是建置產物，**不要手改**。客戶的 workbook 或規則有變的時候，在原專案的 `v2/` 底下依序執行：

```bash
python3 scripts/build_buttons.py     # 按鍵與品項價格 → data/buttons.json
python3 scripts/build_deals.py       # 所有券 → data/deals.json
python3 scripts/build_lookup.py      # 測試用的標準答案（約 150 秒），不會進 data.json
python3 scripts/export_package.py    # 產生 web/src/hooks/data.json
```

接著跑測試確認：

```bash
python3 -m unittest discover -s tests
cd web && npx vitest run
```

設定都在 `v2/config.json`：

| 設定 | 用途 |
|---|---|
| `white_zone_prices` | 1+1 星級點白區小杯飲料的單點價（workbook 沒有，客戶 10/24 已全部確認） |
| `external_prices` | 麥脆鷄腿(1塊) 的單點價（workbook 沒有，客戶 10/24 已確認 68） |
| `product_name_aliases` | workbook 不同分頁對同一商品的寫法 → 客戶確認的標準名稱（例如「小薯」→「薯條(小)」）。輸出的品項名稱一律用標準名稱 |
| `product_button_overrides` | 用品項名稱指定按鍵（例如三個蛋堡 → 蛋堡系列） |
| `button_categories` | 每個按鍵的分類清單（見 §3.1.1），每個按鍵都要有、可以有多個 |
| `meal_savings.basis` | 「買套餐送X」用套餐價還是單品加總算省額，見 §10.2 |
| `default_objective` | `useMcdDeal` 沒傳 `objective` 時的預設排序 |

鍵盤順序寫在 `v2/scripts/common.py` 的 `BREAKFAST_KEYS` / `REGULAR_KEYS`。
