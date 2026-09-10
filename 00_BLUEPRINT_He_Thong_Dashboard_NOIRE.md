# NOIRE ANALYTICS HUB — BLUEPRINT KIẾN TRÚC HỆ THỐNG

**Phiên bản:** v3.0 · 25/08/2026 *(v1.0 27/07 → v2.0 29/07 → v3.0 25/08)*
**Chủ sở hữu:** Quang Đại — Marketing / Data & Operations, Highgate F&B
**Phạm vi:** 3 brand (NCB · NDC · NJFB) · 17 module hợp nhất dashboard + báo cáo MKT tháng
**Trạng thái:** Khung kiến trúc — chốt trước khi code

> **Đọc theo thứ tự:** Phần 0–9 là nền v1.0 · Phần 10 là pre-analytics · Phần 11 là nâng cấp v2.0 khi có dữ liệu chi tiết món · **Phần 12 là bản hợp nhất v3.0 — đọc phần này trước nếu chỉ có thời gian đọc một phần.**

---

## PHẦN 0 — BỐN NGUYÊN TẮC THIẾT KẾ

Đây là 4 quy tắc chi phối toàn bộ hệ thống. Mọi quyết định kỹ thuật về sau phải kiểm tra ngược lại 4 điều này.

**NT1 — Raw là bất khả xâm phạm.**
File thô thả vào `L0` không bao giờ được sửa tay. Mọi làm sạch xảy ra trong code ở tầng L1/L2. Lý do: khi số liệu sai, phải truy được về nguồn gốc. Nếu sửa tay file raw, bạn mất khả năng tái lập và không ai biết số đã bị đổi lúc nào.

**NT2 — Một chỉ số chỉ được định nghĩa đúng một lần.**
TA, AOV, Lift, ROAS… chỉ tồn tại ở tầng L3. Không tab nào được tự tính lại. Lý do: hiện tại mỗi báo cáo tự tính một kiểu nên số không khớp nhau và không ai dám tin bảng nào.

**NT3 — Thêm dữ liệu không được đụng vào code.**
Mở store mới, thêm brand, thêm campaign → chỉ sửa **một dòng trong bảng dim**. Nếu phải mở code ra sửa thì thiết kế đã sai. Đây là điều kiện để hệ thống sống được sau 12 tháng.

**NT4 — Mọi con số trên dashboard phải bấm ra được dòng raw.**
Không có "số từ trên trời". Mỗi KPI phải trace được: KPI ← metric ← fact ← file nguồn + dòng nào.

---

## PHẦN 1 — KIẾN TRÚC 5 TẦNG

```
L0  INPUT      →  thả file thô, không sửa
L1  MAPPING    →  bảng master: chuẩn hoá tên, gắn brand, gắn kỳ, gắn KPI
L2  FACT       →  bảng sự kiện đã chuẩn hoá, mỗi bảng 1 grain rõ ràng
L3  METRIC     →  từ điển chỉ số, khoá cứng công thức
L4  OUTPUT     →  Overview + 4 module tab + Insight report
```

Luồng chạy một chiều, không có vòng ngược. Tầng dưới không bao giờ đọc lên tầng trên.

---

## PHẦN 2 — L0 · INPUT CONTRACT

Quy ước thả file. Nếu file đặt sai chỗ hoặc sai tên, pipeline sẽ báo lỗi rõ ràng thay vì âm thầm bỏ qua.

| Nguồn | Thư mục | Quy ước tên | Tần suất | Grain |
|---|---|---|---|---|
| POS doanh thu ngày | `L0_input/sales_daily/` | `YYYY-MM_daily.xlsx` | Hàng tuần | ngày × store |
| POS doanh thu tháng | `L0_input/sales_monthly/` | `YYYY-MM_revenue.xlsx` | Hàng tháng | tháng × store |
| Lead Tiệc | `L0_input/lead/` | `lead_YYYYMMDD.xlsx` | Hàng tuần | 1 lead |
| Voucher log | `L0_input/crm/` | giữ nguyên tên iPOS export | Hàng tuần | 1 voucher |
| Member CRM | `L0_input/crm/` | `member_actual_iPOS_CRM.xlsx` | Hàng tháng | 1 member |
| Meta Ads | `L0_input/ads/` | `YYYY-MM_report.xlsx` | Hàng tháng | campaign × kỳ |
| Target / Budget | `L0_input/target/` | `target_YYYY_Qn.xlsx` | Hàng quý | store × tháng |

**Quy tắc bắt buộc**

- File mới **không ghi đè** file cũ. Trùng tên → thêm hậu tố `_v2`. Pipeline luôn lấy bản mới nhất.
- Ba nguồn `sales_daily`, `sales_monthly` phải **đối soát nhau**: tổng ngày trong tháng = số tháng. Lệch > 0,5% → dừng, không cho chạy tiếp.
- Không xoá file cũ. Lịch sử là tài sản.

---

## PHẦN 3 — L1 · MAPPING (bảng master)

Đây là trái tim hệ thống. 4 bảng, sửa bằng tay, không sinh tự động.

### 3.1 `dim_store` — bảng quan trọng nhất

Đã dựng từ 100% tên store thật xuất hiện trong 18 file doanh thu 2025–2026.

| store_code | brand | Tên POS (alias — khớp chính xác) | tier | status | mở từ |
|---|---|---|---|---|---|
| `NCB_MET` | NCB | Noire Café & Bistro - The Mett | core | active | 2025-01 |
| `NCB_ET` | NCB | Noire Café & Bistro - Empress Tower | core | active | 2025-10 |
| `NCB_SKC` | NCB | Noire Café & **Lounge** - SKC | core | active | 2026-02 |
| `NDC_NTMK` | NDC | Noire Dining & Cafe - 39 Nguyễn Thị Minh Khai | flagship | active | 2025-10 |
| `NDC_BKL` | NDC | *(chưa có trong POS)* | flagship | **pending** | — |
| `NJFB_CRE` | NJFB | Noire Japanese Fusion & Bar␣␣- The Crest | core | active | 2026-04 |
| `NJFB_SSV` | NJFB | Noire Japanese Fusion & Bar - SSV | core | active | 2025-12 |
| `NCB_GW` | NCB | Noire Café & Bistro - Gateway | satellite | active | 2025-03 |
| `NCB_9ST` | NCB | Noire Café & Bistro - The 9 Stellars | satellite | active | 2025-03 |
| `NCB_NDC` | NCB | Noire Café & Bistro - Nguyễn Đình Chiểu | satellite | active | 2025-03 |
| `IFC_SIG` | *(khác)* | IFC Signature by Noire | popup | **closed** | 2026-02→04 |

**Ba cái bẫy đã phát hiện — bắt buộc xử lý ở tầng này:**

1. **SKC trong POS ghi là "Café & Lounge", không phải "Café & Bistro".** Nếu match brand bằng cách dò chữ trong tên, SKC sẽ bị rớt khỏi NCB → NCB mất ~785tr/tháng. Phải match bằng bảng alias, tuyệt đối không dò chuỗi.
2. **"Noire Japanese Fusion & Bar␣␣- The Crest" có HAI dấu cách** trước dấu gạch. Bắt buộc chuẩn hoá khoảng trắng trước khi so khớp.
3. **`IFC Signature by Noire`** là store không nằm trong 3 brand family (81tr T2 → 7tr T3 → 0 T4, đã dừng). Phải có `brand = OTHER` để không âm thầm cộng vào NCB làm sai tăng trưởng.

**Cột `tier` dùng để làm gì:** 3 store satellite (Gateway, 9 Stellars, NĐ Chiểu) chỉ đạt 6–30tr/tháng — bằng ~1% một core store. Nếu để chung, chúng làm loãng mọi chỉ số trung bình brand. Dashboard mặc định lọc `tier ∈ {flagship, core}`, có nút bật/tắt satellite.

**Cột `status` + `mở từ` dùng để làm gì:** chỉ có The Mett đủ 18 tháng lịch sử. Empress Tower mở 2025-10, SKC mở 2026-02, JFB Crest mở 2026-04. **Mọi so sánh YoY phải chạy chế độ same-store** (chỉ so store có mặt ở cả hai kỳ), nếu không tăng trưởng chain sẽ bị thổi phồng bởi store mới.

### 3.2 `dim_calendar`

Sinh tự động từ ngày. Cột: `date · week_iso · month · quarter · year · day_of_week · is_weekend · is_holiday_vn · same_period_ly`.

Chuẩn tuần dùng **ISO week (T2–CN)**. Cột `same_period_ly` xử lý lệch ngày trong tuần khi so YoY — quan trọng với F&B vì doanh thu cuối tuần cao gấp rưỡi ngày thường.

### 3.3 `dim_campaign` — nơi thực hiện "phân loại 3 nhóm"

Mỗi campaign được gắn đúng **một** `type`:

| type | Định nghĩa | Nguồn | KPI chính |
|---|---|---|---|
| `PROMOTION` | LTO, combo, giảm giá, merchandise | LTO Promotions + Meta Ads | Lift% · ROI |
| `CRM` | Voucher, loyalty, member, tích điểm | Voucher log + member iPOS | Redeem% · Retention |
| `LEAD` | Đẩy tiệc, banquet, event | Meta Ads + Lead Tiệc | CPL · Win% |
| `BRAND` | Awareness, không gắn ưu đãi | Meta Ads | Reach · CPM |

Cột: `campaign_id · campaign_name · type · brand · store_scope · date_from · date_to · budget · kpi_target`.

**Đây là bảng phải duy trì kỷ luật nhất.** Một campaign không được gắn 2 type. Nếu một chiến dịch vừa đẩy promotion vừa thu lead → tách thành 2 dòng với ngân sách chia rõ. Không làm được điều này thì mọi phép đo ROI về sau đều vô nghĩa.

### 3.4 `dim_target`

Từ `Noire Sales Target Q3 2026.xlsx` + KPI CRM + budget Ads. Grain: `store × tháng × loại_kpi`. Loại KPI: `net_sales`, `guest`, `ta`, `member_new`, `lead_count`, `ads_budget`.

---

## PHẦN 4 — L2 · FACT (bảng sự kiện)

Mỗi bảng một grain duy nhất, khai báo rõ ràng ngay đầu file. Đây là nơi phần lớn lỗi phân tích sinh ra nếu không kỷ luật.

### 4.1 `fact_sales` — grain: `date × store_code`

| Cột | Nguồn POS | Ghi chú |
|---|---|---|
| `guest` | Số khách | |
| `tc` | Số HĐ | số hoá đơn |
| `gross_sales` | Doanh thu Gross | |
| `disc_giamgia` | Giảm giá | |
| `disc_chietkhau` | Chiết khấu | |
| `voucher_value` | Phiếu GG | **KHÔNG trừ vào Net** |
| `commission` | Hoa hồng | chỉ The Mett có |
| `tax` | Thuế | **KHÔNG trừ vào Net** |
| `net_sales` | Doanh thu Net | |

**Công thức Net đã xác minh 100% trên 109 dòng dữ liệu 2025–2026:**

```
net_sales = gross_sales − disc_giamgia − disc_chietkhau − commission
```

Ban đầu công thức chỉ khớp 84%. Truy ra 17 dòng lệch **đều là The Mett**, và độ lệch **bằng đúng cột Hoa hồng** từng đồng. Sau khi thêm `− commission` thì khớp tuyệt đối. The Mett là store duy nhất có hoa hồng (mặt bằng trung tâm thương mại).

**Hệ quả quan trọng:** `Phiếu GG` và `Thuế` **không** bị trừ khỏi Net. Nghĩa là giá trị voucher đã dùng vẫn nằm nguyên trong doanh thu — đây chính là cầu nối để đo đóng góp thật của CRM sang doanh thu ở Module 3, mà không lo double-count.

**Quy tắc nạp bắt buộc:**
- Loại bỏ dòng `TỔNG:` (file T6.2026 có dòng tổng 19.428 khách / 4,93 tỷ — nạp nhầm sẽ nhân đôi toàn bộ số liệu).
- Store không có trong `dim_store` → **báo lỗi và dừng**, không tự động bỏ qua. Store mới phải được khai báo có ý thức.

### 4.2 `fact_lead` — grain: 1 lead (1 dòng inquiry)

Từ `DATA- SALE NOIRE- 2026 Lead Tiệc.xlsx` (~2.000 dòng, 39 cột).

