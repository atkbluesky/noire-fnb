# M7.2 · PROMOTION TRACKING — HIỆU QUẢ CHƯƠNG TRÌNH

| | |
|---|---|
| **Câu hỏi** | Chương trình này **tạo thêm** được bao nhiêu, tốn bao nhiêu, lãi hay lỗ? |
| **`activeView`** | `m72` *(mục con của M7 Promotion)* |
| **Quan hệ với M7** | M7 = **cơ cấu chi phí ưu đãi** (kế toán, phòng thủ) · M7.2 = **hiệu quả chương trình** (marketing, tấn công) |
| **Trạng thái** | 🟡 **Chạy trên danh mục THẬT** (74 CT: 5 khớp kế hoạch · 49 chỉ POS · 20 chỉ kế hoạch) — chờ team brand điền ô CAM (đòn bẩy · giả thuyết · người phụ trách · target) |
| **Cụm** | Mục con của M7 Promotion — danh mục chung, hai cách chấm `PROGRAM` / `STORE`: xem [M7_Promotion.md §0](M7_Promotion.md) |
| **Nguồn / engine / màn** | `L0_input/03_MARKETING/07_Campaign_Tracking/` (S23) → `tools/campaign.py` → `data_input/03_campaign.xlsx` → `src/data/campaign.json` → `src/views/CampaignTrackingView.tsx` |
| **Tài liệu gốc** | `01 Strategic/05. Plan/TC_AOV_FnB_Marketing.pdf` · Sheet "NOIRE JFB - Weekly Report" của team brand |

---

## ⓪ Phạm vi số trên màn hình — theo THÁNG × BRAND đang lọc *(17/09/2026)*

**Lỗi đã sửa:** KPI cộng `promo_net` cả kỳ chạy của mọi chương trình giao với tháng lọc, và cả cửa hàng brand khác của
chương trình ALL → NJFB T8 hiện 4,09 tỷ. Số đúng (POS): **269,0 tr · 150 hoá đơn = 18,0% DT brand 1,50 tỷ · 19,7% HĐ brand 762**.

| Quy tắc | Cách làm |
|---|---|
| Nguồn | `campaign_month` (tools/campaign.py): số POS của mỗi chương trình theo **tháng × cửa hàng** — bills · guests · net · gross · disc · voucher |
| Cộng | chỉ tháng trong bộ lọc × cửa hàng thuộc brand đang lọc |
| Nền so sánh | `store_month` cùng tháng + cửa hàng (cùng định nghĩa Tổng tiền — đã khớp `recon`) |
| Không đếm trùng | mỗi hoá đơn POS gắn 1 tên CTKM; hoá đơn LTO đồng thời gắn tên CTKM (`dup_*`) bị trừ khi cộng tổng |
| RECURRING | báo cáo đếm mọi hoá đơn gắn tên trong kỳ chạy (kể cả ngày khác thứ chạy); đo lift vẫn chỉ so đúng thứ |
| DT tăng thêm · Lãi · chi phí | kết quả chấm cả kỳ × tỷ trọng doanh thu CTKM nằm trong phạm vi lọc (ký hiệu **pb**); kế hoạch nhiều tên POS chỉ dòng chính mang kết quả |
| Nhãn ĐẠT / KHÔNG ĐẠT | chấm trên cả kỳ chạy |

**Đối soát T1–T9/2026:** tổng hoá đơn + Tổng tiền CTKM trên màn hình = `fact_promo_day` (bỏ INTERNAL) khớp từng đồng mỗi tháng,
trừ 3 mã giảm tay đã để CANCELLED (không phải chương trình): *Chiết khấu trực tiếp* · *Mã Xử Lý Tình Huống KH (FOC 100%)* · *Giảm giá trực tiếp* — tổng 5 hoá đơn, 368K.

## 0. Vì sao phải tách M7.2 ra khỏi M7

M7 hiện trả lời đúng **một** câu: *“tiền ưu đãi đang chảy vào đâu”*. Nó phân loại 4 bản chất,
và đó là việc kế toán — cần thiết, nhưng **không phải** đo hiệu quả marketing.

Câu mà team brand thực sự cần trả lời là câu khác hẳn:

> *“HAPPY TUESDAY tháng này tạo thêm bao nhiêu doanh thu so với việc không chạy gì?
> Tốn bao nhiêu? So với target đặt ra thì đạt bao nhiêu phần trăm? Có nên chạy tiếp không?”*

Hai câu hỏi này cần **hai khung dữ liệu khác nhau**, **hai đơn vị phân tích khác nhau**:

| | M7 · Khuyến mãi & 4 Bản chất | M7.2 · Promotion Tracking |
|---|---|---|
| Đơn vị phân tích | `tháng × bản chất × brand` | **`chương trình × kỳ chạy`** |
| Số đo chính | doanh thu **chạm** · chi phí ưu đãi | **doanh thu tăng thêm (incremental)** |
| Cần kỳ chạy? | không | **bắt buộc** |
| Cần target? | không | **bắt buộc** |
| Phạm vi | cả 4 bản chất | chỉ **COMMERCIAL · LOYALTY · PARTNER (phần NOIRE trả)** |
| Trả lời được | “tốn bao nhiêu” | “**lãi hay lỗ**” |

Gộp chung vào một màn hình thì cả hai đều hỏng: khối kế toán bị pha bởi target marketing,
khối marketing bị pha bởi 3,39 tỷ chiết khấu nội bộ.

---

