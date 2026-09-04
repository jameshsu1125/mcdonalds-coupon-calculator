/** 供應時段。BREAKFAST 與 LUNCH_DINNER 互斥，ALL_DAY 跟兩者都相容。 */
export type Availability = "ALL_DAY" | "BREAKFAST" | "LUNCH_DINNER";

/** 使用者能挑的時段，不含 ALL_DAY（那是商品屬性不是時段選項）。 */
export type Slot = "BREAKFAST" | "LUNCH_DINNER";

export type OfferType = "ZONE_AB" | "BOGO" | "MEAL_GIFT" | "MIN_SPEND";

/** 品項在方案裡扮演的角色。 */
export type Role = "A" | "B" | "BOGO" | "MAIN" | "SIDE" | "DRINK" | "GIFT";

export interface Product {
  id: string;
  name: string;
  source_names: string[];
  category: string;
  size: string | null;
  temperature: string | null;
  price: number | null;
  appears_in: string[];
}

/** 1+1 星級點與數位甜心卡的來源格式：A 區 x B 區。 */
export interface ZoneItem {
  id: string;
  zone: "A" | "B";
  name: string;
  name_normalized: string;
  availability: Availability;
  combo_price: number | null;
}

export interface MealCombo {
  code: string;
  name: string;
  upcharge: number;
  /** 副餐，一定會給。 */
  includes: string[];
  /** "list" = 從 meal.drinks 那 31 種挑一杯；陣列 = 只能在這幾種裡挑。 */
  drinks: "list" | string[];
}

export interface Meal {
  id: string;
  name: string;
  availability: Availability;
  mains: { product_id: string; name: string; price: number | null }[];
  combos: MealCombo[];
  drinks: { product_id: string; name: string; price: number; upcharge: number }[];
}

export interface CouponOffer {
  id: string;
  type: OfferType;
  title: string;
  availability: Availability;
  channel: string | null;
  products?: string[];
  unit_price?: number;
  meal_id?: string;
  gift?: string;
  min_spend?: number;
}

export interface DealItem {
  product_id: string;
  name: string;
  qty: number;
  zone: Role;
}

/** 一筆「可以直接照著點」的方案。欄位與 mongo/deals-*.json 一致。 */
export interface Deal {
  _id: string;
  source_id: string;
  source: string;
  label: string;
  items: DealItem[];
  product_ids: string[];
  tags: string[];
  price: number;
  original_price: number;
  savings: number;
  item_count: number;
  offer_type: OfferType;
  availability: Availability;
  channel: string | null;
  min_spend: number | null;
}

/** 一組推薦：可能是一張券，也可能是多張湊起來的。 */
export interface Bundle {
  coupons: Deal[];
  coupon_count: number;
  total_price: number;
  total_savings: number;
  total_items: number;
}