Cột giữ lại: `lead_id · inquiry_date · event_date · outlet · area · event_type · guest_count · expected_revenue · actual_revenue · status · source · sales_rep`.

**Ba việc làm sạch bắt buộc:**
- `Number of Guests` đang là text (`"50 pax "`, `"100 pax"`) → parse ra số nguyên.
- `Expected Revenue` có ô rỗng → giữ `NULL`, **không điền 0**. Điền 0 sẽ kéo giá trị trung bình lead xuống sai.
- `Outlet` ghi `"NOIRE DINING"` → map về `NDC_NTMK` / `NDC_BKL` qua `dim_store`.

**Cột `Source` (MKT / Hotline / …) là tài sản lớn nhất của bảng này** — đây là nguồn duy nhất trong toàn hệ thống cho phép quy doanh thu thật về marketing.

### 4.3 `fact_crm` — grain: 1 voucher (issue/redeem)

Tái sử dụng pipeline `Dashboard_Voucher_NOIRE.py` đã có. Cột: `voucher_code · campaign_id · member_id · issue_date · redeem_date · store_code · bill_value · discount_value`.

### 4.4 `fact_ads` — grain: `campaign × ngày`

Tái sử dụng `etl_v4.py` trong `04 Marketing Campaigns/03 Digital Ads/Facebook Ads/Dashboard/`. Cột: `campaign_id · date · spend · reach · impression · click · message · result · objective`.

---

## PHẦN 5 — L3 · TỪ ĐIỂN CHỈ SỐ (KHOÁ CỨNG)

Đây là điều khoản hợp đồng của hệ thống. Đã chốt — mọi báo cáo NOIRE từ nay dùng đúng định nghĩa này.

### 5.1 Chỉ số doanh thu lõi

| Chỉ số | Công thức | Đơn vị | Ý nghĩa |
|---|---|---|---|
| **Net Sales** | `gross − giảm giá − chiết khấu − hoa hồng` | VNĐ | Doanh thu thực ghi nhận |
| **Guest** | `Σ số khách` | người | Lượt khách |
| **TC** | `Σ số hoá đơn` | hoá đơn | Transaction count |
| **TA** | `Net Sales ÷ Guest` | VNĐ/khách | **Chi tiêu bình quân đầu khách** |
| **AOV** | `Net Sales ÷ TC` | VNĐ/hoá đơn | **Giá trị bình quân hoá đơn** |
| **Party Size** | `Guest ÷ TC` | khách/bàn | Quy mô nhóm khách |
| **Discount %** | `(giảm giá + chiết khấu) ÷ gross` | % | Mức chiết khấu thực |
| **Voucher Load** | `phiếu GG ÷ gross` | % | Áp lực voucher lên doanh thu |

> ⚠️ **Lưu ý quy ước:** Định nghĩa TA/AOV của NOIRE **ngược với thông lệ phổ biến** trong ngành F&B quốc tế (nơi TA thường = Net/hoá đơn). Đây là lựa chọn có chủ đích và đã chốt. Mọi dashboard, báo cáo và tài liệu gửi ra ngoài **phải ghi rõ công thức bên cạnh tên chỉ số** để tránh hiểu nhầm khi làm việc với đối tác hoặc chủ đầu tư.

**Vì sao cần cả hai:** TA và AOV cùng nhau tách được đúng bản chất 3 brand. NCB đông khách chi ít, NJFB ít khách chi nhiều. Nhìn riêng một chỉ số sẽ ra kết luận sai. Party Size là chỉ số cảnh báo sớm: party size giảm mà TA giữ nguyên → khách đi ít người hơn, tín hiệu suy giảm nhóm/công ty.

### 5.2 Chỉ số so sánh

| Chỉ số | Công thức | Điều kiện |
|---|---|---|
| MoM % | `(kỳ này − kỳ trước) ÷ kỳ trước` | |
| YoY % | `(kỳ này − cùng kỳ năm trước) ÷ cùng kỳ` | **bắt buộc same-store** |
| Achv % | `Actual ÷ Target` | từ `dim_target` |
| Contribution % | `store ÷ tổng brand` | |
| Same-store growth | chỉ tính store có mặt cả 2 kỳ | mặc định BẬT |

### 5.3 Chỉ số marketing

| Chỉ số | Công thức | Module |
|---|---|---|
| **Lift %** | `(Net kỳ chạy − Net kỳ nền) ÷ Net kỳ nền` | M2 |
| **Kỳ nền (baseline)** | TB 4 tuần liền trước, cùng store, loại tuần lễ tết | M2 |
| **ROI Promotion** | `(Net tăng thêm − chi phí ưu đãi − chi phí ads) ÷ tổng chi phí` | M2 |
| **ROAS** | `Net quy được ÷ chi phí ads` | M2 |
| **Redeem %** | `voucher đã dùng ÷ voucher phát ra` | M3 |
| **Member Contribution** | `Net từ hoá đơn có member ÷ tổng Net` | M3 |
| **CPL** | `chi phí ads nhóm LEAD ÷ số lead` | M4 |
| **Win Rate** | `lead chốt ÷ tổng lead` | M4 |
| **Lead → Revenue** | `Σ actual revenue lead đã chốt` | M4 |
| **MKT Attribution** | `doanh thu lead có source = MKT` | M4 |

**Quy tắc chống thổi phồng:** Lift luôn phải so với **cùng store**, không so chain. Và phải kiểm tra store đối chứng (store không chạy campaign) trong cùng kỳ — nếu store đối chứng cũng tăng tương đương thì lift là do mùa vụ, không phải do campaign. Không có bước này, mọi báo cáo ROI đều là tự huyễn hoặc.

---

## PHẦN 6 — L4 · OUTPUT

Một file HTML tĩnh, mở bằng trình duyệt, không cần server. Cùng chuẩn với Ads Dashboard và Voucher Dashboard hiện có để về sau gộp thành một hub.

### Tab 0 — OVERVIEW

- **KPI card:** Net Sales · Guest · TC · TA · AOV — kèm MoM, YoY, Achv% vs target
- **Bộ lọc toàn cục:** Brand · Store · Kỳ (tuần/tháng/quý/năm) · bật-tắt satellite · bật-tắt same-store
- **Chart 1:** Đường Net Sales theo thời gian, tách 3 brand
- **Chart 2:** Cột chồng đóng góp doanh thu theo store
- **Chart 3:** Heatmap Net theo `store × tuần` — nhìn ra ngay store nào đang trượt
- **Chart 4:** Scatter TA × Guest, mỗi bong bóng một store, size = Net — bản đồ định vị 3 brand trên một hình
- **Bảng:** xếp hạng store theo Achv%, tô màu đỏ/vàng/xanh

### Tab M1 — SALES CORE

Bóc tách theo brand → store → kỳ. Waterfall Gross → Net (thấy rõ chiết khấu ăn bao nhiêu). Phân tích ngày trong tuần. Cảnh báo tự động: store nào có TA giảm 2 kỳ liên tiếp.

### Tab M2 — BRAND PROMOTION

Timeline campaign trên nền đường doanh thu. Bảng pre/during/post + lift + store đối chứng. Bảng xếp hạng ROI campaign. Ghép ngân sách Ads từ dashboard đã có.

### Tab M3 — CRM

Phễu: phát → dùng → doanh thu. Redeem% theo campaign và theo store. Tăng trưởng member. Đóng góp doanh thu từ member vs khách vãng lai. So sánh chi tiêu member vs non-member.

### Tab M4 — LEAD TIỆC

Phễu: inquiry → báo giá → chốt → doanh thu thực. Bóc theo `source` (MKT vs Hotline vs khác), theo `sales_rep`, theo `event_type`, theo outlet. Đường cong lead time (từ inquiry đến ngày sự kiện) để dự báo lấp đầy các tháng tới.

### Insight Report tự động

Không phải bảng số — là **kết luận**. Mỗi kỳ sinh ra:
1. Top 3 biến động bất thường (vượt ±1,5 độ lệch chuẩn so với xu hướng riêng của store đó)
2. Với mỗi biến động: bóc nguyên nhân theo cấu phần (do Guest hay do TA? do brand nào? do store nào?)
3. 3 hành động đề xuất kèm mức tác động ước tính

Xuất `.md` để đọc nhanh, `.xlsx` để gửi, `.pptx` khi cần trình bày.

---

## PHẦN 7 — VẬN HÀNH & KIỂM SOÁT CHẤT LƯỢNG

### Quy trình cập nhật (mục tiêu: dưới 5 phút)

```
1. Thả file mới vào đúng thư mục L0
2. Chạy:  python run_pipeline.py
3. Mở:    dashboard_noire.html
```

### 7 chốt kiểm tra tự động — pipeline dừng nếu fail

| # | Kiểm tra | Ngưỡng |
|---|---|---|
| 1 | Dòng `TỔNG` đã bị loại | bắt buộc |
| 2 | Mọi store khớp `dim_store` | 100% |
| 3 | `net = gross − giảm giá − chiết khấu − hoa hồng` | lệch < 1đ |
| 4 | Tổng ngày trong tháng = số tháng | lệch < 0,5% |
| 5 | Không trùng khoá `date × store` | 0 dòng trùng |
| 6 | Không có tháng bị thiếu trong chuỗi | cảnh báo |
| 7 | YoY chạy đúng chế độ same-store | bắt buộc |

Mỗi lần chạy sinh `qa_log_YYYYMMDD.txt` ghi lại toàn bộ kết quả kiểm tra. Đây là bằng chứng khi có ai chất vấn con số.

---

## PHẦN 8 — NHỮNG PHÁT HIỆN ĐÃ XÁC MINH TRÊN DATA THẬT

Tổng hợp từ quá trình quét 18 file doanh thu 2025–2026 (109 dòng store-tháng):

| # | Phát hiện | Bằng chứng | Ảnh hưởng |
|---|---|---|---|
| 1 | `net = gross − giảm giá − chiết khấu − hoa hồng` | 109/109 dòng khớp tuyệt đối | Khoá được công thức |
| 2 | Hoa hồng chỉ tồn tại ở The Mett | 17/17 dòng lệch đều là The Mett | Tránh sai 0,4–2tr/tháng |
| 3 | Phiếu GG & Thuế **không** trừ vào Net | kiểm chứng số học | Mở đường đo đóng góp CRM |
| 4 | SKC trong POS là "Café & **Lounge**" | tên POS thực tế | Nếu dò chuỗi, NCB mất ~785tr/tháng |
| 5 | JFB The Crest có **hai dấu cách** trong tên | tên POS thực tế | Join sẽ rớt nếu không chuẩn hoá |
| 6 | Chỉ The Mett có đủ 18 tháng lịch sử | ET từ 2025-10, SKC từ 2026-02, Crest từ 2026-04 | YoY bắt buộc same-store |
| 7 | `IFC Signature by Noire` — brand thứ 4, đã dừng | 81tr (T2) → 7tr (T3) → 0 (T4) | Phải tách khỏi NCB |
| 8 | 3 store satellite chỉ 6–30tr/tháng | Gateway, 9 Stellars, NĐ Chiểu | Làm loãng chỉ số TB nếu gộp |
| 9 | Gateway đang tăng gấp đôi | 13tr (T1) → 30tr (T5-T6.2026) | Đáng theo dõi riêng |
| 10 | NDC Berkley chưa có mặt trong POS | không xuất hiện ở file nào | Cần xác nhận nguồn dữ liệu |
| 11 | Dòng `TỔNG` nằm trong file raw | T6.2026: 19.428 khách / 4,93 tỷ | Nạp nhầm → nhân đôi toàn bộ |
| 12 | Lead Tiệc có cột `Source` (MKT/Hotline) | ~2.000 dòng | Nguồn attribution marketing duy nhất |

---

## PHẦN 9 — LỘ TRÌNH BUILD

| Giai đoạn | Nội dung | Kết quả bàn giao |
|---|---|---|
| **P0** *(xong)* | Blueprint kiến trúc — tài liệu này | Khung 5 tầng đã chốt |
| **P1** | L1 + L2: `dim_store`, `dim_calendar`, ETL `fact_sales` + 7 chốt QA | `fact_sales` sạch, có kiểm chứng |
| **P2** | L3 + Tab Overview + Tab M1 | Dashboard HTML chạy được, dùng ngay |
| **P3** | M4 Lead Tiệc (`dim_campaign` + `fact_lead`) | Phễu tiệc + attribution MKT |
| **P4** | M3 CRM — ghép pipeline voucher đã có | Đóng góp doanh thu từ member |
| **P5** | M2 Promotion — ghép Ads dashboard, mô hình lift | ROI campaign có store đối chứng |
| **P6** | Insight Report tự động + lịch chạy định kỳ | Báo cáo tự sinh mỗi kỳ |