## 1. Hiện trạng — ba hệ thống rời nhau, không cái nào đo được hiệu quả

### 1.1 Hệ thống A — Dashboard M7 (đang chạy)

```
POS item → cột "Tên CTKM" → classify_nature() → gộp month × nature × brand
```

Có: 58 tên chương trình · 10,07 tỷ doanh thu chạm · 8 tháng (T1–T7, T9/2026).
Không có: ngày bắt đầu/kết thúc · phạm vi cửa hàng · ngân sách · target · baseline · cơ chế.

### 1.2 Hệ thống B — Google Sheet "NOIRE JFB - Weekly Report" (team brand)

Tab tracking khuyến mãi có cấu trúc **tốt hơn dashboard ở 2 điểm**:

| Cột | Ý nghĩa | Dashboard có? |
|---|---|---|
| `Cửa hàng` · `Ngày` · `Tuần` · `Tháng` | **chi tiết tới ngày** | ❌ chỉ có tháng |
| `Khuyến mãi` | tên CTKM | ✅ |
| `Số hóa đơn` | TC gắn chương trình | ✅ |
| **`Giảm giá`** | **chi phí ưu đãi thật (cấp bill)** | ⚠️ **sai nặng — xem 1.4** |
| `Doanh thu (net)` | doanh thu sau giảm | ✅ *(khác base)* |

Nhưng cũng dừng ở mức **pivot mô tả**: vẫn không có kỳ chạy, target, baseline, chi phí ads.
Và nó chỉ chạy cho **1 trong 3 thương hiệu** (NJFB), thủ công, mỗi tuần.

### 1.3 Hệ thống C — Slide chiến lược `TC_AOV_FnB_Marketing.pdf`

Đây là phần **tư duy đúng nhưng chưa có số**. Bốn thứ lấy được từ file này:

1. **Cây chỉ số** — `SALES = TC × AOV`. Mọi chương trình phải khai nó đánh vào nhánh nào.
2. **9 đòn bẩy** — 6 đòn TC (Customer Base · Frequently · Party Size · Secondary Order ·
   Sales Channel · Day-part) và 3 đòn AOV (Menu Item Sold · Menu Item Value · Pricing).
3. **Marketing Windows** — 9 cửa sổ trong năm, nguyên tắc *“không để cách quá 2 tuần
   không có chương trình”*.
4. **Bảng tính 5 bước trước khi chạy** (slide 8) — và công thức chốt:

   ```
   Lợi nhuận Flow-Through = (Sales KM − Sales thường) × %Biên LN − Chi phí KM
   ```

   Đây chính là **định nghĩa “đóng góp chương trình mang lại”** mà M7.2 phải tính ra.

### 1.4 Bốn lỗi dữ liệu phát hiện khi đối soát — phải sửa trước khi dựng M7.2

**① Chi phí ưu đãi đang sai 433 lần.** Đối soát cùng brand NJFB, cùng tháng 4/2026 —
**số hoá đơn khớp tuyệt đối 267 = 267**, tức cùng nguồn, cùng cách khử trùng:

| | Dashboard M7 | Sheet team brand | Lệch |
|---|---|---|---|
| Số bill gắn CTKM | 267 | 267 | ✅ khớp |
| Doanh thu chạm | 681,8 tr | 674,0 tr *(base khác)* | ~1% |
| **Chi phí ưu đãi** | **0,42 tr** | **200,6 tr** | ❌ **×433** |

Nguyên nhân: ETL lấy `Giảm giá` ở **cấp dòng món**, nhưng POS ghi chiết khấu ở **cấp hoá đơn**.
Cả năm dashboard chỉ nhận 90,8 tr chiết khấu trên 10,07 tỷ doanh thu chạm — **0,9%** —
trong khi chương trình thực tế giảm 10–50%. Kiểm chứng ngược từ sheet team brand:
`CHAIRMAN AND FAMILY 30%` → disc/net = 36,7% (đúng với mức giảm 30% trên gross);
`Loyalty Giảm 10%` → 10,1%; `DIRECTORS 25%` → 29,3%. Số của team brand **đúng**, số dashboard **sai**.

**Và con số đúng đã nằm sẵn trong hệ thống.** `store_month.disc` (= `gross − net`, cấp hoá đơn)
cùng file `data.json`, cùng kỳ, chênh 18–45 lần so với `nature.disc`:

| Tháng | `store_month.disc` *(cấp bill)* | `nature.disc` *(cấp món)* | Lệch |
|---|---:|---:|---:|
| 2026-01 | 370,1 tr | 8,2 tr | 45,3× |
| 2026-02 | 217,9 tr | 4,9 tr | 44,6× |
| 2026-03 | 346,6 tr | 10,8 tr | 32,1× |
| 2026-04 | 385,9 tr | 13,4 tr | 28,8× |
| 2026-05 | 322,5 tr | 17,5 tr | 18,4× |
| 2026-06 | 369,1 tr | 17,3 tr | 21,3× |
| 2026-07 | 347,7 tr | 18,5 tr | 18,8× |

Tức đây **không phải bài toán thiếu dữ liệu** mà là bài toán **ghép sai tầng**:
chiết khấu đã đo đúng ở cấp hoá đơn nhưng chưa bao giờ được nối về chương trình.

