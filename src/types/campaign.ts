/** M7 Promotion (M7 · M7.1 · M7.2) — hình dạng src/data/campaign.json (scripts/build-data.mjs → buildCampaign).
 *  Mọi con số đã được tools/campaign.py tính sẵn; màn hình chỉ trình bày (NT2). */

export interface TaxItem {
  code: string;
  label: string;
  group?: string;
  driver?: string;
  method?: string;
  auto?: boolean;
  color?: string;
  badge?: string;
  desc?: string;
  short?: string;
  hint?: string;
  mechanic?: string;
  sheet?: string;
  prefix?: string;
}

export interface CampaignCostLine {
  type: string;
  planned: number | null;
  actual: number | null;
  note: string | null;
}

export interface Campaign {
  id: string;
  name: string;
  name_pos: string | null;
  /** mã kế hoạch trong Pre-Analysis (C1, G7, V1…) — có thì chấm theo phạm vi chương trình */
  pre_id: string | null;
  source: string | null;
  match_note: string | null;
  /** PROGRAM = so hoá đơn gắn CTKM với kế hoạch Pre-Analysis · STORE = lift cả cửa hàng vs kỳ nền */
  eval_scope: 'PROGRAM' | 'STORE';
  eval_note: string | null;
  prog: {
    sales: number | null; base: number | null; plan: number | null; bills: number | null;
    plan_tc: number | null; share: number | null; disc: number | null; voucher: number | null;
    breakeven: number | null; store_net: number | null; gross: number | null;
    store_tc: number | null;
    /** CTKM = hoá đơn gắn tên CTKM · ITEM = hoá đơn chứa món LTO đã nối ở campaign_item */
    basis: 'CTKM' | 'ITEM';
    lto_qty: number | null; lto_rev: number | null; lto_items: number | null;
  };
  store: { incr: number | null; lift: number | null; flow: number | null };
  brand: string | null;
  nature: string | null;
  lever: string | null;
  lever2: string | null;
  mechanic: string | null;
  window: string | null;
  /** suy từ POS — không hiển thị, chỉ chọn cách đo */
  cadence: string | null;
  recur_dow: number | null;
  /** TC · AOV · BRANDING (TC_AOV_FnB_Marketing.pdf) */
  objective: string | null;
  /** nội dung chương trình — nhập tay ở cột `content` */
  content: string | null;
  /** các dòng cùng pre_id chấm chung; chỉ dòng primary cộng vào tổng */
  plan_group: string | null;
  plan_primary: number | null;
  date_from: string | null;
  date_to: string | null;
  status: string | null;
  owner: string | null;
  hypothesis: string | null;
  discount_rule: string | null;
  cost_owner: string | null;
  label: string;
  measurable: boolean;
  reason: string | null;
  period_from: string | null;
  period_to: string | null;
  days_run: number | null;
  base_from: string | null;
  base_to: string | null;
  stores: string[];
  control: string | null;
  control_factor: number | null;
  overlap: string[];
  ramp_warning: boolean;
  act: { net: number | null; tc: number | null; guest: number | null };
  exp: { net: number | null; tc: number | null; guest: number | null };
  incr: number | null;
  lift: number | null;
  dec: { tc: number | null; aov: number | null; party: number | null; ta: number | null; mix: number | null };
  driver: string | null;
  lever_note: string | null;
  promo: { bills: number | null; guests: number | null; net: number | null };
  cost: {
    discount: number | null;
    voucher: number | null;
    manual: number | null;
    ads_auto: number | null;
    total: number | null;
    planned_used: string | null;
    promo_actual: number | null;
    fixed_actual: number | null;
    lines: CampaignCostLine[];
  };
  cm_pct: number | null;
  flow: number | null;
  roi: number | null;
  breakeven: number | null;
  target: {
    net: number | null;
    tc: number | null;
    aov: number | null;
    ta: number | null;
    incr: number | null;
    submitted: string | null;
    note: string | null;
    verified: boolean | null;
  } | null;
  att: { net: number | null; tc: number | null; aov: number | null; ta: number | null; incr: number | null };
}

export interface CampaignDay {
  id: string;
  date: string;
  p: number;
  act: number | null;
  exp: number | null;
  bills: number | null;
}

export interface UnmappedPromo {
  name_pos: string;
  nature: string;
  brand: string;
  first: string;
  last: string;
  days: number | null;
  bills: number | null;
  net: number | null;
  disc: number | null;
}

export interface CampaignIssue {
  id: string;
  field: string;
  level: string;
  msg: string;
}

/** M7.1 · một chương trình trong file Pre-Analysis + kết quả thực tế (nếu đã chạy) */
export interface PlanRow {
  pre_id: string;
  campaign_id: string | null;
  name: string;
  brand: string | null;
  kind: string;
  plan_status: string | null;
  est_tc: number | null;
  base: number | null;
  growth: number | null;
  target: number | null;
  incr: number | null;
  aov: number | null;
  cogs: number | null;
  promo_cost: number | null;
  fixed_cost: number | null;
  total_cost: number | null;
  nc: number | null;
  roi: number | null;
  breakeven: number | null;
  driver: number | null;
  assessment: string | null;
  file: string | null;
  label: string | null;
  period_from: string | null;
  period_to: string | null;
  act_sales: number | null;
  /** Doanh thu CTKM = Σ Tổng tiền cả hoá đơn (cùng định nghĩa M7.2) */
  act_promo_net: number | null;
  act_bills: number | null;
  act_incr: number | null;
  act_cost: number | null;
  act_nc: number | null;
  act_roi: number | null;
}