**Ba việc cần xác nhận trước khi vào P1:**
1. Xin được file export **doanh thu theo ngày** từ iPOS (định dạng và độ dài lịch sử lấy được?)
2. Xác nhận **NDC Berkley** — đã vận hành chưa, doanh thu ghi nhận ở đâu?
3. Xác nhận `IFC Signature by Noire` đã đóng hẳn hay chỉ tạm dừng?

---

# PHẦN 10 — PRE-ANALYTICS NẰM Ở ĐÂU TRONG LOGIC

*(Bổ sung v1.1 — trả lời câu hỏi: quá trình phân tích số liệu quá khứ để ước tính hiệu quả plan promotion thuộc tầng nào)*

## 10.1 Kết luận kiến trúc

**Pre-analytics không phải một tầng mới trong chuỗi L0→L4. Nó là nhánh thứ hai của L3, và là vòng lặp khép kín hệ thống.**

Chuỗi L0→L4 là **mô tả** — trả lời "chuyện gì đã xảy ra". Pre-analytics là **dự báo** — trả lời "nếu chạy chương trình này thì sẽ ra sao". Hai nhánh này **dùng chung L1, L2, L3**, chỉ khác hướng thời gian:

```
                    ┌──► L4-A  OUTPUT ACTUAL      (nhìn lại)
L2 FACT ──► L3 ─────┤
                    └──► L3.5 BASELINE ENGINE
                              │
                              ▼
                         M2-PLAN  Pre-Analytics    (nhìn tới)
                              │
                              ▼
                         Cổng duyệt ROI ≥ 0
                              │
                              ▼
                         ghi vào dim_campaign + dim_target  (quay lại L1)
                              │
                              ▼
                         [campaign chạy]
                              │
                              ▼
                         M2-ACTUAL: đo lift thật vs store đối chứng
                              │
                              ▼
                         lib_benchmark  ──────┐
                                              │ HỌC LẠI
                              ┌───────────────┘
                              ▼
                         L3.5 BASELINE ENGINE  (vòng lặp đóng)
```

**Vì sao phải đặt như vậy, không đặt thành L5:** nếu pre-analytics là một tầng nối tiếp sau L4, nó sẽ đọc số đã được tổng hợp và mất chi tiết. Ước tính "TC khung sáng 7–11h tại NCB" **không thể** rút ra từ bảng tổng tháng ở L4 — phải đọc thẳng từ `fact_bill`/`fact_item` ở L2 qua L3. Đó là lý do nó là nhánh song song, không phải tầng nối tiếp.

## 10.2 Vấn đề của pre-analytics hiện tại

File `NOIRE_Promotion_Pre-Analysis_Q3_2026.xlsx` có cấu trúc rất tốt: 6 sheet theo loại chương trình (Combo-SetMenu · Discount · Gift-FOC · LTO-Item · Voucher-Loyalty · Activation-Merch), mỗi dòng chạy từ `Est. TC → Base Sales → Growth% → Target Sales → Net ex-VAT → COGS% → ROI → Net Contribution`, roll-up lên sheet Master. Logic đúng, không cần thiết kế lại.

**Điểm yếu duy nhất nằm ở đầu vào.** Chính bảng chú giải màu trong file đã tự thừa nhận: chữ xanh = *nhập tay từ plan*, xanh nền cam = *đề xuất do người phân tích tự đưa*, chữ đen = *công thức tự tính*. Ba biến quan trọng nhất — `Est. TC`, `Base Sales`, `Growth %` — đều là ô nhập tay.

Sheet `9. Thiếu dữ liệu & Đề xuất` trong chính file đó đã liệt kê chính xác vấn đề:

| Chương trình | Dữ liệu còn thiếu | Nguồn cần lấy |
|---|---|---|
| Bistro Power Breakfast | Est TC & Base Sales khung sáng | POS Fabi 7–11h |
| Weekend Brunch Club | Est TC & Base Sales 09–14h T7 | POS Fabi cuối tuần |
| Tất cả set menu | COGS% thực của set | Bếp / Cost control |
| Noire Passport (Voucher) | % incremental thật | A/B + control group |
| Tất cả CT discount cao | Đo incremental TC thực | A/B test trước roll-out |

**Toàn bộ danh sách này chính là những gì tầng L2/L3 sẽ cung cấp tự động.** Không phải thiếu năng lực phân tích — thiếu hạ tầng dữ liệu ở đúng độ chi tiết.

Hệ quả thực tế: sheet Master Q3 hiện có nhiều chương trình ROI âm (Bistro Power Breakfast −0,126 · Birthday Month −0,323). Đây là dấu hiệu tốt — pre-analytics đang làm đúng chức năng bộ lọc. Nhưng độ tin cậy của các con số âm đó phụ thuộc hoàn toàn vào `Growth%` gõ tay 10–20%. Nếu Growth% thật là 5%, danh sách chương trình nên loại bỏ sẽ dài hơn nhiều.

**Nhiệm vụ của hệ thống: biến ô xanh và ô cam thành ô đen.**

## 10.3 Bổ sung bắt buộc ở L2 — hai bảng fact mới

Đây là điều kiện cần. Không có hai bảng này thì pre-analytics vĩnh viễn phải nhập tay.

### `fact_bill` — grain: 1 hoá đơn

Nguồn: sheet `4. DATA_HoaDon` trong file báo cáo campaign (đã tồn tại, ~4.850 dòng chỉ riêng LTO Summer).

Cột: `bill_id · pos_id · store_code · date · giờ_vào · giờ_ra · số_khách · nguồn (tại chỗ/mang về) · khu_vực · bàn · tổng_tiền`.

**Mở ra:** phân tích theo khung giờ (daypart), thời gian ngồi bàn, hiệu suất khu vực/tầng, phân bố quy mô nhóm khách. Đây chính là thứ trả lời được "TC khung sáng 7–11h là bao nhiêu" mà sheet 9 đang thiếu.

### `fact_item` — grain: 1 dòng món trong hoá đơn

Nguồn: sheet `3. DATA_ChiTiet` (~15.550 dòng cho một campaign).

Cột: `bill_id · mã_hàng · tên_hàng · nhóm_món · loại_món (FOOD/BEVERAGE) · mã_combo · số_lượng · giá · PTTT`.

**Mở ra:** attach rate (bao nhiêu % hoá đơn có mua món LTO), product mix, phân tích ăn lẫn (cannibalization), doanh thu theo nhóm món.

### `dim_product` — bảng master sản phẩm

Nguồn: `02 Products/01 Menu Structure` + `02 Products/02 Costing BOM` (đã có ~11 file BOM).

Cột: `mã_hàng · tên_món · nhóm_món · loại_món · brand_áp_dụng · giá_bán · cost_bom · cogs_% · ngày_hiệu_lực`.

**Đây là bảng gỡ bỏ dòng "COGS% thực của set — nguồn: Bếp/Cost control" khỏi danh sách thiếu.** Lưu ý có `ngày_hiệu_lực` vì giá vốn thay đổi theo thời gian (BOM đã có nhiều phiên bản: 27.10 → 22.5 → 31.05).

## 10.4 L3.5 · BASELINE ENGINE — sáu đầu ra

Đây là module mới, nằm giữa L3 và pre-analytics. Nhận vào một **mô tả chương trình dự kiến** (brand · store scope · khung giờ · nhóm món · thời gian chạy · loại promotion), trả ra sáu con số:

| # | Đầu ra | Cách tính | Thay thế ô nhập tay nào |
|---|---|---|---|
| 1 | **Base TC / Guest / Net** | Run-rate của đúng store × đúng khung giờ × đúng ngày trong tuần, lấy trung vị 4–8 tuần gần nhất, loại kỳ bất thường | `Est. TC`, `Base Sales` |
| 2 | **Chỉ số mùa vụ** | Hệ số tháng và tuần rút từ 18 tháng lịch sử | hiệu chỉnh `Base Sales` |
| 3 | **Attach rate & mix** | Từ `fact_item`: tỷ lệ hoá đơn có mua nhóm món mục tiêu | ước lượng số suất bán |
| 4 | **COGS% thực** | Từ `dim_product`, bình quân gia quyền theo sản lượng thực | `COGS %` |
| 5 | **Uplift benchmark** | Từ `lib_benchmark`: lift thực tế của các campaign cùng loại × cùng brand đã chạy | **`Growth %`** |
| 6 | **Tỷ lệ ăn lẫn** | So sánh doanh thu nhóm món cũ trong kỳ chạy vs kỳ nền | phần "incremental thật" |

Đầu ra số 5 là mấu chốt của toàn bộ thiết kế. Thay vì gõ `Growth% = 15%` theo cảm tính, hệ thống trả lời: *"Gift-FOC tại NDC đã chạy 4 lần, lift thực tế trung vị 8,2%, khoảng 4–13%, mẫu nhỏ nên thận trọng."*

## 10.5 `lib_benchmark` — thư viện học

Bảng tích luỹ, mỗi campaign kết thúc ghi thêm một dòng. **Đây là tài sản dài hạn có giá trị nhất mà hệ thống tạo ra** — càng chạy lâu càng đắt giá, và không đối thủ nào sao chép được.

Cột: `campaign_id · type · brand · store_tier · duration · planned_growth% · **actual_lift%** · planned_roi · **actual_roi** · sai_số_dự_báo · ghi_chú_bối_cảnh`.

Truy vấn điển hình mà `lib_benchmark` phục vụ:
- Loại promotion nào cho lift ổn định nhất theo brand?
- Chương trình Discount có thực sự tạo TC tăng thêm, hay chỉ chuyển khách sang ngày rẻ hơn?
- Dự báo của chúng ta lệch bao nhiêu — có xu hướng lạc quan quá mức không?

Câu hỏi cuối quan trọng nhất. Sau 6–8 campaign, nếu sai số dự báo luôn dương (Plan > Actual), hệ thống sẽ tự động áp một hệ số hiệu chỉnh thận trọng vào mọi dự báo về sau.

## 10.6 Cổng duyệt — biến quy trình B4 thành tính năng hệ thống

Sheet 9 đã đề ra quy trình 4 bước, trong đó B4: *"Áp cổng duyệt: chỉ chạy CT có ROI ≥ 0 ở kịch bản thận trọng"*. Hệ thống sẽ tự động hoá bước này.

Mỗi chương trình phải chạy **ba kịch bản** trước khi được duyệt:

| Kịch bản | Growth% dùng | Ý nghĩa |
|---|---|---|
| Thận trọng | percentile 25 của benchmark | Sàn — ROI ở đây phải ≥ 0 |
| Cơ sở | trung vị benchmark | Kỳ vọng đưa vào target |
| Lạc quan | percentile 75 | Trần — dùng để tính upside |

Quy tắc duyệt: **ROI ở kịch bản thận trọng ≥ 0** thì được chạy. Ngoại lệ duy nhất là chương trình gắn nhãn `BRAND` (thuần nhận diện, ROI ghi "Branding" như `Score the Moment` −3,5tr) — nhóm này duyệt theo hạn mức ngân sách branding, không theo ROI.

Chương trình không qua cổng → trả về sửa cơ chế, không phải sửa con số dự báo.

## 10.7 Vị trí trong lộ trình build

Pre-analytics đòi hỏi `fact_bill` + `fact_item` + `dim_product`, tức nặng hơn M1 Sales. Nhưng `lib_benchmark` chỉ có giá trị sau khi đã đo được vài campaign. Vì vậy chèn vào lộ trình như sau:

| Giai đoạn | Bổ sung cho pre-analytics |
|---|---|
| **P1** | *(không đổi)* |
| **P2** | *(không đổi)* |
| **P2.5** | `fact_bill` + `fact_item` + `dim_product` — nạp từ file campaign report đã có |
| **P5** | M2-ACTUAL (đo lift) **và** M2-PLAN (pre-analytics) làm cùng lúc, dùng chung Baseline Engine |
| **P5.5** | `lib_benchmark` + cổng duyệt 3 kịch bản |