> ✅ **ĐÃ SỬA (T9/2026).** Khi mổ tới cột thì nguyên nhân còn cụ thể hơn: iPOS tách
> chiết khấu ra **ba cột** và lane cũ đọc đúng cột nhỏ nhất — `Giảm giá` (8–18tr/tháng),
> bỏ sót `Chiết khấu` (318–372tr) và `Phiếu GG` (34–184tr). Chi tiết ở
> [M7 §7](M7_Promotion.md). Sau khi sửa, chi phí ưu đãi 2026 là **3,58 tỷ** thay vì 90,8 tr,
> và đối soát với sheet team brand lệch **0,2%**.

> ⛔ **Mọi phép ROI dựng trên `nature.disc` hiện tại đều vô nghĩa.** Phải chuyển sang
> lấy chiết khấu cấp bill (`Thanh toán trước giảm giá − Tổng tiền`) trước khi làm bất cứ gì khác.

**② Quy tắc phân loại `nature` bắt nhầm 3 nhóm.**

| Tên CTKM | Đang gán | Phải là | Vì sao | Tiền |
|---|---|---|---|---|
| `Giảm 50% cho Nhân Viên SonKim Group (JFB)` | **INTERNAL** | **PARTNER** | nhân viên **đối tác**, không phải NOIRE — luật `nhân viên` bắt trước luật `skg` | 88,8 tr |
| `GIẢM GIÁ 10%/15% - CHƯƠNG TRÌNH CSKH` ×4 | **COMMERCIAL** | **CARE** *(nhãn mới)* | service recovery, không phải campaign bán hàng | 67,2 tr |
| `Tặng 01 Tráng Miệng Khảo Sát Ý Kiến` · `Google Review Tặng Khoai Tây` | **COMMERCIAL** | **CARE** | đổi quà lấy review/khảo sát | 169,8 tr |

Tổng **325,8 tr** đang nằm sai ô. Riêng nhóm CARE (237 tr) đang **thổi phồng COMMERCIAL 8,6%**
— tức làm ROI marketing trông **tệ hơn** thực tế (có chi phí, không có ý đồ tăng doanh thu).

**③ Thiếu hẳn tháng 8/2026** trong khối `nature` của `data.json`
(có T1→T7 và T9, mất T8) — trong khi `monthly/2026-08.xlsx` **có** sheet `nature`.
Lane thô và lane processed đang lệch nhau.

**④ Tên CTKM là free-text, một chương trình nhiều tên.** Ví dụ cùng một cơ chế
“giảm 50% thứ 4”: `GIẢM 50% THỨ 4 HÀNG TUẦN` (COMMERCIAL) và
`GIẢM 50% SKG THỨ 4 HÀNG TUẦN (JFB)` (PARTNER) — đúng là 2 chương trình khác nhau
(khác tệp khách, khác người trả tiền), nhưng hệ thống **không có cách nào biết điều đó**
ngoài việc đọc tên. Còn `GIẢM GIÁ 50% SKG-NOIRE SSV (24/12/2025-31/01/2026)` thì
**nhét cả kỳ chạy vào trong tên** — bằng chứng rõ nhất rằng bảng master đang thiếu.

---

## 2. Khung phân loại — mỗi chương trình phải có đủ 4 nhãn

Một nhãn không đủ. `HAPPY TUESDAY` là COMMERCIAL — nhưng nó là đòn **Day-part** hay **Frequency**?
Cơ chế là **giảm %** hay **tặng món**? Nằm trong cửa sổ nào? Không trả lời được thì
không so sánh được chương trình nào với chương trình nào.

### Trục A — `nature` · **AI TRẢ TIỀN** (quyết định vào P&L nào)

| Nhãn | Định nghĩa | Vào ROI marketing? |
|---|---|---|
| `COMMERCIAL` | Marketing chủ động đẩy doanh thu | ✅ **trọng tâm M7.2** |
| `LOYALTY` | Ưu đãi theo hạng thành viên | ✅ đo riêng — mục tiêu là **giữ chân**, không phải lift tức thời |
| `PARTNER` | Đối tác/toà nhà — **ghi rõ phần NOIRE gánh** | ✅ chỉ phần NOIRE trả |
| `INTERNAL` | Chiết khấu nội bộ (Chairman · Directors · CBNV) | ❌ khoản mục P&L, **loại khỏi M7.2** |
| `CARE` 🆕 | CSKH · service recovery · đổi quà lấy review/khảo sát | ❌ tách riêng, **không tính vào ROI** |

### Trục B — `lever` · **ĐÒN BẨY NÀO** (theo `SALES = TC × AOV`)

| Nhóm | Mã | Tên | Số đo phải nhúc nhích |
|---|---|---|---|
| **TC** | `TC_BASE` | Customer Base — khách mới | TC · tỷ lệ khách mới |
| | `TC_FREQ` | Frequently — tần suất quay lại | TC · lượt/khách |
| | `TC_PARTY` | Party Size — quy mô nhóm | **guest/bill** *(pax)* |
| | `TC_SECOND` | Secondary Order — order thêm cùng chuyến | món/bill |
| | `TC_CHANNEL` | Sales Channel — mở kênh mới | TC theo kênh |
| | `TC_DAYPART` | Day-part — mở khung giờ | TC theo khung giờ |
| **AOV** | `AOV_QTY` | Menu Item Sold — thêm món/khách | món/khách |
| | `AOV_VALUE` | Menu Item Value — upsell món cao giá | **TA** *(net/khách)* |
| | `AOV_PRICE` | Pricing — bundling · định giá tâm lý | AOV · biên LN |

