# 14 · TẦNG L4 — HỢP ĐỒNG DỮ LIỆU RA

> `data.json` + `data_mkt.json` là **ranh giới duy nhất** giữa Python và giao diện.
> Đổi khoá ở đây = phải đổi type trong `src/types/` và view tương ứng.

---

## 1. Hai file, hai nhánh ra

```
LANE THÔ (local)                       LANE CHÍNH (local + Vercel)
build_hub.py → data.json       ┐
build_mkt.py → data_mkt.json   ┼─► tools/build_month.py → data_input/monthly/*.xlsx
                                                                    │
                                              scripts/build-data.mjs ▼
                               src/data/  data.json · data_mkt.json  ← app import ngay
                                          daily.json · product.json  ← chỉ M1 / M2 nạp
                                                    → React + Vite → Vercel
```

App import bốn file riêng: `HUB_DATA` và `MKT_DATA` từ hai file đầu, còn `daily.json`
và `product.json` chỉ được `RevenueView` / `MenuView` import — nhờ vậy Rollup gói chúng
vào đúng chunk của hai màn hình đó thay vì bắt mọi người tải ngay khi mở dashboard.

> Nhánh HTML tĩnh (`build_report.py` + `_template.html` + `_vendor/`) **đã ngừng dùng**
> ngày 10/09/2026 và nằm trong `_archive/`. Nó đọc JSON ở gốc dự án — nguồn của lane thô —
> nên số có thể lệch với bản web vốn dựng từ `data_input/`.

`run_pipeline.py` tự đồng bộ `data*.json` → `src/data/` sau mỗi lần chạy ETL.
Trước đây bước này làm tay nên hai bản dễ lệch — đó là một trong các điểm phân mảnh đã ghi ở Blueprint Phần 13.

---

## 2. `data.json` — 35 khoá

| Khoá | Kiểu | Sinh ở `build_hub.py` | Nội dung | View tiêu thụ |
|---|---|---|---|---|
| `meta` | object | §6 | built · months · latest · rows_item · rows_bill · cogs_coverage · source_root | D1 · M0 · M2 · R1 |
| `qa` | array | §5 | 9 chốt QA khối POS | D1 · Sidebar |
| `stores` | map | L1 | `STORE_META` — code · brand · tier · name · open | D1 · M0 · M1 · M3 · M5 · R1 |
| `core7` | array | L1 | store `core`+`flagship` | *(chưa dùng — app tự tính `CORE_STORES`)* |
| `days` | map | §6 | số ngày của mỗi tháng | FilterContext |
| `coverage` | map | §6 | days_data · days_month · first · last · **partial** | D1 · M0 · FilterContext |
| `store_month` | array | A | month × store: net · guest · tc · gross · disc · voucher · ta · aov · brand · tier | D1 · M0 · M1 · M5 · R1 |
| `daily` | array | B | date × store: net · guest · tc | M1 |
| `daypart` | array | C | month × daypart: net · tc · guest | M3 |
| `daypart_order` | array | C | thứ tự 5 khung giờ để vẽ đúng chiều | M3 |
| `heat` | array | D | dow × hour_in: net · tc | M3 |
| `channel` | array | E | month × Nguồn: net · tc | M3 |
| `menu_median` | object | F | trung vị qty và cm_pct — hai đường chia ô ma trận | M2 |
| `product` | array (top 700) | F | ma · name · cat · grp · qty · rev · cogs · cm · cm_pct · has_cogs · **mclass** | M2 |
| `product_stat` | object | F | thống kê trên **TOÀN BỘ** SKU: sku · sku_cogs · rev20 · n80 · slow · slow_rev · cls · cls_rev | M2 · R1 |
| `category` | array | F2 | Loại món: qty · rev | M2 |
| `group` | array (top 30) | F2 | Nhóm món: qty · rev | *(chưa dùng)* |
| `cogs_cov` | array | G | độ phủ COGS theo tháng | D1 · M2 |
| `cogs_flags` | array (top 12) | G | món có `% GIÁ VỐN` cao nhất | M2 |
| `bom_stat` | object | G | rows · codes · over45 · **loss** · nocost | M2 · R1 |
| `nature` | array | H | month × nature × **brand**: rev · disc · bills | M7 · R1 |
| `campaigns` | array (top 80) | H | name × nature × brand: rev · bills | M7 |
| `staff` | array (top 40) | I | store × nhân viên: net · tc · guest · aov | M3 |
| `zone` | array (top 40) | I | store × khu vực: net · tc | M3 |
| `payment` | array (top 12) | I | PTTT: net · tc | *(chưa dùng)* |
| `dwell` | object | J | n · mean · median (phút) | M3 |
| `dwell_store` | array | J | thời gian ngồi bàn trung bình theo store | *(chưa dùng)* |
| `identify` | array | K | month: bills · id_bills · **rate** | M0 · M6 · M9 · R1 |
| `repeat` | array | K | phân bố 1 / 2–3 / 4–9 / 10+ lượt | M8 |
| `repeat_stat` | object | K | customers · repeat · rate · max | M8 |
| `lead_month` | array | L | tháng inquiry: leads · exp | M10 |
| `lead_source` | array (top 12) | L | theo `Source` (MKT / Hotline / …) | M10 |
| `lead_type` | array (top 12) | L | theo Event Type | M10 |
| `target` | array | M | month × store × target | M0 · FilterContext |
| `recon` | array | N | đối soát month × store: net · net_item · net_bill · tc · guest · **d_bill** | D1 |