**Lưu ý về giai đoạn đầu:** khi `lib_benchmark` còn rỗng, Baseline Engine chưa có đầu ra số 5. Giai đoạn này pre-analytics vẫn nhập tay `Growth%` như hiện nay — **nhưng bốn đầu ra còn lại (Base TC, mùa vụ, attach rate, COGS thực) đã tự động ngay từ P2.5**. Chỉ riêng việc đó đã gỡ được 5/11 dòng trong danh sách "thiếu dữ liệu" của sheet 9.

**Cần xác nhận thêm:** file `DATA_ChiTiet` và `DATA_HoaDon` hiện chỉ có trong báo cáo campaign (giai đoạn LTO Summer 22/06–07/07/2026). Để dựng `fact_bill`/`fact_item` cho toàn bộ lịch sử, cần export thường xuyên hai báo cáo này từ POS Fabi — không chỉ khi chạy campaign.

> **CẬP NHẬT 29/07/2026 — điều kiện này đã được giải quyết.** Thư mục `05 Data Raw/01 Sales Revenue/Báo Cáo bán hàng 2026/` đã có file bán hàng chi tiết theo tháng, cập nhật định kỳ. Xem Phần 11.

---

# PHẦN 11 — NÂNG CẤP KIẾN TRÚC v2.0

*(29/07/2026 — sau khi có file “Báo cáo bán hàng” chi tiết theo tháng)*

## 11.1 Chuyện gì đã thay đổi

File `Báo cáo bán hàng tháng 1.2026.xlsx` — 26.396 dòng, 42 cột, grain **1 dòng = 1 món trong 1 hoá đơn** — không phải một nguồn phụ. **Nó là hạt nhân của toàn hệ thống.**

Toàn bộ những gì v1.0 phải chờ đợi, giờ đã có sẵn trong một file:

| v1.0 giả định | Thực tế sau khi có file này |
|---|---|
| `fact_item` chỉ có trong kỳ campaign LTO | Có đủ mọi tháng, cập nhật định kỳ |
| `fact_bill` phải xin export riêng | Rollup trực tiếp từ `fact_item` |
| Doanh thu chỉ có grain tháng | Có tới **từng phút** (cột `Giờ`) |
| Chưa có dữ liệu sản phẩm | **605 SKU · 76 nhóm món · 7 loại món** |
| Chưa gắn được campaign vào doanh thu | Cột **`Tên CTKM` + `Mã voucher` nằm ngay trên từng dòng bán** |
| Chưa nhận diện được khách | Có **`Tên khách` + `Số điện thoại`** |

**Hệ quả kiến trúc — đảo vai trò:**

```
v1.0:  fact_sales (tháng)  →  nguồn chính
v2.0:  fact_item (dòng món) → nguồn chính, nguyên tử
         └→ fact_bill        (gộp theo Mã hoá đơn)
              └→ fact_sales_daily
                   └→ fact_sales_monthly  →  chuyển thành nguồn ĐỐI SOÁT
```

Báo cáo tháng không còn là nơi lấy số — nó trở thành **thước đo kiểm chứng** để bắt lỗi ETL.

## 11.2 Kết quả đối soát — đã kiểm chứng

Dựng thử `fact_bill` từ file chi tiết rồi so với `revenue-report` tháng 1/2026:

| Chỉ tiêu | Từ file chi tiết | Báo cáo tháng | Lệch |
|---|---|---|---|
| Số bill — NDC 39 NTMK | 2.440 | 2.440 | **0** |
| Số khách — NDC 39 NTMK | 5.980 | 5.980 | **0** |
| Số bill — NCB The Mett | 3.437 | 3.437 | **0** |
| Số khách — NCB The Mett | 5.640 | 5.640 | **0** |
| Chiết khấu · Hoa hồng · Phiếu GG | khớp tuyệt đối cả 2 store | | **0** |
| **`Tổng tiền` (cột 39)** — The Mett | 856.622.250 | Net 856.622.250 | **0** |

**Phát hiện quan trọng nhất: cột `Tổng tiền` chính là `Doanh thu Net`.** Không phải `Thành tiền`, không phải `Tổng tiền (không bao gồm VAT)`. Đây là mapping bắt buộc phải khoá — chọn nhầm cột sẽ lệch 5–12%.

**Hai điểm cần xử lý:**

1. **Dòng `Tổng` lại xuất hiện** — 1 dòng duy nhất chứa 3.938.370.152đ và 32.881 suất. Đúng cái bẫy của file tháng. Không loại → nhân đôi toàn bộ. *(Trước khi loại, nhóm món “–” chiếm 80% doanh thu; sau khi loại còn 0 dòng — bằng chứng dòng này là thủ phạm.)*
2. **Giảm giá tại The Mett lệch −828.000đ** (2.867.750 vs 3.695.750). Các cột khác khớp tuyệt đối nên nhiều khả năng là chiết khấu ghi ở cấp hoá đơn chưa phân bổ xuống dòng món. Cần xác minh với kế toán trước khi chốt ETL.

## 11.3 Mười lỗ hổng tư duy trong v1.0

Câu hỏi “còn thiếu tư duy gì” là câu hỏi đúng. Rà lại theo chuẩn vận hành F&B, v1.0 thiếu 10 điểm — trong đó 3 điểm đầu là thiếu nghiêm trọng.

### ❶ Không có tầng CHI PHÍ *(nghiêm trọng)*

v1.0 dừng ở Net Sales. Nhưng **“hiệu quả kinh doanh” là lợi nhuận, không phải doanh thu.** Một dashboard chỉ đo doanh thu sẽ báo “tăng trưởng tốt” trong đúng giai đoạn biên lợi nhuận đang bị bào mòn — đây là kịch bản có thật và rất phổ biến.

Cần bổ sung: COGS (từ BOM) · chi phí nhân sự · mặt bằng · marketing → **Prime Cost %** (COGS + Labor, chuẩn ngành nên ≤ 60–65%) · **Contribution Margin** từng món · lãi gộp theo store.

### ❷ Không có MENU ENGINEERING *(nghiêm trọng)*

Đây là công cụ số một của ngành F&B mà v1.0 hoàn toàn không có. Ma trận hai trục — **độ phổ biến × biên lợi nhuận** — chia menu thành 4 nhóm:

| Nhóm | Đặc điểm | Hành động |
|---|---|---|
| **Star** | Bán chạy, lãi cao | Giữ nguyên, đẩy mạnh, đặt vị trí đẹp trên menu |
| **Plow-horse** | Bán chạy, lãi thấp | Tăng giá nhẹ hoặc giảm giá vốn — **cẩn trọng, đây là món kéo khách** |
| **Puzzle** | Lãi cao, bán chậm | Đổi tên, đổi mô tả, huấn luyện nhân viên gợi ý |
| **Dog** | Bán chậm, lãi thấp | Cắt khỏi menu |

Yêu cầu “top bán chạy, top bán chậm” của bạn nằm ở đây — nhưng ma trận đi xa hơn danh sách xếp hạng. **Bán chạy mà lãi thấp là cái bẫy nguy hiểm nhất trong F&B**, và bảng top-seller đơn thuần không bao giờ chỉ ra được điều đó.

Số liệu T1/2026 đã cho thấy vấn đề rõ ràng:
- **221/605 SKU (37%) bán dưới 10 suất/tháng**, tổng cộng chỉ đóng góp **6,4% doanh thu** → menu phình quá mức, kéo theo chi phí kho, hao hụt, huấn luyện, thời gian order.
- **20% SKU đầu tạo 70,2% doanh thu** — quy luật Pareto đúng gần như tuyệt đối.
- Top 10 bán chạy **toàn bộ là BEVERAGE** (Long Black 891 suất dẫn đầu), không có một món FOOD nào.

### ❸ Không có CÔNG SUẤT & NĂNG SUẤT *(nghiêm trọng)*

F&B là ngành **bán công suất theo thời gian** — chỗ ngồi trống lúc 15h không bao giờ bán lại được. v1.0 không có chỉ số nào về mặt này.

Cần: vòng quay bàn · doanh thu/chỗ ngồi · doanh thu/giờ lao động · tỷ lệ lấp đầy theo khung giờ × khu vực. Dữ liệu đã sẵn: **217 bàn · 18 khu vực · giờ chính xác tới phút**.

Bức tranh khung giờ T1/2026:

| Khung giờ | Số bill | Doanh thu | Tỷ trọng |
|---|---|---|---|
| Sáng ≤10h | 1.900 | 421,7tr | 10,7% |
| **Trưa 11–14h** | 3.108 | **1.300,5tr** | **33,0%** |
| Chiều 15–17h | 1.520 | 545,9tr | 13,9% |
| **Tối 18–21h** | 1.722 | **1.206,4tr** | **30,6%** |
| Khuya 22h+ | 215 | 463,9tr | 11,8% |

Trưa + Tối = 63,6% doanh thu. **Sáng và chiều là hai vùng trũng.** Riêng khung khuya: chỉ 215 bill nhưng tạo 11,8% doanh thu — AOV cao vượt trội, đây là đặc trưng NJFB và là cơ hội chưa khai thác hết.

### ❹ Không tách BẢN CHẤT CHIẾT KHẤU

Phát hiện có tác động lớn nhất tới độ chính xác báo cáo marketing. 48 CTKM trong tháng 1, phủ 34,3% doanh thu. Nhưng chúng **không cùng bản chất**:

| Bản chất | Ví dụ thực tế trong data | Doanh thu T1 |
|---|---|---|
| **INTERNAL** — nội bộ | CHAIRMAN AND FAMILY 30% · DIRECTORS AND MANAGERS 25% | **483,9tr** |
| **PARTNER** — đối tác/toà nhà | SKG Members 20% · GIẢM GIÁ 50% SKG-NOIRE SSV · RESIDENTS S OFFERS | ~320tr |
| **LOYALTY** — hạng thành viên | Hạng Black Diamond · Hạng Silver · Giảm 15% Thẻ VIP | ~82tr |
| **COMMERCIAL** — marketing thật | HAPPY TUESDAY · NOIRE THURSDAY DELIGHT | ~195tr |

**483,9tr chiết khấu nội bộ = 12,3% doanh thu tháng.** Nếu gộp chung vào “hiệu quả khuyến mãi”, mọi con số ROI marketing đều sai nghiêm trọng — và sai theo hướng làm marketing trông tệ hơn thực tế.

→ `dim_campaign` bắt buộc thêm cột **`nature`**: `COMMERCIAL` · `INTERNAL` · `PARTNER` · `LOYALTY`. Chỉ nhóm COMMERCIAL mới được đưa vào tính ROI marketing. INTERNAL là khoản mục P&L, không phải chiến dịch.

### ❺ Không có KÊNH BÁN

`Nguồn` phân biệt: TẠI CHỖ 93,7% · MANG VỀ 3,9% · CORPORATE 2,3% · GRAB 0,2%. Các kênh có **cấu trúc biên hoàn toàn khác nhau** — Grab thu chiết khấu 20–25%, nên doanh thu Grab tăng có thể làm giảm lợi nhuận tuyệt đối. Phải theo dõi riêng biên từng kênh, không gộp.

### ❻ Không có KHÁCH HÀNG & TỶ LỆ QUAY LẠI

Chỉ số sống còn của F&B không phải doanh thu mà là **tỷ lệ khách quay lại**. Data hiện có: `Tên khách` + `Số điện thoại`.

Nhưng đây cũng là điểm nghẽn lớn nhất: **chỉ 814/8.465 bill có SĐT — 9,6%**. Trong 279 khách nhận diện được thì 46% quay lại từ 2 lần trở lên, cá biệt có khách 25 lượt/tháng. Tín hiệu tốt, nhưng mẫu quá nhỏ để kết luận. **Nâng tỷ lệ nhận diện lên 30–40% là dự án riêng, và là điều kiện tiên quyết để module CRM có ý nghĩa.**

### ❼ Không có GIÁ & THỰC THU

Có đủ `Giá` · `Giá bán` · `Thành tiền`. **40,4% số dòng có `Giá` ≠ `Giá bán`** — tức gần một nửa lượng bán ra đang không thu đúng giá niêm yết. Cần chỉ số **Price Realization = Thành tiền ÷ (Giá × Số lượng)** để theo dõi xói mòn giá theo thời gian và theo store.

### ❽ Không có NĂNG SUẤT NHÂN VIÊN

39 nhân viên, tên gắn trên từng dòng bán. Chênh lệch rất lớn: người dẫn đầu 701tr, người thứ 5 chỉ 270tr. Cần: doanh thu/nhân viên · AOV/nhân viên · tỷ lệ gợi ý bán thêm. Đây là đòn bẩy tăng doanh thu **không tốn đồng ngân sách marketing nào**.