> **Luật một đòn bẩy chính.** Mỗi chương trình khai **1 `lever_primary`** (được phép thêm
> 1 `lever_secondary`). Nếu chương trình vừa kéo khách mới vừa upsell thì nó là **2 chương trình**,
> ngân sách chia rõ. Không có luật này thì mọi chương trình đều “đạt” vì luôn có một chỉ số nào đó tăng.

### Trục C — `mechanic` · **CƠ CHẾ THỰC THI** (8 nội dung ở slide 7)

`PCT_OFF` giảm % · `FIXED_OFF` giảm số tiền · `CASH_VOUCHER` voucher tiền mặt ·
`NEXT_VISIT` voucher kỳ sau · `GIFT_ITEM` tặng món · `MERCH_GIFT` tặng vật phẩm ·
`BXGY` mua X tặng Y · `COMBO_SET` set menu · `TIME_WINDOW` giờ vàng/thứ cố định ·
`LUCKY_DRAW` bốc thăm · `NEW_ITEM` ra mắt món mới

Cơ chế quyết định **cách tính chi phí**: `PCT_OFF` → chi phí = chiết khấu;
`GIFT_ITEM` → chi phí = **giá vốn món tặng** (không phải giá bán);
`NEXT_VISIT` → chi phí ghi nhận ở **kỳ sau, theo tỷ lệ redeem thực**.

### Trục D — `window` + `cadence` · **NHỊP CHẠY**

`window` ∈ `TET_DL` · `TET_AL` · `VALENTINE` · `INT_WOMEN_0803` · `HOLIDAY_3004` ·
`SUMMER` · `NATIONAL_0209` · `VN_WOMEN_2010` · `XMAS_NY` · `ALWAYS_ON`

`cadence` ∈ `BURST` (một lần, có ngày kết thúc) · `RECURRING` (lặp theo thứ/tuần) ·
`ALWAYS_ON` (chạy liên tục)

> ⚠️ **Đây là trục quyết định phương pháp đo.** `BURST` đo bằng lift so kỳ nền.
> `RECURRING` như “giảm 50% thứ 4” **không đo bằng lift được** — sau vài tuần nó *chính là* baseline;
> phải đo bằng **so sánh cùng thứ** (thứ 4 có KM vs thứ 4 không KM ở store đối chứng) hoặc
> mix-shift (doanh thu thứ 4 / tổng tuần). `ALWAYS_ON` chỉ đo được khi bật/tắt.
> Dùng sai phương pháp cho `RECURRING` là cách nhanh nhất để báo cáo một con số ROI bịa.

---

## 3. Khung dữ liệu — 5 bảng

```
  [gõ tay 1 lần / chương trình]        [ETL tự sinh]
  ┌──────────────────┐                 ┌──────────────────┐
  │  dim_campaign    │◄────map────────►│  fact_promo_day  │  ← THIẾU HOÀN TOÀN
  │  ai · gì · khi   │  name_pos        │  ngày × store    │     hiện chỉ có
  └────────┬─────────┘                 │  × CTKM          │     month×nature×brand
           │                           └────────┬─────────┘
     ┌─────┴─────┬──────────┐                   │
     ▼           ▼          ▼                   ▼
 campaign_   campaign_  campaign_        ┌──────────────┐
 target      cost       control          │  daily.json  │ ← baseline
 (kế hoạch)  (chi phí)  (đối chứng)      │ ngày × store │   ĐÃ CÓ SẴN
                                          └──────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │  L3 · metric      │  baseline → expected → incremental
                    │  (tính, không gõ) │  → lift → cost → flow-through → ROI
                    └───────────────────┘
```

> **Nơi nhập thật (đã chốt):** cả 4 bảng gõ tay (`dim_campaign` · `campaign_target` · `campaign_cost` · `campaign_control`)
> là 4 sheet của MỘT file `L0_input/03_MARKETING/07_Campaign_Tracking/Campaign_Tracking_2026.xlsx`.
> Mẫu có dropdown + hướng dẫn: `_MAU_Campaign_Tracking.xlsx` (sinh bởi `tools/campaign_template.py`).
> Cột chuẩn = `data_contract.json` → `sheets.dim_campaign …` và `$campaign`; bảng dưới là diễn giải.

### 3.1 `dim_campaign` — bảng master *(gõ tay · sheet `dim_campaign`)*

Đây là **bảng đang thiếu và chặn toàn bộ M7.2**. Một dòng = một chương trình.

| Cột | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `campaign_id` | text | ✅ | `NCB-2026-07-HAPPYTUE` — brand-năm-tháng-slug |
| `name` | text | ✅ | Tên hiển thị trên dashboard |
| `name_pos` | text | ✅ | **Danh sách tên CTKM trong POS**, ngăn bằng `\|`. Cầu nối duy nhất giữa master và POS |
| `brand` | enum | ✅ | `NCB` · `NDC` · `NJFB` · `ALL` |
| `store_scope` | text | ✅ | Mã store ngăn bằng `\|`, hoặc `ALL` |
| `nature` | enum | ✅ | Trục A — **ghi đè** `classify_nature()` khi có khai báo |
| `lever_primary` | enum | ✅ | Trục B |
| `lever_secondary` | enum | | Trục B |
| `mechanic` | enum | ✅ | Trục C |
| `window` | enum | ✅ | Trục D |
| `cadence` | enum | ✅ | `BURST` · `RECURRING` · `ALWAYS_ON` — **quyết định phương pháp đo** |
| `recur_dow` | text | | Chỉ khi `RECURRING`: `2` = thứ 3 … `4` = thứ 5 *(0=CN)* |
| `date_from` · `date_to` | date | ✅ | `date_to` trống = đang chạy |
| `discount_rule` | text | ✅ | `30%` · `50K` · `1 tráng miệng` — để đối soát chi phí |
| `cost_owner` | enum | ✅ | `NOIRE` · `PARTNER` · `SPLIT` |
| `noire_share` | % | ✅ khi `SPLIT` | Phần NOIRE gánh |
| `owner` | text | ✅ | Người chịu trách nhiệm |
| `hypothesis` | text | ✅ | *“Giảm 20% cho khách đặt bàn trước sẽ kéo TC thứ 3–4 lên 15%”* — **một câu, viết TRƯỚC khi chạy** |
| `status` | enum | ✅ | `PLANNED` · `RUNNING` · `ENDED` · `CANCELLED` |

