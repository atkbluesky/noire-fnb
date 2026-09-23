# M7.1 · PRE-ANALYTICS — PLAN

| | |
|---|---|
| **Câu hỏi** | Nếu chạy chương trình này thì sẽ ra sao? |
| **`activeView`** | `m71` *(mục con của M7)* |
| **View** | `src/views/PreAnalyticsView.tsx` + `src/views/PreEvalSection.tsx` (phiếu đánh giá) |
| **ETL** | `tools/pre_analysis.py` (bộ đọc DUY NHẤT file S16) → `tools/campaign.py` → sheet `pre_plan` → `CAMPAIGN.plan` · file deck quý (Q4/2026+) → mẫu chuẩn → `tools/preeval.py` → `pre_eval` · `pre_eval_input` (§0.8) |
| **Giai đoạn** | P5.5 |
| **Trạng thái** | ✅ **25 chương trình kế hoạch · nối 5 chương trình đã chạy trên POS, hiện thực tế cạnh kế hoạch** · ⚠️ `Growth%` vẫn là giả định gõ tay |
| **Sổ đánh giá chuẩn** | ✅ `L0_input/03_MARKETING/05_Promotion_Ke_Hoach/01_So_Danh_Gia/Pre_Analysis_2026.xlsx` (S24) → `tools/preeval.py` → `data_input/04_preeval.xlsx` → phiếu đánh giá trên M7.1 · 3 chương trình mẫu |

---

> **Cụm M7:** màn này là mục con của M7 Promotion, cùng danh mục chương trình với M7.2 — xem [M7_Promotion.md §0](M7_Promotion.md). Từ 17/09/2026 màn đọc `CAMPAIGN.plan` (sheet `pre_plan`, đọc thẳng S16) thay cho `MKT.pre_q3` và hiện **kết quả thực tế cạnh kế hoạch** cho chương trình đã chạy.


## 0. Mô hình đánh giá chương trình trước khi chạy *(17/09/2026)*

### 0.1 Tư duy — vì sao KHÔNG làm mỗi chương trình một file

Đã đọc 4 file đang dùng: **PP672 BeFood** (chuẩn tập đoàn), **LTO Summer Pre-Analytics**, **Noire Pre Promotion
Evaluation Tăng TC Template**, **NCB Q3 Operating Engine**. Mỗi file tốt ở một chỗ, nhưng cùng một kiểu tốn thời gian:

| Việc | File-mỗi-chương-trình | Sổ chuẩn + hệ thống |
|---|---|---|
| Base sales · TC · AOV · TA | chép tay từ báo cáo POS, dễ lệch kỳ, lệch cửa hàng | **tự lấy từ POS** theo đúng cửa hàng + kỳ nền + thứ chạy |
| Giá bán · giá vốn món | VLOOKUP sheet Menu tự dán | **tự lấy** giá POS + BOM; chỉ điền món chưa có BOM |
| Công thức | mỗi file một biến thể, sửa là vỡ | **một nơi** (`tools/preeval.py`), sổ không có công thức |
| So sánh các chương trình | mở từng file | xếp hạng trên một màn, cùng thước đo |
| Sau khi chạy | làm báo cáo riêng | tự nối M7.2 → **thực tế cạnh dự báo** |
| File trình ký | có sẵn | nút **In phiếu** trên M7.1 (bố cục PP672) |

Thời gian lập một chương trình: điền ~1 dòng `chuong_trinh` + mỗi scheme 1 dòng + món + chi phí (~5 phút).

Điều file cũ thiếu và mô hình bổ sung: **%Cannib**. File LTO Summer coi toàn bộ 143,4 tr là doanh thu
chương trình và báo lãi 59,9 tr — không tách khách vốn sẽ đến. Cùng dữ liệu, mô hình cho EBITDA tăng thêm
+15,6 tr (Cơ sở) và −8,3 tr (Thận trọng) → **CHẠY THỬ CÓ ĐIỀU KIỆN**.

### 0.2 Sổ nhập — `Pre_Analysis_2026.xlsx` (S24)