### ❾ Không có RỔ HÀNG (basket)

Chỉ 5,3% số dòng thuộc combo, nhưng có tới **420 mã combo** — combo đang phân mảnh nghiêm trọng. Cần: số món/bill · tỷ lệ gắn kèm đồ ăn ↔ đồ uống · cặp món hay đi cùng nhau. Đây là nền tảng thiết kế combo mới và kịch bản gợi ý bán thêm.

### ❿ Dừng ở MÔ TẢ, chưa tới QUYẾT ĐỊNH

v1.0 kết thúc bằng biểu đồ. Một hệ thống phục vụ kinh doanh phải kết thúc bằng **bốn quyết định cụ thể**, mỗi quyết định kèm số tiền ước tính:

1. Cắt món nào khỏi menu → tiết kiệm bao nhiêu chi phí vận hành
2. Tăng giá món nào, mức bao nhiêu → thêm bao nhiêu lợi nhuận
3. Thêm/bớt người ca nào → tiết kiệm bao nhiêu chi phí nhân sự
4. Dồn marketing vào store/khung giờ nào → thêm bao nhiêu doanh thu

## 11.4 Khung tư duy v2.0 — sáu câu hỏi kinh doanh

Thay vì gom theo “nguồn dữ liệu” như v1.0, hệ thống gom theo **câu hỏi mà người điều hành cần trả lời**:

| # | Câu hỏi | Module | Trạng thái |
|---|---|---|---|
| ① | Bán được bao nhiêu? | **M1 · Doanh thu &amp; Tăng trưởng** | có ở v1 |
| ② | Bán món gì, món nào đáng bán? | **M2 · Menu &amp; Biên lợi nhuận** | **MỚI** |
| ③ | Bán lúc nào, ở đâu, qua kênh nào? | **M3 · Công suất &amp; Kênh** | **MỚI** |
| ④ | Bán cho ai, họ có quay lại? | **M4 · Khách hàng &amp; CRM** | mở rộng |
| ⑤ | Bán bằng cách nào, tốn bao nhiêu? | **M5 · Khuyến mãi &amp; Marketing** | mở rộng |
| ⑥ | Mảng tiệc ra sao? | **M6 · Lead Tiệc** | có ở v1 |

Cộng thêm **M0 Overview** ở đầu và **M7 Insight &amp; Quyết định** ở cuối.

## 11.5 Bổ sung tầng L1 và L2

**Bảng dim mới:**

| Bảng | Nguồn | Ghi chú |
|---|---|---|
| `dim_product` | 605 SKU từ file bán hàng + BOM | thêm `cogs`, `cm`, `menu_class` (Star/Plowhorse/Puzzle/Dog) |
| `dim_channel` | cột `Nguồn` | thêm `commission_%` — Grab 20–25% |
| `dim_zone_table` | 18 khu vực · 217 bàn | thêm `số chỗ ngồi` để tính vòng quay |
| `dim_staff` | 39 nhân viên | thêm ca làm, vị trí |
| `dim_cost` | kế toán | nhân sự · mặt bằng · vận hành theo store × tháng |

`dim_campaign` bổ sung cột **`nature`** như mục ❹.

**Bảng fact mới:**

- `fact_item` — hạt nhân, 1 dòng = 1 món trong 1 hoá đơn
- `fact_bill` — gộp theo `Mã hoá đơn`
- `fact_cost` — chi phí theo store × tháng

## 11.6 Chỉ số bổ sung ở L3

**Nhóm biên lợi nhuận**

| Chỉ số | Công thức |
|---|---|
| COGS % | giá vốn ÷ doanh thu |
| Contribution Margin / món | giá bán − giá vốn |
| CM % | CM ÷ giá bán |
| Prime Cost % | (COGS + nhân sự) ÷ doanh thu — chuẩn ngành ≤ 60–65% |
| Menu Class | vị trí trên ma trận độ phổ biến × biên lợi nhuận |

**Nhóm công suất**

| Chỉ số | Công thức |
|---|---|
| Vòng quay bàn | số bill ÷ số bàn ÷ số ngày |
| Doanh thu / chỗ ngồi | Net ÷ tổng chỗ ngồi |
| Tỷ lệ lấp đầy | bàn có khách ÷ tổng bàn, theo khung giờ |
| Doanh thu / giờ lao động | Net ÷ tổng giờ công |

**Nhóm chất lượng doanh thu**

| Chỉ số | Công thức |
|---|---|
| Price Realization | Thành tiền ÷ (Giá × Số lượng) |
| Discount by nature | tách 4 nhóm COMMERCIAL/INTERNAL/PARTNER/LOYALTY |
| Repeat Rate | khách ≥2 lượt ÷ tổng khách nhận diện |
| Identification Rate | bill có SĐT ÷ tổng bill — **hiện 9,6%** |
| Items per Bill | số dòng ÷ số bill |
| Attach Rate | % bill có cả đồ ăn và đồ uống |

## 11.7 Lộ trình cập nhật

| GĐ | Nội dung | Thay đổi so với v1 |
|---|---|---|
| **P1** | `dim_store` · `dim_calendar` · ETL `fact_item` + `fact_bill` + 8 chốt QA | **Đổi trọng tâm sang `fact_item`** |
| **P2** | L3 metric · M0 Overview · M1 Doanh thu | như cũ |
| **P3** | `dim_product` + BOM → **M2 Menu &amp; Biên lợi nhuận** | **mới, ưu tiên cao** |
| **P4** | `dim_zone_table` + `dim_channel` → **M3 Công suất &amp; Kênh** | **mới** |
| **P5** | `dim_campaign.nature` → M5 Khuyến mãi + Pre-Analytics | mở rộng |
| **P6** | M4 CRM — song song dự án nâng tỷ lệ nhận diện khách | phụ thuộc dữ liệu |
| **P7** | M6 Lead Tiệc | như cũ |
| **P8** | `dim_cost` + `fact_cost` → M7 Insight &amp; Quyết định | **mới** |

**Ba việc cần xác nhận:**

1. Lệch **828.000đ** ở cột Giảm giá của The Mett — chiết khấu cấp hoá đơn có được phân bổ xuống dòng món không?
2. Có lấy được **file bán hàng chi tiết của các tháng trước** (T2–T6/2026 và 2025) không? Có đủ lịch sử thì mọi phân tích mùa vụ và benchmark mới chạy được.
3. **Số chỗ ngồi từng khu vực/bàn** — cần để tính vòng quay bàn và doanh thu trên chỗ ngồi.

> **CẬP NHẬT 25/08/2026:** việc ❷ đã xong — đã có đủ **T1–T8/2026** cả file bán hàng chi tiết lẫn bảng kê hoá đơn. Việc ❸ vẫn treo. Xem Phần 12.

---

# PHẦN 12 — v3.0 · HỆ THỐNG BÁO CÁO MASTER

*(25/08/2026 — hợp nhất Analytics Hub với Báo cáo MKT tháng)*

## 12.1 Ý tưởng cốt lõi của v3.0

Hiện tại NOIRE đang vận hành **hai hệ thống tách rời**:

- **Analytics Hub** (v1–v2) — dashboard liên tục, dựng từ dữ liệu POS
- **Báo cáo MKT tháng** — file Excel 17 sheet + deck 24 slide, dựng bằng tay từ hàng chục nguồn, 10 team cùng điền

Hai thứ này đo cùng một doanh nghiệp, dùng cùng một tập số, nhưng chạy hai đường khác nhau. Đó là lý do mỗi tháng phải làm lại từ đầu, và là lý do **team chỉ điền 5/17 sheet — 12 sheet còn lại phải đi lấy từ nguồn gốc**.

**Nguyên tắc thứ năm của hệ thống:**

> **NT5 — Báo cáo tháng là một OUTPUT của hệ thống, không phải một quy trình riêng.**
> Mọi con số trong báo cáo tháng phải được hệ thống sinh ra tự động từ L2/L3. Con người chỉ điền những gì máy không thể biết: nhận định, bối cảnh, và các hạng mục chưa có nguồn dữ liệu số.

Điều này đảo ngược cách làm hiện tại. Thay vì *thu thập → tổng hợp → báo cáo*, quy trình mới là *hệ thống luôn sẵn số → cuối tháng bấm xuất → người viết nhận định*.

## 12.2 Kho dữ liệu hiện có — đã kiểm kê

Tính đến 25/08/2026, đây là toàn bộ dữ liệu đã nằm trong hệ thống:

| Tầng | Nguồn | Grain | Phạm vi | Trạng thái |
|---|---|---|---|---|
| `fact_item` | `2. Báo Cáo bán hàng 2026/` | 1 dòng món | **T1–T8/2026** | ✅ đủ 8 tháng |
| `fact_bill` | `1. Bảng Kê HD 2026/accounting_sale` | 1 hoá đơn · 34 cột | **T1–T8/2026** | ✅ đủ 8 tháng |
| `fact_sales_daily` | `revenue-report-group-by-date T1-T7` | ngày × store | T1–T7 + T8 riêng | ✅ 2.375 dòng |
| `fact_sales_monthly` | `Doanh thu 2025/` + `2026/` | tháng × store | 2025-01 → 2026-08 | ✅ đối soát |
| `dim_product` | `NOIRE_COGS_CHUAN_ALL_BRANDS` | 1 món | 451 dòng · 323 mã | ⚠️ phủ 45,8% DT |
| `fact_crm` | `2. Data Khách Hàng CRM/` (2 file) | 1 SĐT khách | snapshot 19/08 | ✅ có |
| `fact_voucher` | `exportVoucherLogOfCampaign_*` | 1 voucher | nhiều campaign | ✅ có |
| `fact_lead` | `DATA-SALE NOIRE Lead Tiệc` | 1 lead | 2026 | ✅ ~2.000 dòng |
| `fact_ads` | FB Ads Master + raw report | campaign × tháng | T1–T7 | ✅ chỉ Meta |
| `dim_target` | `Sales Target Q3` + `Phân bổ Ngân sách Q3` | store × tháng | Q3 | ✅ có |
| Báo cáo tháng | `NOIRE_Bao_Cao_MKT_T7-update.xlsx` | tháng | T7 · 17 sheet | ⚠️ 5/17 điền |
| Cache ETL | `_cache_csv/ITEM__T1-T8`, `BILL__T1-T8` | — | — | ✅ đã dựng |

**Điểm đáng chú ý:** `accounting_sale` (bảng kê hoá đơn, 34 cột) là nguồn `fact_bill` hoàn chỉnh — có `Giờ vào` và `Giờ ra`, tức tính được **thời gian ngồi bàn**, chỉ số then chốt của vòng quay bàn. Cùng với `Bàn`, `Khu vực`, `Nguồn`, `PTTT`, `Số khách`, `Nhân viên`.

**Bẫy mới:** `accounting_sale` cũng có dòng tổng trá hình — dòng đầu mỗi cửa hàng ghi `TẠI CHỖ` ở cột `Mã hoá đơn` và chứa số cộng dồn (1,21 tỷ ở NJFB T7). Đây là bẫy thứ ba cùng loại, sau dòng `TỔNG` ở file tháng và file bán hàng chi tiết. **Cả ba nguồn đều có dòng tổng nằm lẫn trong dữ liệu.**

## 12.3 Phát hiện chặn đường: COGS chỉ phủ 45,8% doanh thu

Đây là kết quả kiểm tra join giữa `fact_item` T7 và bảng COGS chuẩn — và là **điểm chặn lớn nhất của toàn bộ tầng biên lợi nhuận**.

| Cách join | Dòng khớp | Doanh thu khớp |
|---|---|---|
| ① Trực tiếp theo `Mã hàng` | 48,9% | 40,7% |
| ② + bỏ hậu tố cửa hàng (MK/ET/SSV…) | 54,8% | 44,9% |
| ③ + khớp thêm bằng `Tên món` | **56,2%** | **45,8%** |

**Con số thật:** bảng COGS có 451 dòng nhưng chỉ **323 mã món duy nhất** (NCB và NDC dùng chung nhiều món nên bị đếm hai lần). Trong khi `fact_item` T7 có **632 SKU** thực bán. Nghĩa là **398 SKU — tương đương 2,83 tỷ đồng, 54,2% doanh thu tháng — không có giá vốn.**

Nhóm thiếu tập trung rõ rệt:

| Nhóm thiếu | Ví dụ | Doanh thu T7 |
|---|---|---|
| **Món Nhật (NJFB)** | Tataki bò Wagyu · Sashimi Mizu/Sato/Sakura · Cơm cuộn Lươn · Chawanmushi | ~500tr |
| **Combo** | COMBO-23UR Vietnamese Corner · COMBO-2W2D Bistro Power Lunch | ~94tr |
| **Dịch vụ / phụ thu** | FINGER FOOD PACKAGE · Phí đặt phòng họp | ~140tr |
| **Đồ uống thông dụng** | La Vie 400ml · Trà Xoài Macchiato · Iced Matcha Latte · Bubble Cream | ~245tr |

Bảng COGS ghi NJFB chỉ có 108 món, trong khi thực đơn NJFB có hàng trăm món sashimi/sushi. **Đây không phải lỗi mapping — là thiếu dữ liệu gốc.**

**Chất lượng phần đã có cũng cần rà:** bảng tự đánh dấu `CẦN RÀ SOÁT` — 44 món COGS > 45%, và **2 món có giá vốn ≥ 100% giá bán chưa VAT, tức đang bán lỗ**: `Bicolor Chocolate Ribbon` (cost 34.000đ / giá 33.766đ = **100,7%**), `Pain Suisse` 80,0%, `Garlic & Cheese Croissant` 77,0%, `Pain Au Chocolate` 74,0%. Cả nhóm Bakery đều ở mức giá vốn rất cao — cần Bếp và Cost control xác nhận đây là số thật hay lỗi nhập.

**Hệ quả với thiết kế:** module M2 Menu & Biên lợi nhuận **không được phép chạy trên 45,8% doanh thu rồi trình bày như thể là toàn bộ**. Hệ thống phải:

1. Hiển thị **độ phủ COGS** ngay cạnh mọi chỉ số biên lợi nhuận (ví dụ: *"CM% tính trên 45,8% doanh thu — 398 SKU chưa có giá vốn"*)
2. Ma trận Menu Engineering chỉ vẽ các món có COGS, phần còn lại đưa vào ô **"chưa xếp hạng được"**
3. Không tính Prime Cost toàn chuỗi cho tới khi độ phủ ≥ 90%

Đây chính là bài học đã ghi ở lần dựng slide Product & Menu: *mọi chỉ số lên báo cáo phải trỏ được về một ô cụ thể trong file nguồn, hoặc là phép tính nêu rõ công thức và cỡ mẫu.*

## 12.4 Bản đồ 17 module — hợp nhất dashboard và báo cáo tháng

Cấu trúc v3.0 gộp 6 câu hỏi kinh doanh của v2.0 với 17 sheet của báo cáo MKT tháng, chia làm 4 khối.

### KHỐI 0 — VẬN HÀNH DỮ LIỆU *(L0–L2)*

| Module | Nội dung | Nguồn |
|---|---|---|
| **D1 · Kho dữ liệu &amp; trạng thái nạp** | 12 nguồn, kỳ mới nhất, số dòng, đối soát 3 tầng | quét `L0_input/` |
| **D2 · Bảng master (dim)** | 10 bảng dim, sửa tay | nhập tay |
| **D3 · QA &amp; Sổ thiếu dữ liệu** | 9 chốt kiểm tra + gap register | `qa_log` |

### KHỐI I — KẾT QUẢ KINH DOANH

| Module | Câu hỏi | Sheet báo cáo tương ứng |
|---|---|---|
| **M0 · Scorecard** | Tổng thể đang ở đâu so với kế hoạch? | `SCORECARD` |
| **M1 · Doanh thu &amp; Tăng trưởng** | Bán được bao nhiêu? | `Business-Data` |
| **M2 · Menu &amp; Biên lợi nhuận** | Món nào đáng bán? | `Product-Promotion` (khối C3) |
| **M3 · Công suất &amp; Kênh** | Bán lúc nào, ở đâu, qua kênh nào? | *(mục mới — chưa có sheet)* |

### KHỐI II — HOẠT ĐỘNG MARKETING

| Module | Nội dung | Sheet báo cáo |
|---|---|---|
| **M4 · Digital Ads** | Meta · Google · Zalo — chi phí, tin nhắn, Ad Cost Ratio | `Digital-Ads` |
| **M5 · Content &amp; Social** | Organic 3 brand — bài đăng, tiếp cận, tương tác | `Content (NCB/NDC/NJFB)` |
| **M6 · Branding &amp; POSM** | Hạng mục nhận diện, tiến độ đúng hạn | `Branding` |
| **M7 · Khuyến mãi &amp; LTO** | Chương trình theo 4 bản chất, lift, chi phí ưu đãi | `Product-Promotion` |
| **M8 · CRM · Loyalty · Zalo OA** | Thành viên, voucher, hạng, OA | `CRM` |
| **M9 · Aggregator &amp; Partnership** | Grab Dine Out · Dining City · TCB×OneU · HDBank | `Aggregator` + `Partnership` |
| **M10 · Booking &amp; Event** | Phễu lead tiệc, attribution MKT | `Booking-Event` |
| **M11 · CX &amp; Phản hồi khách** | Đánh giá, khiếu nại, NPS | `CX` |
| **M12 · Ngân sách &amp; Chi phí MKT** | Giải ngân, media vs ngoài media | `Budget` |

### KHỐI III — TỔNG HỢP

| Module | Nội dung |
|---|---|
| **R1 · Insight &amp; Cảnh báo** | Biến động bất thường + bóc tách nguyên nhân |
| **R2 · Trung tâm Báo cáo tháng** | Sinh file 17 sheet + data cho deck, chỉ ra ô nào máy điền / ô nào người điền |

> **Action Plan không nằm trong hệ thống.** Theo yêu cầu, phần kế hoạch hành động vẫn do team quản lý ở báo cáo tháng, không đưa vào dashboard. Hệ thống dừng ở phát hiện và bóc tách nguyên nhân.

**Ba module hoàn toàn mới so với v2.0:** M5 Content &amp; Social · M6 Branding &amp; POSM · M11 CX. Trước đây không có vì không nghĩ tới góc marketing thương hiệu — nhưng chúng chiếm 4/17 sheet của báo cáo tháng.

## 12.5 Quy ước đo lường bắt buộc — kế thừa từ chuẩn báo cáo tháng

Những quy ước này đã chốt ở brief báo cáo T7 và **phải áp dụng nguyên vẹn vào dashboard**, nếu không hai hệ thống lại lệch nhau lần nữa.

**❶ CẤM dùng từ "ROAS".** NOIRE không có attribution đủ mạnh để nói doanh thu nào do quảng cáo tạo ra: chỉ 9,6% hoá đơn có SĐT, liên kết mã voucher ↔ hoá đơn gần như chết (2/95), Meta chỉ đo được tới bước tin nhắn. Thay bằng:

| Dùng | Công thức | Ghi chú |
|---|---|---|
| **Ad Cost Ratio (ACR)** | Media Spend ÷ Net Sales | chỉ số chính báo cáo BOD |
| Net / Meta spend | Net Sales ÷ chi tiêu Meta | **phải ghi rõ là tương quan, không phải nhân quả** |
| Cost per Conversation | chi tiêu ÷ số tin nhắn | |
| Cost per Lead / Booking | chi tiêu ÷ lead / booking | |

*(Bản v2.0 của wireframe có thẻ ROAS — đã gỡ ở v3.0.)*

**❷ Bốn nhãn bản chất chi phí ưu đãi** — `COMMERCIAL` (tính vào hiệu quả MKT) · `INTERNAL` (không tính) · `PARTNER` (tách riêng, ghi rõ phần NOIRE trả và phần nền tảng trả) · `LOYALTY` (tính, nhưng ở M8). T7/2026: chi phí ưu đãi 221,8tr, trong đó **INTERNAL 166,4tr = 75%** chỉ cho 202 hoá đơn.

**❸ Năm mốc so sánh** thay vì hai: Target · tháng trước · cùng kỳ năm trước *(chỉ same-store — chỉ The Mett đủ lịch sử)* · YTD so target năm · benchmark H1 gia quyền ±15%.

**❹ Ngưỡng cứng, cấm chữ "tốt/ổn/khá" không kèm ngưỡng:**

| Nhóm | Đạt | Cần theo dõi | Không đạt |
|---|---|---|---|
| Kết quả kinh doanh | ≥100% | 90–99% | &lt;90% |
| Chi phí so benchmark | trong ±15% | — | ngoài ±15% |
| Giải ngân ngân sách | 95–105% | — | ngoài khoảng |
| Branding đúng hạn | 100% | 80–99% | &lt;80% |

**❺ Rào chắn độ chín 14 ngày** — chương trình chạy dưới 14 ngày không được gắn nhãn KHÔNG ĐẠT.

**❻ `—` khác `0`.** Dấu gạch nghĩa là chưa đo được; số 0 nghĩa là đã đo và bằng không. Hai thứ này không được hiển thị giống nhau.

**❼ Chuẩn hoá theo số ngày.** T7 có 31 ngày, T6 có 30 ngày — chênh cơ học +3,3%. Mọi chỉ số nhạy phải có cột `/ngày`. Ví dụ thật từ T7: Net −7,69% MoM nhưng Net/ngày −10,67% — hai kết luận khác nhau.

**❽ Ngưỡng độ sâu cho Aggregator.** Kênh chiếm dưới 1% doanh thu chuỗi thì chỉ báo cáo 3 dòng, không dựng slide riêng. Grab hiện 0,2%.

## 12.6 Sổ thiếu dữ liệu — trả lời câu hỏi "còn thiếu nguồn nào"

Đây là bảng phải nằm ngay trong dashboard (module D3), không để trong tài liệu rời — vì nó quyết định module nào chạy được, module nào chỉ là khung rỗng.

| # | Dữ liệu thiếu | Chặn module nào | Vì sao chưa có | Việc cần làm |
|---|---|---|---|---|
| 1 | **COGS 398 SKU** (54,2% DT) | M2 · M0 (CM%, Prime Cost) | BOM chưa phủ NJFB, combo, dịch vụ, một số đồ uống | Bếp + Cost control bổ sung, ưu tiên nhóm Nhật |
| 2 | **Google Ads** | M4 | **Website 3 brand chưa có → 22,1tr đã duyệt Q3 đang bị chặn** | Ra website trước, rồi mở tài khoản + GA4 |
| 3 | **Zalo Ads** | M4 | 11,4tr kế hoạch Q3, chưa triển khai | Xác nhận có chạy hay không |
| 4 | **Zalo OA export** | M8 | Chỉ có ảnh chụp màn hình OA Manager | Xin quyền export định kỳ |
| 5 | **Social organic (Meta Insights)** | M5 | Team điền tay vào sheet Content | Export Meta Business Suite hằng tháng |
| 6 | **Số chỗ ngồi mỗi bàn** | M3 (vòng quay bàn, DT/chỗ) | Có 217 bàn + 18 khu vực nhưng không có số ghế | Ops cung cấp sơ đồ mặt bằng |
| 7 | **Chi phí nhân sự &amp; mặt bằng** | M0 (Prime Cost), M12 | Chưa có nguồn | Kế toán cấp theo store × tháng |
| 8 | **Đánh giá khách (Google/Facebook)** | M11 CX | Chưa thu thập | Export Google Business Profile |
| 9 | **Aggregator export** | M9 | Grab Dine Out / Dining City chỉ có số team điền tay | Xin cổng đối tác hoặc file đối soát |
| 10 | **Website analytics** | M4 · M11 | Chưa có website | Sau khi website chạy |
| 11 | **Hao hụt &amp; tồn kho** | M2 (COGS thực) | Chưa có | Cân nhắc giai đoạn sau |
| 12 | **NDC Berkley** | tất cả | Không xuất hiện trong bất kỳ file POS nào | Xác nhận đã vận hành chưa |

**Ba việc chặn nhiều module nhất, nên làm trước:** ❶ COGS · ❻ số chỗ ngồi · ❼ chi phí nhân sự. Ba thứ này mở khoá toàn bộ tầng biên lợi nhuận và công suất — tức phần "hiệu quả kinh doanh" mà v1.0 hoàn toàn không có.