> **`hypothesis` không phải cột trang trí.** Không có giả thuyết viết trước thì sau khi chạy
> ai cũng tìm được một chỉ số nào đó đã tăng và gọi đó là thành công. Cột này khoá điều đó lại.

### 3.2 `fact_promo_day` — bảng sự kiện ✅ *(ĐÃ DỰNG · ETL tự sinh · `monthly/YYYY-MM.xlsx`)*

Bổ sung cho `nature` (không thay thế). Cùng nguồn POS nhưng **giữ chiều ngày và store**.
Khoá tự nhiên `date + store + name_pos`. Thực tế 410–930 dòng/tháng.

| Cột | Lane | Nguồn |
|---|---|---|
| `date` · `store` · `brand` | bill | `Ngày chứng từ` · `Cửa hàng` |
| `name_pos` | bill/item | `Tên CTKM` — **giữ nguyên văn**, chỉ gộp khoảng trắng thừa |
| `nature` | — | `classify_nature(name_pos)` |
| `bills` · `guests` | bill | hoá đơn đã khử trùng · `Số khách` |
| `gross` | bill | `Thanh toán trước giảm giá` |
| **`disc`** | bill | **`Giảm giá` + `Chiết khấu`** — giảm giá thật |
| **`voucher`** | bill | **`Phiếu GG`** — để riêng, xem ghi chú dưới |
| `net` | bill | `Tổng tiền` |
| `rev` · `items` | item | `Thành tiền` · số dòng món |

**Ba quyết định thiết kế cần biết khi đọc bảng này:**

**① `net` lấy cột `Tổng tiền`, không phải `Tổng tiền (không bao gồm VAT)`.** Đối soát
T4/2026: tổng cột `Tổng tiền` của bảng kê = **4.242.462.365**, bằng **đúng từng đồng**
Net Sales của Tracking Sales. Kỳ nền của M7.2 lấy từ `daily.json` — hai vế phải cùng
base thì lift mới có nghĩa. Chọn nhầm cột là mọi phép lift lệch ~8% một cách có hệ thống.

**② `disc` và `voucher` để riêng.** Voucher là **phương thức thanh toán**, không phải
giảm giá, nên nó không nằm trong `store_month.disc`. Chỉ `disc` mới so được với con số đó
— và khi so thì khớp 89–97% mọi tháng. Gộp chung thì tỷ lệ vọt lên 123–150%, tức lớn hơn
tổng chiết khấu toàn chuỗi. Đúng bằng cách M7.2 tách `DISCOUNT` khỏi `VOUCHER_REDEEM`
ở `campaign_cost`. Cả năm 2026: `disc` 2,73 tỷ + `voucher` 857 tr.

**③ `rev` và `net` KHÔNG cộng chung được.** `rev` là `Thành tiền` cấp dòng món (trước
phí dịch vụ và VAT); `net` là `Tổng tiền` cấp hoá đơn (sau giảm, có phí dịch vụ và VAT).
Hai base khác nhau, giữ cả hai để mỗi màn hình dùng đúng cái nó cần.

> ⚠️ **Hai lane gọi tên chương trình khác nhau ở khối LOYALTY.** Bảng kê ghi
> `Loyalty Giảm 10%` (476 bill, T4/2026); báo cáo bán hàng ghi tên hạng
> `Hạng Gold` · `Hạng Silver` · `Hạng Black Diamond` (683 dòng). Cùng `nature = LOYALTY`
> nên tổng theo bản chất vẫn đúng, nhưng các dòng theo tên hạng **không có chiết khấu**
> (`disc` trống). ETL in cảnh báo số dòng này mỗi lần chạy. Gộp chúng lại là việc của
> `dim_campaign.name_pos`, không phải của ETL.

### 3.3 `campaign_target` — kế hoạch *(gõ tay · slide 8 của PDF)*

Một dòng = một chương trình. **Nộp TRƯỚC ngày `date_from`** — nộp sau là bịa.

| Cột | Ghi chú |
|---|---|
| `campaign_id` | khoá |
| `base_method` | `DOW4W` *(TB 4 tuần cùng thứ — mặc định)* · `PREV_PERIOD` · `LAST_YEAR` · `MANUAL` |
| `base_net` · `base_tc` · `base_aov` · `base_ta` · `base_pax` | **Baseline — bước 1 slide 8.** Để trống → hệ thống tự tính từ `daily.json` |
| `tgt_net` · `tgt_tc` · `tgt_aov` · `tgt_ta` | **Bước 2 slide 8** — số kỳ vọng KHI CÓ khuyến mãi |
| `tgt_incr_net` | Doanh thu tăng thêm kỳ vọng = `tgt_net − base_net` |
| `exp_redeem_rate` | % khách đủ điều kiện sẽ dùng ưu đãi — tham số nhạy nhất của dự toán |
| `exp_disc_per_bill` | Chiết khấu bình quân/bill kỳ vọng — **bước 3 slide 8** |
| `cm_pct` | % biên lợi nhuận dùng để quy đổi ra lợi nhuận. Mặc định lấy từ M2 theo brand |