/** M7.1 · phiếu đánh giá trước khi chạy (tools/preeval.py) */
export interface PreEvalScenario {
  bills: number | null; bills_incr: number | null; cannib: number | null; rev_incl: number | null;
  net_incr: number | null; gp_incr: number | null; promo_cost: number | null; program_cost: number | null;
  opex_incr: number | null; ebitda: number | null; ebitda_pct: number | null; roi: number | null;
  breakeven_bills: number | null; max_cannib: number | null; redemption_needed: number | null;
  stock_days: number | null; gate_flags: string | null;
  /** hoá đơn tham gia ÷ TC nền */
  tc_share: number | null;
  /** hoá đơn dự kiến ÷ hoá đơn cần để hoà vốn (biên an toàn) */
  safety_bills: number | null;
}
export interface PreEvalFinRow {
  row: string; label: string; base: number | null; without: number | null; with: number | null;
  total: number | null; cannib: number | null; incr: number | null; incr_pct: number | null;
}
export interface PreEvalScheme {
  id: string; name: string; condition: string; benefit: string; bills: number | null; bill_value: number | null;
  discount: number | null; rev: number | null; ta: number | null; cogs: number | null; cogs_pct: number | null;
  margin_pct: number | null; merch: number | null; promo_cost: number | null; note: string | null;
}
export interface PreEvalBase {
  store: string; from: string | null; to: string | null; days: number | null; net: number | null; tc: number | null;
  guests: number | null; aov: number | null; ta: number | null; tc_day: number | null; tax_factor: number | null;
  disc_share: number | null; note: string | null;
}
/** M7.1 · 1 trường đầu vào ĐÃ CHUẨN HOÁ ($preeval.input_fields) — nguồn SO = sổ · DECK = file deck quý */
export interface PreEvalInput {
  field: string; value: string | number | null; source: 'SO' | 'DECK' | null;
  level: 'required' | 'required_promo' | 'recommended' | 'optional';
  /** OK · THIEU (bắt buộc còn trống) · TRONG (không bắt buộc, để trống) */
  status: 'OK' | 'THIEU' | 'TRONG';
  /** deck ghi gì ở ô còn trống */
  hint: string | null;
}
export interface PreEvalProgram {
  id: string; name: string; brand: string; stores: string[]; date_from: string; date_to: string; days: number | null;
  objective: string | null; lever: string | null; status: string | null; decision: string; decision_note: string | null;
  campaign_id: string | null;
  quarter: string | null; season_factor: number | null; scheme_mode: string | null; tc_base: number | null;
  participation_src: string | null; cannib_src: string | null; other_cogs_pct: number | null; opex_pct: number | null;
  base_note: string | null;
  /** SO · DECK: <file> · DECK: <file> + sổ */
  input_source: string | null;
  /** mã trường bắt buộc còn trống (decision THIEU_SO) */
  missing: string[];
  inputs: PreEvalInput[];
  scn: Record<string, PreEvalScenario>;
  fin: Record<string, PreEvalFinRow[]>;
  schemes: PreEvalScheme[];
  base: PreEvalBase[];
}

export interface CampaignData {
  meta: { demo: boolean; empty: boolean; default_cm_pct: number; maturity_days: number };
  taxonomy: {
    levers: TaxItem[];
    mechanics: TaxItem[];
    windows: TaxItem[];
    cadences: TaxItem[];
    cost_types: TaxItem[];
    labels: TaxItem[];
    natures: TaxItem[];
    pre_kinds: TaxItem[];
    sources: TaxItem[];
    objectives: TaxItem[];
  };
  plan: PlanRow[];
  /** số POS của chương trình theo tháng × cửa hàng (campaign_month) */
  month: { id: string; m: string; s: string; bills: number; guests: number; net: number; gross: number; disc: number; voucher: number; dup_bills: number; dup_guests: number; dup_net: number }[];
  preeval: {
    scenarios: { code: string; label: string; bills_mult: number; cannib_add: number; cogs_add: number }[];
    decisions: TaxItem[];
    gates: { max_cogs_pct: number; max_promo_cost_pct_net: number; min_gm_pct: number };
    input_fields: { code: string; label: string; level: string }[];
    input_levels: TaxItem[];
    programs: PreEvalProgram[];
  };
  /** tên CTKM trên POS (chữ thường) → campaign_id */
  pos_map: Record<string, string>;
  campaigns: Campaign[];
  daily: CampaignDay[];
  unmapped: UnmappedPromo[];
  issues: CampaignIssue[];
  coverage: { promo_net: number; unmapped_net: number; mapped_pct: number | null };
}