**Về Google Ads:** đây là trường hợp thú vị — không phải thiếu dữ liệu do quên thu thập, mà do **chưa có nơi để quảng cáo dẫn về**. 22,1 triệu đã được duyệt trong ngân sách Q3 nhưng không tiêu được vì ba brand chưa có website. Trong hệ thống, mục Google Ads sẽ hiển thị trạng thái `Chặn bởi: website chưa có` thay vì để trống — để mỗi lần mở dashboard đều nhìn thấy khoản ngân sách đang nằm im.

## 12.7 Lộ trình v3.0

| GĐ | Nội dung | Điều kiện |
|---|---|---|
| **P1** | ETL `fact_item` + `fact_bill` + `fact_sales_daily` T1–T8 · 9 chốt QA | ✅ dữ liệu đủ |
| **P2** | L3 metric · M0 Scorecard · M1 Doanh thu | ✅ dữ liệu đủ |
| **P3** | M3 Công suất &amp; Kênh *(phần daypart, kênh, khu vực)* | ✅ đủ — trừ vòng quay bàn |
| **P4** | M7 Khuyến mãi *(4 bản chất)* · M12 Ngân sách | ✅ đủ |
| **P5** | M2 Menu &amp; Biên lợi nhuận | ⚠️ chờ COGS ≥90% |
| **P6** | M8 CRM · M10 Booking | ✅ đủ |
| **P7** | M4 Digital Ads *(Meta trước, Google sau)* · M9 Aggregator | ⚠️ chờ Google/Zalo |
| **P8** | M5 Content · M6 Branding · M11 CX | ⚠️ chờ nguồn |
| **P9** | R1 Insight · **R2 Trung tâm Báo cáo tháng** | sau P1–P4 |

**Điểm quan trọng về thứ tự:** R2 — sinh báo cáo tháng tự động — chỉ cần P1 đến P4 là đã thay được phần lớn công việc thủ công hiện tại. Không cần chờ đủ 17 module. Ngay khi `Business-Data`, `SCORECARD`, `Product-Promotion` (phần bán hàng), `Budget` được máy điền, khối lượng việc tay của 10 team giảm đáng kể.

---

# PHẦN 13 — KIỂM TOÁN PHÂN MẢNH DỮ LIỆU

*(25/08/2026 — quét toàn bộ cây thư mục `3. HIGHGATE 5.2026`)*

## 13.1 Con số tổng quát

| Chỉ tiêu | Giá trị |
|---|---|
| Hệ thống phân tích chạy độc lập | **6** |
| File Python | **31** |
| Dòng code | **15.276** |
| Dashboard HTML rời rạc | **11** |
| Thư mục cache riêng | **4** — tổng **53,6 MB** đọc lại cùng nguồn |
| File `data.json` trùng tên, khác nội dung | **3 nơi** |

## 13.2 Sáu hệ thống đang chạy song song

| Thư mục gốc | Nội dung | File .py | Dòng code | Output |
|---|---|---|---|---|
| `06 Reports/.../T7-2026/_build` | Deck báo cáo MKT tháng | 10 | 4.502 | PPTX 24 slide |
| `03 Customer Engagement` | Voucher · CRM · Loyalty | 8 | 3.730 | 3 HTML + 1 XLSX |
| `04 Marketing Campaigns` | Digital Ads · LTO Promotions | 8 | ~2.900 | 2 HTML + 3 JSON + XLSX |
| `10 Partnership Analytics` | Partnership | 1 | 1.202 | XLSX 8 sheet |
| `05 Data Raw/_TOOL Basket RFM` | Basket · RFM · K-Means | 1 | 1.131 | HTML + XLSX |
| `08 Analytics Hub` | Analytics Hub *(hệ thống này)* | 3 | 1.204 | HTML tổng hợp |
| `09 Tracking Sales Tool` | Tracking doanh thu ngày | 1 | ~600 | XLSX |

Mỗi hệ thống đều làm tốt việc của nó. Vấn đề không nằm ở chất lượng từng tool — mà ở chỗ **chúng không nói chuyện với nhau**.

## 13.3 Nguyên nhân gốc: bốn tool cùng đọc một nguồn, mỗi tool định nghĩa khác nhau

Đây là phát hiện quan trọng nhất của kiểm toán.

| Tool | Nguồn đọc | Cột doanh thu dùng | Map tên cửa hàng |
|---|---|---|---|
| Partnership | `accounting_sale` | `Tổng tiền` | bảng riêng trong file |
| Tool Dashboard CRM | `accounting_sale` + voucher | `Tổng tiền` · `Tổng tiền (bao gồm hoa hồng)` · `Tổng tiền (không bao gồm VAT)` — **cả ba** | bảng riêng |
| Basket · RFM · K-Means | item + bill | `Tổng tiền` · `Thành tiền` · `Doanh thu Net` — **ba cơ sở** | bảng riêng |
| Analytics Hub | item + bill + daily + tháng | `Tổng tiền` *(đã đối soát 4 tầng)* | `dim_store` dùng chung |

**Bốn tool, bốn bảng map cửa hàng riêng, và ít nhất ba cơ sở doanh thu khác nhau.** Khi hai báo cáo cùng nói về "doanh thu tháng 7" nhưng ra hai con số, đây là lý do — không phải ai đó tính sai, mà là mỗi bên đang trả lời một câu hỏi hơi khác nhau mà không ai ghi rõ.

Ba cái bẫy đã biết — dòng tổng lẫn trong dữ liệu, alias cửa hàng viết khác nhau, ô rỗng là ký tự vô hình — **mỗi tool phải tự phát hiện lại từ đầu**. Tool nào chưa gặp thì vẫn đang sai âm thầm.

## 13.4 Trùng lặp cụ thể đã phát hiện

- `Dashboard_Voucher_NOIRE.html` tồn tại ở **2 nơi**, không rõ bản nào mới
- `data.json` ở **3 nơi** với nội dung hoàn toàn khác nhau: Ads Dashboard · deck T7 · Analytics Hub
- `build_ads.py` và `build_ads_master.py` cùng thư mục, không rõ cái nào đang dùng
- `NOIRE_Ads_Dashboard.html` và `NOIRE_Ads_Dashboard_v4.html`; `data.json` và `data_v4.json`
- `index.html.html` — lỗi đặt tên
- **4 thư mục `_cache` riêng, 53,6 MB**, cùng đọc lại `accounting_sale` và log voucher

## 13.5 Hướng gộp — ba bước, không xoá tool nào

Nguyên tắc: **không viết lại 15.276 dòng code.** Các tool chuyên sâu vẫn giữ nguyên giá trị — chỉ đổi nguồn đầu vào để chúng dùng chung một định nghĩa.

**Bước 1 — đổi nguồn đầu vào.** Mỗi tool thay phần tự đọc Excel bằng đọc `data.json` của Analytics Hub. Từ đó mọi tool dùng chung một `dim_store`, một định nghĩa Net, một bộ chốt QA. Đây là thay đổi nhỏ về code nhưng giải quyết triệt để chuyện lệch số.

**Bước 2 — gộp cache.** Bốn thư mục cache về một chỗ. Tiết kiệm 53,6 MB và giảm đáng kể thời gian chạy vì mỗi file Excel chỉ đọc một lần.

**Bước 3 — phân vai rõ.** Analytics Hub là nơi **tra số**; các dashboard chuyên sâu (Ads, CRM, Partnership, Basket-RFM) là nơi **đào sâu**. Người đọc biết mở cái nào cho việc gì, thay vì 11 file HTML không rõ cái nào mới nhất.

## 13.6 Những gì đã tích hợp trong đợt này

| Nguồn | Đưa vào module | Kết quả kiểm chứng |
|---|---|---|
| **Digital Ads** (Meta, T1–T7) | M4 | Chi tiêu T7 = **38.406.602đ**, Ad Cost Ratio **0,74%** — khớp số đã verify độc lập |
| **Voucher iPOS** (19 file) | M8 · M9 | 6.264 mã · 13 chương trình · **khớp hoá đơn 99,0%** trong kỳ có dữ liệu |
| **Zalo OA** (7 tháng) | M8 | T7: 61 quan tâm mới · 75 tin nhắn · 183 lượt xem trang — khớp số đã verify |
| **Member đăng ký** | M8 | Bảng theo dõi tay chỉ được điền **1/6 tháng** |
| **Partnership** (danh mục) | M9 | 5 đối tác · TCB×OneU phát 3.000 mã, **mới dùng 5 = 0,2%** |
| **Pre-Analytics Q3** | R1 | 26 chương trình đề xuất, **14 có hiệu quả tài chính âm** |

**Ba bẫy dữ liệu mới phát hiện khi tích hợp:**

1. **File export Meta có cả dòng cấp `campaign` lẫn `adset`**, một số tháng còn tách theo độ tuổi × giới tính. Cộng tất cả sẽ ra **549 triệu thay vì 157 triệu** — sai gấp 3,5 lần. Phải lọc `Cấp độ phân phối = campaign`.
2. **File `OA Zalo *.xls` thật ra là HTML**, không phải Excel. Đọc bằng `read_html`, không phải `read_excel`.
3. **Chiến dịch tuyển dụng nhân sự nằm chung tài khoản quảng cáo** (6,99 triệu). Không phải marketing thương hiệu — đã tách khỏi Ad Cost Ratio.

**Một hiểu lầm đã được đính chính:** trước đây ghi nhận liên kết voucher ↔ hoá đơn "gần như chết (2/95)". Kiểm tra lại trên toàn bộ 19 file log với đúng khoá join (`Mã giao dịch` ↔ `Mã hoá đơn`): **tỷ lệ khớp là 99,0%** trong phạm vi có dữ liệu hoá đơn. 873 lượt không khớp đều là voucher dùng trong **năm 2025**, trước khi bảng kê bắt đầu — giới hạn phạm vi, không phải lỗi chất lượng.

Điều này thay đổi hẳn câu chuyện đo lường: **trong khi attribution quảng cáo bị chặn ở 8,6% nhận diện khách, thì attribution qua voucher lại gần như hoàn hảo.** Cơ chế có phát mã nên được ưu tiên hơn giảm giá trực tiếp tại quầy — không chỉ vì kiểm soát chi phí, mà vì đo được.

---

# PHẦN 14 — NGÂN SÁCH & GOOGLE ADS

*(26/08/2026 — bổ sung module M5 Ngân sách và nâng cấp M4)*

## 14.1 Tại sao Ngân sách phải là một module riêng, đứng trước Digital Ads

Trước đây ngân sách nằm rải rác: một phần trong tờ trình Digital, một phần trong sheet Budget của báo cáo tháng, một phần trong file phân bổ Q3. Không có chỗ nào nhìn được toàn cảnh.

**M5 trở thành khung tham chiếu cho mọi so sánh thực chi** ở các module khác. Không có nó, "chi 38,4 triệu" là một con số vô nghĩa — chỉ khi đặt cạnh "kế hoạch 48,9 triệu" mới thành thông tin.

Vị trí trong sidebar: **M5 đứng trước M4**, vì phải biết kế hoạch rồi mới đọc được thực chi.

## 14.2 Cấu trúc ngân sách Q3/2026 — hai tầng

Nguồn duy nhất: `01 Strategic/03 Budget Allocation/NOIRE_MKT_Q3_2026_Checked_Ads_Channel_by_Month_Brand.xlsx` *(thư mục có 7 file ngân sách; hệ thống chọn bản đầy đủ nhất — có sheet `Budget Store Ads`)*.

| | Giá trị |
|---|---|
| Ngân sách gốc Q3 | **606.437.535đ** |
| Tổng đã phân bổ | **601.896.017đ** (99,3%) |
| Chưa phân bổ | 4.541.518đ |

**Tầng 1 — Brand MKT** *(tính theo 2% doanh thu mục tiêu)*

| Brand | Ngân sách | Plan Q3 | Dùng |
|---|---|---|---|
| NCB | 162.904.474 | 157.871.342 | 96,9% |
| NDC | 179.901.462 | 174.000.000 | 96,7% |
| NJFB | 162.558.676 | 151.000.000 | 92,9% |

**Tầng 2 — Extra:** Chạy Tiệc 56.024.675 · CRM 63.000.000 = **119.024.675đ**

**Trong đó ngân sách quảng cáo — 269.649.567đ (44,8% tổng plan):**

| Kênh | Jul | Aug | Sep | Tổng Q3 |
|---|---|---|---|---|
| Meta Ads | 48.924.997 | 61.244.003 | 63.330.165 | **173.499.165** |
| Google Ads | 17.141.341 | 22.087.217 | 22.526.244 | **61.754.803** |
| Zalo Ads | 11.198.800 | 11.436.400 | 11.760.400 | **34.395.600** |