### 3.4 `campaign_cost` — chi phí *(gõ tay + ETL bù)*

Nhiều dòng/chương trình. Tách `planned` và `actual` để so chính kế hoạch chi phí.

| `cost_type` | Nguồn `actual` | Ghi chú |
|---|---|---|
| `DISCOUNT` | **ETL từ `fact_promo_day.disc`** | không gõ tay |
| `GIFT_COGS` | ETL × BOM (M2) | **giá vốn**, không phải giá bán |
| `VOUCHER_REDEEM` | M8 voucher | ghi ở **kỳ redeem** |
| `ADS` | M5 Digital Ads | cần cột `campaign_id` ở `ads_campaign_detail` để ghép |
| `KOL` · `PRINT` · `MERCH` · `AGENCY` | gõ tay từ M4 | |
| `PARTNER_SHARE` | gõ tay | số ÂM nếu đối tác bù lại |

### 3.5 `campaign_control` — cửa hàng đối chứng *(tuỳ chọn nhưng quyết định độ tin cậy)*

| Cột | Ghi chú |
|---|---|
| `campaign_id` · `control_store` | Store **không chạy** chương trình, cùng brand, cùng kỳ |

Không khai → hệ thống dùng **toàn bộ store cùng brand không nằm trong `store_scope`**.
Không có store nào đủ điều kiện → gắn cờ `no_control`, và kết quả lift **phải hiển thị kèm cảnh báo**.

---

## 4. Tầng metric — công thức chốt

### 4.1 Baseline — kỳ nền

```
BURST     : base_net(store, dow) = TB net các ngày MỞ BÁN cùng `dow` trong 28 ngày hợp lệ ngay TRƯỚC date_from
RECURRING : so ngày có chương trình với 4 lần gần nhất cùng `dow` TRƯỚC khi chương trình bắt đầu
ALWAYS_ON : không có kỳ nền → CHƯA ĐO ĐƯỢC (cần một tuần tắt hoặc store đối chứng)
```
Tham số nằm ở `data_contract.json → $campaign` (`base_days` 28 · `base_exclude` ngày lễ ·
`min_open_days_base` 14 · `ramp_days` 90 · `control_factor_range` [0,5 ; 2]).

**Bắt buộc so cùng thứ trong tuần.** Dữ liệu chính team brand cho thấy trong một tuần
thứ 2 đạt 23,9 tr còn thứ 4 đạt 57,4 tr — **chênh 2,4 lần**. Baseline không khớp thứ
sẽ tạo ra “lift” hoàn toàn giả chỉ vì chương trình rơi vào cuối tuần.

Loại khỏi kỳ nền: ngày lễ · ngày đóng cửa · ngày có chương trình `BURST` khác đang chạy ·
14 ngày đầu sau khai trương store.

### 4.2 Khử mùa vụ bằng store đối chứng

```
f_season = net_control(kỳ chạy) / net_control(kỳ nền)
expected_net = base_net × f_season × số_ngày_chạy
```

Đây là bước phân biệt báo cáo thật với tự huyễn hoặc. Nếu store đối chứng cũng tăng
tương đương thì lift là **mùa vụ, không phải chương trình**.

### 4.3 Doanh thu tăng thêm và phân rã đóng góp

```
incr_net = actual_net − expected_net
lift_pct = incr_net / expected_net
```

Phân rã ra **đúng ba nhánh của cây `SALES = TC × AOV`** để biết chương trình thắng bằng gì:

```
Δ_do_TC   = (TC_act − TC_exp) × AOV_exp          ← đòn bẩy nhóm TC_*
Δ_do_AOV  = TC_exp × (AOV_act − AOV_exp)         ← đòn bẩy nhóm AOV_*
Δ_tương_tác = (TC_act − TC_exp) × (AOV_act − AOV_exp)
incr_net  = Δ_do_TC + Δ_do_AOV + Δ_tương_tác
```

Và tách tiếp AOV vì **AOV = party_size × TA**:

```
Δ_do_party = (pax_act − pax_exp) × TA_exp × TC_exp      ← TC_PARTY
Δ_do_TA    = pax_exp × (TA_act − TA_exp) × TC_exp       ← AOV_QTY · AOV_VALUE
```

> **Luật đối chiếu đòn bẩy.** Chương trình khai `lever_primary = TC_PARTY` mà `Δ_do_party`
> gần 0 trong khi `Δ_do_TA` dương → **chương trình thắng nhờ lý do khác với giả thuyết**.
> Dashboard phải nói ra điều đó, không được im lặng ghi “ĐẠT”.

### 4.4 Chi phí và lợi nhuận — công thức của slide 8

```
cost_total       = DISCOUNT + GIFT_COGS + VOUCHER_REDEEM + ADS + KOL + PRINT + MERCH + AGENCY
                   ± PARTNER_SHARE

flow_through     = incr_net × cm_pct − cost_total        ← công thức PDF
roi_promo        = flow_through / cost_total
cost_per_incr_tc = cost_total / (TC_act − TC_exp)
```