| Sheet | Một dòng = | Cột chính |
|---|---|---|
| `chuong_trinh` | 1 chương trình | cửa hàng · ngày · `dow` (thứ chạy) · mục tiêu → phương án · nội dung · giả thuyết · `participation_pct` / `est_bills` · `cannib_pct` · `campaign_id` |
| `co_che` | 1 scheme | `condition` (NONE · MIN_BILL · BUY_ITEMS · GROUP_SIZE · PREBOOK · MEMBER) · `benefit` (NONE · PCT_OFF_BILL · PCT_OFF_ITEMS · FIXED_OFF · FIXED_PRICE · GIFT_ITEM · GIFT_MERCH) · giá trị · quà · `stock_qty` · `share_pct` |
| `mon` | 1 món trong scheme | REQUIRED / GIFT · mã POS · số lượng (lẻ được: 2 ly bất kỳ trong 3 món → 0,667/món) · giá · giá vốn (trống = POS/BOM) |
| `chi_phi` | 1 khoản ngoài scheme | MERCH · KOL · ADS · PRINT · AGENCY · OTHER |
| `ty_le_chi_phi` | 1 khoản chi vận hành | % doanh thu thuần theo brand · VARIABLE/FIXED · tính trên tăng thêm (Finance khoá) |
| `NEN_CUA_HANG` · `NEN_MON` · `NEN_CTKM` | *máy sinh* | TC · AOV · TA theo cửa hàng × tháng · giá + giá vốn 700 món · 126 CTKM cũ (hoá đơn/ngày, % tham gia, AOV so cửa hàng) — tra để đặt giả định |

Tạo sổ: `python tools/preeval_template.py` · làm mới dữ liệu nền: `--refresh`.

### 0.3 Công thức (tools/preeval.py)

Mọi tiền tính trên **giá menu** (POS "Thanh toán trước giảm giá") rồi quy đổi bằng **hệ số thuế/phí đo từ POS
của chính cửa hàng đó** (NDC_NTMK 1,13 · NCB 1,00 vì giá đã gồm VAT): `Tổng tiền = (menu − giảm) × hệ số` ·
`Doanh thu thuần = Tổng tiền ÷ 1,08`.

```
1 BASE        56 ngày trước ngày bắt đầu (bỏ lễ, lọc đúng thứ chạy) → run-rate/ngày × số ngày chạy
2 1 HOÁ ĐƠN   giá trị = max(min_bill ; AOV nền + món CT × %gọi thêm)      GROUP_SIZE: TA × số khách
              giảm    = theo benefit     giá vốn = món CT (BOM) + món tặng + món khác × COGS% nền
              quà     = đơn giá × (1+VAT)
3 SỐ HOÁ ĐƠN  est_bills | participation% × TC nền   — không vượt stock_qty
4 FINANCIAL   Có KM     = Σ hoá đơn × kinh tế 1 hoá đơn
  EVALUATION  Ăn mòn    = %cannib × hoá đơn tham gia × giá trị 1 hoá đơn NỀN
              Không KM  = Base − Ăn mòn          Tổng = Không KM + Có KM          Tăng thêm = Tổng − Base
              %Cannib   = (Base − Không KM) ÷ Không KM                            (đúng định nghĩa PP672)
5 EBITDA      LN gộp tăng thêm − quà − chi phí chương trình − Σ ty_le_chi_phi(VARIABLE) × DT thuần tăng thêm
6 KỊCH BẢN    Thận trọng: hoá đơn ×0,7 · cannib +15pp · COGS +2pp   Cơ sở   Lạc quan: ×1,3 · cannib −10pp
  HOÀ VỐN     số hoá đơn cần để EBITDA = 0 · %cannib tối đa còn hoà vốn · % TC cần tham gia để hết quà · số ngày hết quà
7 QUYẾT ĐỊNH  DUYỆT CHẠY (Cơ sở > 0 & Thận trọng ≥ 0) · CHẠY THỬ CÓ ĐIỀU KIỆN (Cơ sở > 0) · SỬA CƠ CHẾ · BRANDING
  CỔNG        %COGS hoá đơn tham gia > 40% · chi phí KM > 30% doanh thu thuần → cảnh báo cần bằng chứng incremental
```