---

## 3. `data_mkt.json` — 26 khoá

| Khoá | Sinh ở `build_mkt.py` | Nội dung | View tiêu thụ |
|---|---|---|---|
| `meta` | đầu file | built | *(chưa dùng — lấy `meta` của hub)* |
| `qa` | §1 · §2 | chốt #10 · #11 | D1 · Sidebar |
| `ads_month` | §1 | month: spend · reach · impr · n | M5 |
| `ads_brand` | §1 | month × brand: spend · reach | M5 |
| `ads_objective` | §1 | month × mục tiêu: spend · result | M5 |
| `ads_campaign` | §1 (top 40) | campaign × brand × objective: spend · result · reach · **cpr** | M5 |
| `ads_stat` | §1 | rows · months · spend · unknown · **hr_spend** · brand_spend · platforms · missing | M5 |
| `gads` | §1b | campaign Google: store · brand · status · budget_day · spend · conv · clicks · **cpa** | M5 |
| `gads_stat` | §1b | period · n · spend · conv · clicks · **paused_spend** · **unmapped** | M5 · R1 |
| `gads_channel` | §1b | Maps · Search · YouTube · Display: impr · clicks · conv · spend | *(chưa dùng)* |
| `gads_kw` | §1b (top 30) | cụm từ tìm kiếm | *(chưa dùng)* |
| `gads_kw_stat` | §1b | terms · brand_terms | *(chưa dùng)* |
| `budget` | §1c | file · total · plan · brand[] · extra[] · channel[] · store_ads[] | M4 · M5 · R1 |
| `voucher_prog` | §2 (top 30) | chương trình: issued · used · rate · rev · disc · brand | M10 |
| `voucher_month` | §2 | month × brand: used · rev · disc | *(chưa dùng)* |
| `voucher_stat` | §2 | codes · progs · used · rate · rev · disc · files | *(chưa dùng)* |
| `voucher_join` | §2 | **rate** · window · in_window · out_window · by_month · total_bills | M9 · R1 |
| `oa` | §3 | month: follows · msgs · views · menu · content · days | M9 |
| `member_month` | §4 | month: member · oa · days | *(chưa dùng)* |
| `member_stat` | §4 | months_template · **months_filled** · total · blank | *(chưa dùng)* |
| `crm_target` | §4 | month × kpi × target | *(chưa dùng)* |
| `partners` | §5 | đối tác + kết quả voucher thật gắn vào | M10 |
| `partner_camp` | §5 | mã CTKM ↔ Campaign ID iPOS | *(chưa dùng)* |
| `pre_q3` | §6 | chương trình đề xuất: name · brand · kind · roi · nc *(từ `pre_plan`)* | M7.1 |
| `pre_stat` | §6 | n · **neg** · neg_nc · pos_nc | *(chưa dùng)* |
| `system` | §7 | kiểm toán phân mảnh: total_py · total_loc · cache_mb · tools · dashboards · caches · dup_json | D2 |
| `social.month` | §5b | month × platform × brand × page: followers · reach/views · engage · posts · **audience** · **unit** · **net_follow** · **er** · reach_rate · per_post · cpm | M6 |
| `social.platform_month` | §5b | mức gộp DUY NHẤT được phép — `platform` luôn trong khoá | M6 |
| `social.page` | §5b | danh mục kênh: followers · net_follow · audience · engage · posts · er | M6 |
| `social.post` | §5b | bài/video: format · audience · engage · **er** · watch_avg | M6 |
| `social.format` | §5b | định dạng × nền tảng: posts · audience · engage · **er** | M6 |
| `social.target` | §5b | month × platform × kpi × target | *(chưa dùng)* |
| `social.stat` | §5b | months · platforms · pages · posts · spend · engage · net_follow · er · **audience_by_platform** | M6 |