### 4.5 Hai con số duyệt chương trình TRƯỚC khi chạy

```
breakeven_lift_pct = cost_total_planned / (expected_net × cm_pct)
breakeven_incr_tc  = cost_total_planned / (AOV_exp × cm_pct)
```

*“Chương trình này cần kéo doanh thu lên **ít nhất 14%** mới hoà vốn”* — một câu,
và phần lớn chương trình sẽ chết ngay ở đây trước khi tiêu đồng nào. Đây là giá trị
lớn nhất mà M7.2 mang lại, lớn hơn cả việc báo cáo sau khi chạy.

### 4.6 Đạt target

```
att_<metric> = actual / target        với metric ∈ {net, tc, aov, ta, incr_net}
```

| Nhãn | Điều kiện |
|---|---|
| 🟢 **ĐẠT** | `att_incr_net ≥ 100%` **và** `roi_promo > 0` |
| 🟡 **ĐẠT DOANH THU · LỖ** | `att_incr_net ≥ 100%` nhưng `roi_promo ≤ 0` — *bán được nhưng bán lỗ* |
| 🟠 **CHƯA ĐỦ CHÍN** | chạy < 14 ngày, hoặc `BURST` chưa kết thúc |
| 🔴 **KHÔNG ĐẠT** | `att_incr_net < 80%` và đã đủ 14 ngày |
| ⚪ **CHƯA ĐO ĐƯỢC** | thiếu `dim_campaign` / `campaign_target` / `no_control` |

> Ô 🟡 là ô quan trọng nhất của cả hệ thống. Chương trình giảm 50% gần như **luôn**
> đạt target doanh thu và gần như **luôn** lỗ. Một dashboard chỉ có 🟢/🔴 sẽ khen đúng
> những chương trình đang đốt tiền.

### 4.7 Ba rào chắn chống thổi phồng

| Rào chắn | Luật |
|---|---|
| **Độ chín 14 ngày** | Chương trình chạy < 14 ngày **không được** gắn nhãn KHÔNG ĐẠT |
| **Ăn thịt lẫn nhau** *(cannibalization)* | Nếu `net` của bill **không** gắn CTKM giảm trong cùng kỳ, phần giảm đó phải **trừ khỏi** `incr_net` |
| **Lệch mix biên LN** | `incr_net` cao nhưng `cm_pct` thực tế của giỏ hàng thấp hơn kế hoạch → cảnh báo. Bán thêm nước ngọt khác hẳn bán thêm sashimi |

---

## 5. Màn hình M7.2 *(đã dựng · `src/views/CampaignTrackingView.tsx` · menu `M7.2`)*

| Khối | Nội dung |
|---|---|
| **Băng DỮ LIỆU MẪU** | Hiện khi nguồn là `_MAU_…` — nói rõ số nào thật (POS) và số nào mẫu (target, chi phí khai tay) |
| **Hàng KPI** | Doanh thu CTKM · Hoá đơn · Guest · AOV · DT tăng thêm · Lãi thực thêm (ROI gộp, chi phí). Tổng chỉ cộng CT **đã chốt** — CT đang chạy là số tạm |
| **Chip trạng thái** | Lọc nhanh theo 7 nhãn `$campaign.labels` |
| **Scorecard** | Tên · kỳ · nhãn · 3 trục phân loại · **Lift + mức hoà vốn** · chi phí · lãi thực thêm/ROI · % đạt target cho Tăng thêm · Net · TC · AOV/TA |
| **Chi tiết 1 CT** | Giả thuyết · kỳ nền · đối chứng + hệ số mùa vụ · cảnh báo (chồng kỳ, store mới, tăng nhờ đòn bẩy khác giả thuyết, target nộp muộn) · bảng Target/Kỳ vọng/Thực tế · bóc chi phí · biểu đồ trước/trong/sau (vùng tô = kỳ chạy) · **waterfall Kỳ vọng → ΔTC → Δnhóm → ΔTA → tương tác → Thực tế** |
| **Timeline** | Gantt màu theo nhãn, viền đỏ = chồng kỳ; bấm để mở chi tiết |
| **Chi phí × ROI** | Bubble: x chi phí · y ROI · size tăng thêm · màu bản chất |
| **Lịch cửa sổ marketing** | Tháng × brand, số CT thương mại; cảnh báo khoảng trống > 14 ngày |
| **Chưa đo được · chưa đủ chín** | Lý do + việc cần làm cho từng CT |
| **Lỗi khai báo** | Từ `campaign_issue` — sửa ở L0 rồi chạy lại `CAP_NHAT.bat` |
| **CTKM trên POS chưa khai** | Tên CTKM có doanh thu nhưng chưa gắn chương trình — danh sách việc cho team brand |

**Luật nhãn đã chốt:** `CHUA_CHIN` = đợt BURST **đang chạy** (hoặc CT lặp < 2 lần). Đợt đã kết thúc
luôn được kết luận dù ngắn (8/3 chạy 3 ngày vẫn phải có ĐẠT/KHÔNG ĐẠT).

Khối "chưa đo được" không phải để trang trí. Hệ thống phải **tự khai ra phần nó chưa đo được**,
nếu không người đọc sẽ mặc định 100% đã được đo.

---

## 6. Lộ trình — 4 bước, xếp theo thứ tự phụ thuộc