Mặc định (ghi đè từng chương trình được) ở `data_contract.json → $preeval`: %cannib theo phương án
(Customer Base 30% · Frequently 50% · Party Size 40% · Day-part 30% · Menu Item Sold/Value 60% · Pricing 70%),
%gọi thêm theo ưu đãi (món mới/quà merch 50% · combo/giảm giá 0%), COGS món khác theo brand (NCB 32% · NDC 33% · NJFB 35%).

### 0.4 Năm mẫu — mỗi cơ chế một cách phân tích

| Mẫu | Cơ chế | Điểm phân tích riêng | Kết quả |
|---|---|---|---|
| **LTO Summer Crush** | 3 món LTO + 2 scheme quà merch có giới hạn 300+300 | món lẻ tỷ lệ 0,667/0,333 · giá vốn nhập (chưa có BOM) · giới hạn quà · số ngày hết quà | CHẠY THỬ · EBITDA +15,6 tr / −8,3 tr |
| **Pre-booking 15%** | giảm 15% toàn hoá đơn | %cannib 80% (kế hoạch chỉ +20%) · cổng chi phí KM > 30% DT | SỬA CƠ CHẾ · −2,7 tr |
| **The Monday Treat** | tặng dessert, chỉ thứ 2 | `dow = 0` → kỳ nền & số ngày chỉ lấy thứ 2 · món tặng lấy giá vốn BOM | DUYỆT · +2,7 tr |
| **20/10 Set 2 người 899K** *(ý tưởng Q4, 1 dòng)* | FIXED_PRICE, `item_codes` 4 món | cơ chế nhanh — không cần `co_che`/`mon` · `season_factor` 1,1 | DUYỆT · +15,1 tr / +8,1 tr |
| **Giáng sinh bill ≥300K tặng bánh** *(ý tưởng Q4, 1 dòng)* | MIN_BILL + GIFT_ITEM | `gift_codes` · `season_factor` 1,15 · vượt 2 cổng (COGS 47%, chi KM 33%) | CHẠY THỬ · +9,6 tr / −3,8 tr |

**Kiểm chứng với thực tế (LTO Summer Crush):** giá trị hoá đơn dự báo 456K vs thực tế 511K; 600 hoá đơn
(giới hạn quà) vs 777 hoá đơn có ly LTO (chỉ 307 nhận quà) — mô hình đúng hướng về AOV, số hoá đơn phụ thuộc giả định tham gia.

### 0.5 Còn mở

- `ty_le_chi_phi` đang là **số tạm** (~9% DT thuần) — Finance khoá theo P&L Noire.
- COGS món khác theo brand là giả định (BOM mới phủ 45% doanh thu món).
- %cannib mặc định là kinh nghiệm ngành — hiệu chỉnh dần bằng kết quả M7.2 của chính Noire.

### 0.6 Lập kế hoạch một quý (vd Q4/2026) — đưa gì, vào file nào

**Một file duy nhất:** `L0_input/03_MARKETING/05_Promotion_Ke_Hoach/01_So_Danh_Gia/Pre_Analysis_2026.xlsx`.
Không tạo file theo quý, không tạo file theo chương trình — cột `date_from` quyết định chương trình thuộc quý nào
(M7.1 tự gắn `2026-Q4`).

| Bước | Ai | Điền gì | Sheet | Hệ thống trả gì |
|---|---|---|---|---|
| **B1 · Ý tưởng** | Brand / Marketing | 1 dòng / ý tưởng: `program_id` · `name` · `brand` · `store_scope` · `date_from` · `date_to` · `objective` → `lever_primary` · **cơ chế nhanh** (`offer` · `condition` · `min_bill` · `benefit` · `benefit_value` · `item_codes` · `gift_codes` · `merch_unit_cost` · `stock_qty`) · `participation_pct` · `status = NHAP` | `chuong_trinh` | xếp hạng mọi ý tưởng · ma trận quyết định · việc cần làm |
| **B2 · Chi tiết** | Brand + Kế toán | ý tưởng qua vòng 1: nhiều scheme → `co_che`; món lẻ tỷ lệ / giá vốn chưa có BOM → `mon`; KOL · Ads · in ấn → `chi_phi`; chỉnh `cannib_pct` · `season_factor`; `status = TRINH_DUYET` | `co_che` · `mon` · `chi_phi` | phiếu đánh giá đầy đủ (PP672) |
| **B3 · Duyệt & chạy** | Quản lý | In phiếu trình ký → `DA_DUYET`. Khi chạy: tên CTKM POS vào `Campaign_Tracking_2026.xlsx`, điền `campaign_id` ở sổ | `chuong_trinh` | M7.1 đặt **thực tế cạnh dự báo** |
| *Một lần / năm* | Finance | tỷ lệ chi phí vận hành theo brand | `ty_le_chi_phi` | EBITDA tăng thêm |