---

## 4. Khoá đã sinh nhưng chưa màn hình nào dùng

Trước đây có **15 khoá bị bỏ phí** — dữ liệu đã tính rồi mà không ai nhìn thấy.
Đợt nâng cấp 09/09/2026 đã gắn **11/15**:

| Khoá | Đã gắn vào | Kết quả |
|---|---|---|
| `HUB.group` | M2 · *Cơ cấu theo Nhóm món — Top 18* | Chi tiết hơn `category` một bậc |
| `HUB.payment` | M3 · *Cơ cấu phương thức thanh toán* | TRANSFER 34,9% · VISA 28,7% · Tiền mặt 17,1% — **AOV chênh rõ: VISA 477k vs tiền mặt 334k** |
| `HUB.dwell_store` | M3 · *Thời gian ngồi bàn theo cửa hàng* | Có đường trung bình chuỗi; cửa hàng trên mức TB tô cảnh báo |
| `MKT.gads_channel` | M5 · *Hiệu quả theo kênh hiển thị* | **Maps 2.737đ/chuyển đổi — rẻ hơn 3,0× Mạng hiển thị.** Insight chính của Google Ads, trước đây bị giấu |
| `MKT.gads_kw` · `gads_kw_stat` | M5 · *Cụm từ khách dùng để tìm* | 2.567 cụm · chỉ 89 (3,5%) chứa “noire” → 96,5% khách tìm theo nhu cầu |
| `MKT.voucher_stat` | M9 · *Phễu voucher* | 6.264 phát · 2.129 dùng · **4.135 còn nằm im** (redeem 34,0%) |
| `MKT.voucher_month` | M9 · *Phễu voucher* | Trục kép: lượt dùng × chi phí ưu đãi theo tháng |
| `MKT.member_month` · `member_stat` | M9 · *Member so KPI* | Phơi bày **bảng theo dõi tay mới điền 1/6 tháng** |
| `MKT.crm_target` | M9 · *Member so KPI* | Cột % đạt KPI, tô theo 3 ngưỡng |
| `MKT.partner_camp` | M10 · *Bản đồ mã CTKM ↔ Campaign ID iPOS* | Giải thích kết quả mỗi đối tác được gắn qua đâu |

### Bốn khoá còn lại — có lý do