## 14.3 Google Ads đã chạy — điểm chặn cũ đã được giải quyết

Blueprint v3.0 ghi Google Ads bị chặn vì *"ba brand chưa có website"*. **Điều đó không còn đúng.**

Từ T8/2026, NOIRE chạy **5 chiến dịch Performance Max hướng tới Google Maps** — không cần website vẫn chạy được. Kỳ 01–26/08/2026: chi **3.140.653đ**, **713 lượt chuyển đổi**.

| Kênh hiển thị | Chi phí | Lượt nhấp | Chuyển đổi | CP/chuyển đổi |
|---|---|---|---|---|
| **Maps** | 1.114.005 | 1.598 | **407** | 2.737đ |
| Mạng hiển thị Google | 1.094.052 | 2.528 | 135 | 8.104đ |
| Google Tìm kiếm | 634.502 | 471 | 130 | 4.881đ |
| YouTube | 159.101 | 1.009 | 41 | 3.881đ |
| Khám phá | 138.991 | 92 | 0 | — |

Maps dẫn đầu cả chi phí lẫn chuyển đổi với **chi phí trên chuyển đổi thấp nhất** — hoàn toàn hợp lý với mô hình F&B tại chỗ, và giải thích vì sao chạy được khi chưa có website.

Kèm theo là **2.571 cụm từ tìm kiếm**, trong đó chỉ 89 cụm chứa "noire". Phần còn lại là khách tìm theo nhu cầu — đầu vào tốt cho nội dung và đặt tên món.

## 14.4 Kế hoạch so thực chi — bức tranh giải ngân

| Kênh | Plan Q3 | Plan tới hết T8 | Thực chi | Đạt/plan T8 |
|---|---|---|---|---|
| Meta Ads | 173,5tr | 110,2tr | 79,8tr | **72,4%** |
| Google Ads | 61,8tr | 22,1tr | 3,1tr | **14,2%** |
| Zalo Ads | 34,4tr | 22,6tr | **0** | **0%** |
| **Tổng** | 269,6tr | 154,9tr | 82,9tr | **53,5%** |

**Cách đọc đúng:** so thực chi với phần kế hoạch **đã tới hạn**, không so với cả quý. Ngưỡng lành mạnh 95–105%. Dưới 70% nghĩa là tiền đang nằm im và sẽ dồn áp lực vào tháng cuối — chi vội cuối quý thường kém hiệu quả hơn chi đều.

*(Chỉ số này khớp với số đã verify độc lập: Meta T7 đạt 78,5% kế hoạch tháng.)*

## 14.5 Bốn cờ đỏ mới phát hiện

**❶ Zalo Ads được cấp 34,4 triệu nhưng chưa có dòng chi tiêu nào.** Trong đó 30 triệu dành riêng cho mục tiêu tăng follow Zalo OA. Đến hết T8 vẫn chưa ghi nhận. Hoặc kênh chưa triển khai, hoặc đã chạy mà chưa có nguồn dữ liệu — đây là khoản nằm im lớn nhất.

**❷ Chiến dịch Google đã tạm dừng vẫn phát sinh 1.011.131đ với 0 lượt chuyển đổi.** Chiếm 32% tổng chi Google. Chiến dịch `NDC-Phạm Ngọc Thạch` cũng **chưa map được về cửa hàng nào** trong `dim_store` — cần xác nhận đây là cửa hàng mới hay đặt sai tên.

**❸ Hai cửa hàng không có ngân sách Google/Zalo nhưng vẫn đang chạy.** `NOIRE The Mett` và `NOIRE SKC` để trống cột Google và Zalo trong bảng phân bổ Q3. Nhưng thực tế `NCB-SKC-Performance Max` đã chi 746.599đ. Nghĩa là đang chi ngoài kế hoạch, hoặc bảng phân bổ chưa cập nhật.

**❹ Tỷ lệ ngân sách quảng cáo trên doanh thu mục tiêu chênh lệch lớn giữa các cửa hàng** — từ 0,72% (The Mett, SKC) tới 3,20% (JFB SSV). Cửa hàng mới được đầu tư đậm hơn theo tỷ lệ, hợp lý về chiến lược, nhưng cần theo dõi hiệu quả riêng thay vì so ngang với cửa hàng đã ổn định.

## 14.6 Ba bẫy dữ liệu mới khi tích hợp

1. **Sheet `Budget Brand` và `Extra Budget` có dòng trống xen giữa tiêu đề và bảng.** Đọc cứng `header=1` ra toàn cột `Unnamed`. Đã thêm hàm `find_header()` tự dò dòng tiêu đề theo từ khoá.
2. **Báo cáo Google "thông tin chi tiết cụm từ tìm kiếm" có xen dòng `Tổng số: Chiến dịch`.** Không loại sẽ **nhân đôi chi phí** — 6,28 triệu thay vì 3,14 triệu.
3. **Nguồn ads đã chuyển sang `05 Data Raw/03 Digital Ads`** (có T8 và Google), trong khi bản cũ ở `04 Marketing Campaigns` chỉ tới T7. Hệ thống ưu tiên đường mới, giữ đường cũ làm dự phòng. **Đây là một điểm phân mảnh mới** — nên xoá hoặc đánh dấu rõ bản cũ.

## 14.7 Ad Cost Ratio phải tính trên tháng trọn kỳ

Chi tiêu quảng cáo T8 là số đủ tháng, nhưng doanh thu T8 mới có 18/31 ngày. Lấy hai số này chia nhau ra ACR 1,55% — sai lệch nghiêm trọng so với thực tế 0,74% ở T7.

Hệ thống vì thế **luôn tính ACR trên tháng trọn kỳ gần nhất** và ghi rõ điều đó trên thẻ chỉ số. Đây là cùng một nguyên tắc đã áp cho Scorecard — bất kỳ tỷ lệ nào có tử số và mẫu số đến từ hai nguồn có độ mới khác nhau đều phải kiểm tra lại phạm vi trước khi chia.

---

# PHẦN 15 — KHUNG PHẠM VI & QUY CHUẨN BIỂU ĐỒ

*(26/08/2026 — chuẩn hoá bộ lọc và trình bày cho toàn khối Marketing)*

## 15.1 Đánh số lại khối II

| Cũ | Mới | Module | Lý do |
|---|---|---|---|
| M5 | **M4** | Ngân sách Marketing | Phải biết kế hoạch trước khi đọc thực chi |
| M4 | **M5** | Digital Ads | Đọc sau ngân sách |
| — | **M6** | **Pre-Analytics — Plan** | Trước đây dữ liệu đã nạp nhưng chưa có màn hình |
| M7 | M7 | Khuyến mãi &amp; CTKM *(Actual)* | giữ nguyên |
| M8 | M8 | CRM · Voucher · Zalo OA | giữ nguyên |
| M9 | M9 | Partnership | giữ nguyên |
| M10 | M10 | Booking &amp; Event | giữ nguyên |

Thứ tự mới đọc thành một mạch: **ngân sách → chi quảng cáo → kế hoạch khuyến mãi → kết quả khuyến mãi → giữ chân khách → đối tác → mảng tiệc.**

## 15.2 Vì sao trước đây không thấy Pre-Analytics

Dữ liệu Pre-Analytics **đã được nạp từ đầu** — 26 chương trình đề xuất Q3, 14 chương trình dự báo hiệu quả âm. Nhưng nó chỉ xuất hiện dưới dạng **một dòng cảnh báo ở R1**, không có màn hình riêng.

Đây là lỗi thiết kế: một khối dữ liệu quan trọng bị "chôn" trong phần tổng hợp. Bản wireframe v3 có thiết kế M7-Plan như một tab con, nhưng khi dựng dashboard thật thì chỉ dựng nhánh Actual.

**M6 giờ là màn hình riêng**, hiển thị đầy đủ: phân bố hiệu quả dự báo từng chương trình, tổng hợp theo brand và theo loại cơ chế, danh sách xếp theo đóng góp ròng, và lập luận về cổng duyệt.

## 15.3 Khung phạm vi dùng chung cho khối Marketing

Mọi module M4–M10 giờ có cùng một thanh lọc: **Brand · Từ · Đến**, cộng ô hiển thị phạm vi đang xem. Trạng thái dùng chung nên chuyển tab vẫn giữ nguyên lựa chọn.

**Nguyên tắc trung thực về phạm vi lọc.** Không phải khối dữ liệu nào cũng tách được theo brand. Thay vì âm thầm bỏ qua bộ lọc, mỗi module ghi rõ ngay trên thanh lọc phần nào lọc được, phần nào không:

| Module | Lọc brand áp cho | Không tách được theo brand |
|---|---|---|
| M4 Ngân sách | Tầng Brand MKT · bảng cửa hàng | Ngân sách Extra · bảng kênh ads |
| M5 Digital Ads | Chi tiêu Meta · bảng chiến dịch | — |
| M6 Pre-Analytics | Toàn bộ danh sách | — |
| M7 Khuyến mãi | Cả bốn bản chất chi phí | — |
| M8 CRM | Voucher *(theo nhà hàng sử dụng)* | Tỷ lệ nhận diện · Zalo OA |
| M9 Partnership | Danh mục đối tác · voucher đối tác | — |
| M10 Booking | — *(lead hiện chỉ có NDC)* | Toàn bộ |

Để bộ lọc brand hoạt động **thật** chứ không chỉ hiện nút, tầng ETL đã bổ sung chiều `brand` vào bảng CTKM (`nature`, `campaigns`) và chiều brand cho voucher suy từ cột `Nhà hàng sử dụng`.

Module có phạm vi thời gian riêng thì thanh lọc chỉ hiện đúng khoảng đó — M4 Ngân sách chỉ có Q3, M10 Booking theo khoảng lead thực có.

## 15.4 Quy chuẩn biểu đồ — sáu nguyên tắc

Áp cho toàn bộ 32 biểu đồ trong hệ thống.

**❶ Số liệu hiện thẳng trên biểu đồ.** Không bắt người đọc rê chuột mới thấy con số. Hệ thống dùng một plugin nhãn số tự viết (`VLABEL`), không phụ thuộc thư viện ngoài. Với biểu đồ cột chồng, plugin chỉ ghi **tổng ở đầu mỗi cột** thay vì ghi từng lớp — tránh chữ đè nhau.

**❷ Bật nhãn có chọn lọc, không bật tất cả.** Biểu đồ đường 240 điểm hay biểu đồ phân tán 200 món mà ghi nhãn thì thành đám chữ. Nhãn được bật ở 22/32 biểu đồ — những biểu đồ ít điểm, đủ chỗ hiển thị. Còn lại dựa vào tooltip.

**❸ Trục nào cũng có tên và đơn vị.** Hiện có 42 nhãn trục. Trục kép luôn ghi rõ đơn vị hai bên — ví dụ *"Chi tiêu media (VNĐ)"* bên trái và *"Ad Cost Ratio (%)"* bên phải.

**❹ Biểu đồ xếp hạng luôn sắp giảm dần.** Người đọc nhìn thứ tự trước khi nhìn số.

**❺ Bảng màu cố định, có ngữ nghĩa.**

| Nhóm | Màu |
|---|---|
| Brand | NCB `#AE8966` · NDC `#82846C` · NJFB `#C28B4B` |
| Ngữ nghĩa | Đạt `#4A7C59` · Cần theo dõi `#B07A2B` · Không đạt `#A8443A` |
| Trung tính | Vàng đồng `#B0834B` · Cát `#D6D3CA` |

Bản chất chi phí ưu đãi dùng đúng bộ màu ngữ nghĩa: `COMMERCIAL` xanh · `INTERNAL` đỏ · `PARTNER` vàng · `LOYALTY` ô liu — nhìn màu là biết nhóm nào tính vào hiệu quả marketing.

**❻ Dữ liệu thiếu hiển thị "—", không vẽ thành 0.** Ô trống nghĩa là chưa đo được; số 0 nghĩa là đã đo và bằng không. Hai thứ này không được trông giống nhau — nguyên tắc đã chốt từ chuẩn báo cáo tháng, giờ áp cả vào biểu đồ.

**Tooltip mang thông tin bổ sung, không lặp lại nhãn.** Ví dụ ở M6, rê vào một cột hiện đủ: tên chương trình, brand, loại cơ chế, ROI, đóng góp ròng — bốn dòng thay vì một con số đã có sẵn trên cột.