| # | Việc | Kết quả mở khoá | Chặn bởi |
|---|---|---|---|
| **1** | ✅ **Sửa lỗi chiết khấu ①** — `disc` + `voucher` lấy ở cấp hoá đơn. T8/2026 ③ cũng đầy lại luôn | Chi phí ưu đãi **đúng** trên cả M7 và M7.2 | — |
| **2** | ✅ **Dựng `fact_promo_day`** trong `tools/build_month.py` — 6.501 dòng, T1→T9/2026 | Chi tiết ngày × store × CTKM → baseline & lift tính được | — |
| **2b** | ✅ **Sửa lỗi phân loại ②** — thêm nhãn `CARE`, đảo thứ tự luật SKG/nhân viên | COMMERCIAL hết bị thổi 8,6% | — |
| **2c** | ✅ **Engine + màn hình + update.py** — `tools/campaign.py`, `CampaignTrackingView`, tự chạy khi file S23 hoặc số tháng đổi | Chạy thử toàn tuyến trên 8 chương trình mẫu | — |
| **3** | ⬜ **Nạp `dim_campaign`** — 58 tên CTKM hiện có, gán đủ 4 trục nhãn | Toàn bộ khối phân loại · Timeline · Ma trận Lever | **team brand gõ tay** |
| **4** | ⬜ **Nạp `campaign_target` + `campaign_cost`** cho chương trình mới từ kỳ tới | Target vs Actual · ROI · Flow-Through · Breakeven | bước 3 + M5 gắn `campaign_id` |

Bước 2b cố ý để riêng: nó **đổi số trên màn hình M7 đang chạy** (chuyển 325,8 tr sang ô
khác), khác hẳn bước 1–2 chỉ sửa một con số vốn đã sai và thêm một bảng mới.

**Bước 3 là điểm chặn thật**: không ai ngoài
team brand biết `HAPPY TUESDAY` chạy từ ngày nào, ở store nào, ngân sách bao nhiêu,
đặt target gì. Dữ liệu đó **chưa từng tồn tại ở đâu** — không có trong POS, không có
trong Google Sheet, không có trong slide.

> **Chương trình chạy từ kỳ sau thì khai `dim_campaign` + `campaign_target` TRƯỚC khi chạy.**
> Chương trình đã chạy xong thì chỉ điền hồi tố được `dim_campaign` — target điền sau
> không còn giá trị kiểm chứng, phải để trống và hiển thị ⚪ CHƯA ĐO ĐƯỢC.

---

## 7. Phân vai lại M7 ↔ M7.2

| | M7 · Khuyến mãi & Cơ cấu chi phí | M7.2 · Promotion Tracking |
|---|---|---|
| Giữ nguyên | 4 bản chất *(+ CARE)* · doanh thu chạm · **chi phí ưu đãi đã sửa** · khối Aggregator | |
| Chuyển sang M7.2 | bảng Top 25 chương trình | → thay bằng **Campaign Scorecard** |
| Phạm vi số | cả 5 nature | **COMMERCIAL · LOYALTY · PARTNER×noire_share** |
| Người đọc | CFO · Kế toán · Ops | **Team Brand · CMO** |

---

## 8. Vận hành & khoảng trống còn lại *(rà cổng M7.2 · 17/09/2026)*

**Vận hành:** team brand điền `Campaign_Tracking_2026.xlsx` (copy từ `_MAU_…`, xoá 8 dòng mẫu) →
thả vào `L0_input/03_MARKETING/07_Campaign_Tracking/` → `CAP_NHAT.bat`. Hệ thống tự: kiểm lỗi khai báo,
đo lại mọi chương trình, dựng loader. Khi có file thật, file mẫu tự bị bỏ qua.

| # | Khoảng trống | Hệ quả trên màn | Ai xử lý |
|---|---|---|---|
| 1 | **Chưa có file khai báo thật** — đang chạy trên 8 CT mẫu (tên POS thật, target/chi phí khai tay là mẫu) | Băng DỮ LIỆU MẪU; KPI chỉ để duyệt khung | Team brand |
| 2 | **Độ phủ 18%** — 164 tên CTKM (4,86 tỷ doanh thu chạm) chưa gắn chương trình | Lịch cửa sổ marketing báo khoảng trống giả | Team brand khai `name_pos` |
| 3 | **Ads đặt tên theo mục tiêu, không theo chương trình** — chỉ ghép được qua `ads_match` gõ tay | Chi phí ads thiếu nếu không khai | Team Digital: đặt tên chiến dịch chứa `campaign_id` |
| 4 | **Giá vốn quà tặng** chưa tự tính (BOM phủ thấp) — phải khai tay `GIFT_COGS` | Chi phí tặng món bị thiếu | Team brand + Bếp |
| 5 | **Biên LN mặc định 65%** — COGS phủ thấp nên chưa lấy theo brand | Lợi nhuận thực thêm mang tính ước lượng | Tài chính: điền `cm_pct` từng CT |
| 6 | **CT chạy quanh năm / lặp từ trước khi có dữ liệu** (Happy Tuesday, Thursday Delight) | CHƯA ĐO ĐƯỢC | Tắt thử 1–2 tuần hoặc khai store đối chứng |
| 7 | **CT chồng kỳ cùng store** không tách được lift | Cảnh báo chồng kỳ | Lịch chạy so le |
| 8 | **Store mới mở < 90 ngày** — doanh thu tự tăng theo đà | Cảnh báo, lift dễ bị thổi phồng | — |
| 9 | **Target phải nộp TRƯỚC ngày chạy** (`submitted`) — nộp sau không được chấm ĐẠT | CHƯA CÓ TARGET | Team brand |