| Khoá | Vì sao chưa gắn |
|---|---|
| `MKT.pre_stat` | M6 **cố ý tính lại** từ `pre_q3` vì màn hình có bộ lọc brand; `pre_stat` là tổng chưa lọc. Có thể thêm dòng “toàn bộ danh sách” để đối chiếu |
| `HUB.core7` | App tự tính `CORE_STORES` từ `stores.tier`. Giữ khoá cho nhánh HTML tĩnh |
| `MKT.meta` | Trùng vai với `HUB.meta` |
| `HUB.recon` *(cột `net_item`)* | D1 mới dùng `net_bill`; cột `net_item` để dành cho chốt QA #12 |

> **Một lỗi thật lộ ra khi gắn `gads_kw`:** bảng cụm từ tìm kiếm còn lẫn 4 dòng cộng dồn
> `Tổng số: Tài khoản`, `Tổng số: Cụm từ tìm kiếm`… — đúng cái bẫy #7 mà blueprint đã cảnh báo,
> nhưng ETL chỉ lọc ở báo cáo *kênh*, quên lọc ở báo cáo *cụm từ*. Lỗi này vô hình suốt vì
> không màn hình nào dùng khoá đó. **Đã vá ở cả hai lane** (`build_mkt.py` và `build-data.mjs`);
> số cụm từ đúng là **2.567**, không phải 2.571.
>
> Bài học: khoá dữ liệu không ai nhìn là khoá không ai kiểm chứng.

---

## 5. Quy tắc khi đổi hợp đồng

Đổi một khoá thì phải đi hết bốn chỗ, thiếu một chỗ là app vỡ hoặc số sai âm thầm:

```
1. build_hub.py / build_mkt.py     sinh khoá
2. src/types/hub.ts | mkt.ts       khai báo type
3. src/views/<View>.tsx            tiêu thụ
4. docs/14 + docs/modules/<M>.md   ghi lại
```

**Ba giới hạn cần nhớ khi thiết kế màn hình mới:**

- `product` **đã cắt còn top 700 theo doanh thu** — muốn thống kê toàn bộ SKU thì dùng `product_stat`,
  đừng cộng lại từ `product`.
- `campaigns` top 80, `staff`/`zone` top 40, `gads_kw` top 30, `voucher_prog` top 30.
- Số liệu trong `product_stat` đã **loại nhóm `NO SERVICE CHARGE`** khỏi mẫu.

---

## 6. Tầng trình bày — thành phần dùng chung

| Thành phần | File | Vai trò |
|---|---|---|
| `FilterProvider` | `src/context/FilterContext.tsx` | Trạng thái toàn app + `aggByMonth` (điểm tổng hợp duy nhất) |
| `Sidebar` | `src/components/layout/Sidebar.tsx` | `NAVIGATION_GROUPS` — 4 khối, 14 module, nhãn trạng thái |
| `TopHeader` · `FilterBar` | `src/components/layout/` | Thanh lọc Brand · Từ · Đến · scope · perday · ghi chú phạm vi |
| `CommandPalette` | `src/components/layout/` | Nhảy nhanh giữa module |
| `MetricCard` · `Card` · `StatusBadge` · `DataTable` | `src/components/common/` | Thẻ KPI · khung · nhãn ngưỡng · bảng có sort/xuất CSV |
| `EChartWrapper` | `src/components/charts/` | Bọc ECharts, đồng bộ theme sáng/tối |
| `formatters.ts` | `src/utils/` | `formatVND` · `formatNumber` · `formatPercent` · `formatMonthLabel` · `calculateDelta` |

**Thêm một module mới cần đúng 3 bước:**

1. Tạo `src/views/<Ten>View.tsx`.
2. Thêm `case '<id>'` vào `renderView()` trong `src/App.tsx`.
3. Thêm một mục vào `NAVIGATION_GROUPS` trong `Sidebar.tsx` (id · code · title · icon · status · statusText).

Nếu module chỉ có phạm vi thời gian riêng (như M4 · M6 chỉ có Q3), khai báo `allowedMonths`
và `customNote` trong `App.tsx` — thanh lọc sẽ chỉ hiện đúng khoảng đó.