**Không phải đưa vào:** TC · AOV · TA · doanh thu nền · giá bán · giá vốn món có BOM · hệ số thuế/phí — engine lấy
56 ngày gần nhất trên POS (tra ở `NEN_CUA_HANG` · `NEN_MON` · `NEN_CTKM`). Q4 chưa có số cùng kỳ năm trước → dùng
`season_factor` (lễ 20/10 ~1,1 · Giáng sinh ~1,15 — giả định, sửa khi có số).

**Chạy:** lưu sổ → `CAP_NHAT.bat` (bước `preeval`) → M7.1.

**Đặt giả định:** `participation_pct` tra `NEN_CTKM` (chương trình cũ cùng loại: hoá đơn/ngày, % tham gia);
trống → mặc định 3% TC. `cannib_pct` trống → mặc định theo phương án (`$preeval.cannib_default`).

### 0.7 Màn hình M7.1 — đọc số ra quyết định

Trình bày theo thứ tự ra quyết định, không giới hạn số chương trình:

| # | Khối | Đọc thế nào |
|---|---|---|
| 0 | **Cách đọc — 4 bước** | ① EBITDA tăng thêm Cơ sở > 0 · ② Thận trọng ≥ 0 · ③ dư địa: hoá đơn dự kiến ÷ hoà vốn, %cannib giả định vs tối đa · ④ cổng COGS 40% / chi KM 30% → **DUYỆT** (①+②) · **CHẠY THỬ** (① không ②) · **SỬA CƠ CHẾ** (trượt ①) |
| 1 | **Lọc** | chip Kỳ (quý tự tính từ `date_from`) · chip Quyết định (có đếm) · tìm theo tên / mã |
| 2 | **Tổng quan danh mục** | số CT · Duyệt / Chạy thử / Sửa · Σ EBITDA và Σ chi ưu đãi của CT duyệt + chạy thử |
| 3 | **Ma trận quyết định** + **Việc cần làm** | x = EBITDA Cơ sở, y = Thận trọng, cỡ chấm = chi ưu đãi, 3 vùng màu · mỗi CT 1 hành động đọc từ hoà vốn và %cannib tối đa |
| 4 | **Bảng xếp hạng** | cột ① → ④ đúng thứ tự đọc · sắp theo mọi cột · 10 dòng/trang · xuất CSV |
| 5 | **Phiếu đánh giá** (bấm tên / chấm) | A Kết luận → B Vì sao (cầu EBITDA: khách vốn sẽ đến vs khách mới) → C Rủi ro 3 kịch bản & hoà vốn → D Chi tiết tính PP672 (Program's details · Financial evaluation) → E Giả định & dữ liệu nền → F Thực tế (nếu đã chạy) · In phiếu |

Kế hoạch Q3 lập tay (S16) thu gọn cuối trang — chỉ để tham khảo.

### 0.8 File deck theo quý (Q4/2026+) → mẫu chuẩn *(23/09/2026)*

Team thả file deck quý `NOIRE_Promotion_Pre-Analysis_Q4_2026.xlsm` (S16 — sheet `Master Plan` · `Pre-Analysis` ·
`Budget` · `Calendar`). **M7.1 không có màn riêng cho file này**: `tools/pre_analysis.py · deck_programs()` chuyển
từng chương trình ở Master Plan sang ĐÚNG các cột sheet `chuong_trinh` của sổ chuẩn (`$preeval.input_fields`), rồi
`tools/preeval.py` đánh giá như mọi chương trình khác — cùng bố cục §0.7.

| Cột chuẩn | Lấy từ deck | Khi nào để TRỐNG |
|---|---|---|
| `program_id` | `<BRAND>-<năm>Q<quý>-<TÊN>` (vd `NDC-2026Q4-KHUNGSANG`) | — |
| `name` · `brand` | PROGRAM · BRAND | — |
| `store_scope` | OUTLET nhận ra qua `alias_re` dim_store (`39NTMK` · `The Berkley` · `SSV` · `The Crest` · `SKC` · `ET` = Empress Tower · `TM` = The Mett) hoặc cụm cả brand (`2 outlets` · `NDC` · `All NOIRE system`); cụm mô tả viết thường (`shared decor concept`) bỏ qua | còn tên chưa có alias (`Metropole`, `Galleria`, `Noire branches`), deck ghi "không chỉ rõ" |
| `date_from` · `date_to` | TIMELINE ghi rõ `dd/mm–dd/mm` · `dd–dd/mm` · `dd/mm/yyyy` | `Q4` · `Tháng 10` · `Christmas Q4` · nhiều đêm rời |
| `dow` | `T2–T6` · `T2,T3,T5,CN` trong TIMELINE | không ghi thứ |
| `objective` | `BRANDING` khi TYPE là Branding / Key Window / Guest Shift / Performance | chương trình khuyến mãi → nên chọn TC/AOV |
| `content` · `hypothesis` | MECHANIC / CONTENT · OBJECTIVE | — |
| `benefit` (+ `condition` …) | — deck chỉ có mô tả chữ | **luôn trống** — bắt buộc bổ sung (trừ Branding) |
| `chi_phi` | MKT COST → 1 dòng `OTHER` | deck không ghi chi phí |
| `note` | Loại · Calendar · Cơ sở phân tích · KPI · business case deck (Cơ sở) · ghi chú deck | — |

**Thiếu thì hỏi, không đoán.** Chương trình thiếu trường bắt buộc vẫn lên M7.1 với quyết định **THIẾU DỮ LIỆU**:
bảng xếp hạng hiện "—", *Việc cần làm* ghi "Bổ sung ở sổ · dòng `<program_id>`: …", phiếu mở ra mục **A** (thiếu gì,
cách bổ sung) + **E · Dữ liệu đầu vào chuẩn** (mọi trường: giá trị · nguồn Sổ/File deck · mức bắt buộc · gợi ý
"deck ghi gì" ở ô trống). Bảng `pre_eval_input` (data_input/04_preeval.xlsx) giữ đúng bảng này.

**Bổ sung:** mở sổ `Pre_Analysis_2026.xlsx` → sheet `chuong_trinh` → thêm dòng cùng `program_id` → chỉ gõ ô còn
thiếu → `CAP_NHAT.bat`. Gộp từng ô: ô sổ có số thì thắng, ô sổ trống giữ số deck; `chi_phi` ở sổ (nếu có) thay chi phí
deck. Hệ thống KHÔNG ghi vào thư mục `05_Promotion_Ke_Hoach`.

**Q4/2026 lúc nhập (23/09):** 29 chương trình → 4 Branding tính được, 25 THIẾU DỮ LIỆU (mọi chương trình khuyến mãi
thiếu `benefit`; NCB thiếu thêm ngày — deck chỉ ghi `Tháng 10` / `Q4`; cửa hàng `Metropole` · `Galleria` chưa có alias ở dim_store).
`ET` (Empress Tower) và `TM` (The Mett) thêm vào `alias_re` của dim_store ngày 23/09/2026 theo xác nhận của team. File Q3 (6 sheet loại) vẫn chỉ cấp target cho M7.2 và khối tham khảo cuối trang;
chọn file theo định dạng (`files_by_format`), không theo ngày sửa.

---
## 1. Vị trí kiến trúc — vì sao không phải tầng L5

**Pre-analytics là nhánh thứ hai của L3, không phải một tầng nối tiếp sau L4.**

Chuỗi L0→L4 là **mô tả** — trả lời “chuyện gì đã xảy ra”.
Pre-analytics là **dự báo** — trả lời “nếu chạy chương trình này thì sẽ ra sao”.
Hai nhánh dùng chung L1, L2, L3, chỉ khác hướng thời gian.

```
                    ┌──► L4-A  OUTPUT ACTUAL      (nhìn lại)
L2 FACT ──► L3 ─────┤
                    └──► L3.5 BASELINE ENGINE
                              ▼
                         M6-PLAN  Pre-Analytics    (nhìn tới)
                              ▼
                         Cổng duyệt ROI ≥ 0
                              ▼
                         ghi vào dim_campaign + dim_target  (quay lại L1)
                              ▼
                         [campaign chạy] → M7.1-ACTUAL: đo lift thật vs store đối chứng
                              ▼
                         lib_benchmark ──HỌC LẠI──► L3.5 BASELINE ENGINE
```

**Nếu đặt sau L4, nó sẽ đọc số đã tổng hợp và mất chi tiết.** Ước tính “TC khung sáng 7–11h tại NCB”
không thể rút ra từ bảng tổng tháng — phải đọc thẳng từ `fact_bill`/`fact_item`.

## 2. Chuỗi trace hiện tại

```
S16 Pre-Analysis Q3 (sheet "1. Tổng hợp (Master)", header=3)
   → pre_q3[] : name · brand · kind · roi · nc
   → pre_stat : n · neg · neg_nc · pos_nc          ← CHƯA DÙNG (view tự đếm lại)
      → PreAnalyticsView
```

## 3. Màn hình hiển thị gì

> **Bố cục hiện hành: xem §0.7.** Bảng dưới là màn hình kế hoạch Q3 lập tay (nay thu gọn cuối trang M7.1).

| Khối | Nội dung |
|---|---|
| Thẻ KPI | Chương Trình Đề Xuất · Dự Báo Hiệu Quả Âm · Đóng Góp Dương/Âm Ước Tính |
| **Phân bố hiệu quả đóng góp ròng dự báo** | |
| **Danh sách chi tiết & khuyến nghị cổng duyệt CTKM** | nhãn: Nên duyệt chạy · Biên mỏng · Xem lại cơ chế |

**Q3/2026: 26 chương trình đề xuất, 14 chương trình dự báo hiệu quả tài chính âm.**
Đây là dấu hiệu tốt — pre-analytics đang làm đúng chức năng bộ lọc.

## 4. Vì sao trước đây không thấy module này

Dữ liệu Pre-Analytics **đã được nạp từ đầu**, nhưng chỉ xuất hiện dưới dạng
**một dòng cảnh báo ở R1**, không có màn hình riêng.

Đây là lỗi thiết kế: một khối dữ liệu quan trọng bị “chôn” trong phần tổng hợp.
Wireframe v3 có thiết kế M7.1-Plan như một tab con, nhưng khi dựng dashboard thật thì chỉ dựng nhánh Actual.
**M6 giờ là màn hình riêng.**

## 5. ⛔ Điểm yếu duy nhất — nằm ở đầu vào

File Pre-Analysis có cấu trúc rất tốt: 6 sheet theo loại chương trình, mỗi dòng chạy từ
`Est. TC → Base Sales → Growth% → Target Sales → Net ex-VAT → COGS% → ROI → Net Contribution`.
**Logic đúng, không cần thiết kế lại.**

Nhưng chính bảng chú giải màu trong file đã tự thừa nhận: chữ xanh = *nhập tay từ plan*,
nền cam = *đề xuất do người phân tích tự đưa*, chữ đen = *công thức tự tính*.
**Ba biến quan trọng nhất — `Est. TC`, `Base Sales`, `Growth%` — đều là ô nhập tay.**

Độ tin cậy của các con số ROI âm phụ thuộc hoàn toàn vào `Growth%` gõ tay 10–20%.
Nếu Growth% thật là 5%, danh sách chương trình nên loại bỏ sẽ dài hơn nhiều.

> **Nhiệm vụ của hệ thống: biến ô xanh và ô cam thành ô đen.**

## 6. L3.5 Baseline Engine — sáu đầu ra cần dựng

| # | Đầu ra | Cách tính | Thay ô gõ tay nào | Dữ liệu đã có? |
|---|---|---|---|---|
| 1 | **Base TC / Guest / Net** | run-rate đúng store × khung giờ × ngày trong tuần, trung vị 4–8 tuần gần nhất | `Est. TC` · `Base Sales` | ✅ `fact_bill` |
| 2 | **Chỉ số mùa vụ** | hệ số tháng/tuần rút từ lịch sử | hiệu chỉnh `Base Sales` | ✅ 8 tháng *(cần thêm 2025)* |
| 3 | **Attach rate & mix** | tỷ lệ hoá đơn có mua nhóm món mục tiêu | ước lượng số suất bán | ✅ `fact_item` |
| 4 | **COGS% thực** | bình quân gia quyền theo sản lượng thực | `COGS %` | ⚠️ chỉ phủ 46,3% |
| 5 | **Uplift benchmark** | lift thực tế của campaign cùng loại × cùng brand đã chạy | **`Growth %`** | ⛔ **cần `lib_benchmark`** |
| 6 | **Tỷ lệ ăn lẫn** | so doanh thu nhóm món cũ kỳ chạy vs kỳ nền | phần “incremental thật” | ✅ `fact_item` |

**Đầu ra số 5 là mấu chốt.** Thay vì gõ `Growth% = 15%` theo cảm tính, hệ thống trả lời:
*“Gift-FOC tại NDC đã chạy 4 lần, lift thực tế trung vị 8,2%, khoảng 4–13%, mẫu nhỏ nên thận trọng.”*

**Bốn đầu ra 1·2·3·6 đã đủ dữ liệu để dựng ngay** — không cần chờ `lib_benchmark`.

## 7. `lib_benchmark` — thư viện học

Bảng tích luỹ, mỗi campaign kết thúc ghi thêm một dòng.
**Đây là tài sản dài hạn có giá trị nhất mà hệ thống tạo ra** — càng chạy lâu càng đắt giá,
và không đối thủ nào sao chép được.

Cột: `campaign_id · type · brand · store_tier · duration · planned_growth% · **actual_lift%** ·
planned_roi · **actual_roi** · sai_số_dự_báo · ghi_chú_bối_cảnh`.

Câu hỏi quan trọng nhất mà nó phục vụ: **dự báo của chúng ta lệch bao nhiêu — có lạc quan quá mức không?**
Sau 6–8 campaign, nếu sai số luôn dương (Plan > Actual), hệ thống tự áp hệ số hiệu chỉnh thận trọng
vào mọi dự báo về sau.

## 8. Cổng duyệt ba kịch bản

| Kịch bản | Growth% dùng | Ý nghĩa |
|---|---|---|
| Thận trọng | percentile 25 của benchmark | **Sàn — ROI ở đây phải ≥ 0** |
| Cơ sở | trung vị benchmark | Kỳ vọng đưa vào target |
| Lạc quan | percentile 75 | Trần — dùng để tính upside |

**Quy tắc duyệt: ROI ở kịch bản thận trọng ≥ 0 thì được chạy.**
Ngoại lệ duy nhất là chương trình gắn nhãn `BRAND` (thuần nhận diện) — duyệt theo hạn mức ngân sách branding, không theo ROI.

**Chương trình không qua cổng → trả về sửa cơ chế, không phải sửa con số dự báo.**

## 9. Bộ lọc

Brand · Từ · Đến — **chỉ Q3/2026** (`allowedMonths` khai báo trong `App.tsx`).
Bộ lọc brand áp cho toàn bộ danh sách.

## 10. Checklist nâng cấp

- [ ] Dùng **`pre_stat`** *(đã có, chưa dùng)* thay vì view tự đếm lại từ `pre_q3`
- [ ] **Dựng Baseline Engine đầu ra 1·2·3·6** — dữ liệu đã đủ, không cần chờ gì
- [ ] **Dựng `lib_benchmark`** — bắt đầu bằng cách ghi lại lift thật của các campaign đã chạy (S17)
- [ ] **Dựng cổng duyệt 3 kịch bản** với percentile 25/50/75
- [ ] Ghi rõ trên mỗi dòng: con số nào máy tính, con số nào người nhập *(kế thừa bảng chú giải màu của file gốc)*
