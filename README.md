# NOIRE ANALYTICS HUB — Hướng dẫn vận hành

**Cập nhật:** 10/09/2026 · Dữ liệu T1–T8/2026 (T8 đã đủ 31 ngày)

> 📚 Tài liệu hệ thống đầy đủ ở [`docs/`](docs/00_INDEX.md).
> 🗓️ **Cần cập nhật số liệu tháng mới? Đọc đúng một file:**
> [`docs/16_CAP_NHAT_HANG_THANG.md`](docs/16_CAP_NHAT_HANG_THANG.md)

---

## Cập nhật số liệu — một tháng, một file

```
data_input/
├── 01_master.xlsx      chiều & kế hoạch — sửa khi mở cửa hàng / chốt target / duyệt ngân sách
├── 02_snapshot.xlsx    bảng luỹ kế toàn kỳ — product · heat · zone · staff · payment · dwell
└── monthly/
    ├── 2026-07.xlsx    ← mỗi tháng MỘT file, sheet giống hệt nhau
    └── 2026-08.xlsx
```

Ba lệnh cho một tháng mới:

```bash
python tools/build_month.py 2026-09    # dữ liệu thô → data_input/monthly/2026-09.xlsx
npm run build:data                     # đọc 15 chốt QA in ra
git add data_input && git commit -m "so lieu T9.2026" && git push
```

Vercel kéo repo → `npm run build` → bước `prebuild` chạy `scripts/build-data.mjs` đọc
`data_input/` sinh `src/data/*.json` (0,7 giây) → deploy.
**Không cần Python trên Vercel. Không commit JSON.**

Không có Python? Chép `monthly/2026-08.xlsx` thành `2026-09.xlsx`, mở ra và thay số bằng tay.

```bash
npm run dev        # → http://localhost:3001 (tự chạy build:data trước khi mở)
```

---

## Cột `month` — loader tự điền từ TÊN FILE

Đây là cơ chế khiến "mỗi tháng một file" chạy được: bạn **không phải** gõ lại `2026-09` vào
từng dòng của hai chục sheet. Bỏ trống cột `month` là đúng.

Nếu một dòng có ghi tháng mà lệch với tháng của file, **chốt #14 báo ngay** — copy-paste sót
là cách phổ biến nhất để nhân đôi số của một tháng.

Nộp lại bản sửa: đặt tên `2026-09_v2.xlsx` để **cạnh** bản gốc. File đọc sau thắng ở mọi
khoá tự nhiên trùng nhau, bản cũ giữ nguyên làm bằng chứng.

Hợp đồng cột đầy đủ: [`data_contract.json`](data_contract.json) — cùng một file mà loader
Node và ETL Python cùng đọc. Bảng tra người đọc được:
[`docs/15_PROCESSED_INPUT_CONTRACT.md`](docs/15_PROCESSED_INPUT_CONTRACT.md).

---

## Nguồn dữ liệu thô — đặt file vào đâu

| Khối | Thư mục | Sinh ra sheet |
|---|---|---|
| Doanh thu · Target · AOV · TC · TA | `09 Tracking Sales Tool/` | `store_month` · `daily` · `coverage` · `dim_target` |
| POS chi tiết | `05 Data Raw/1. Sales Revenue/` | `channel` · `daypart` · `identify` · `nature` · `recon` |
| CRM · Zalo OA · Member | `05 Data Raw/2. Data Khách Hàng CRM/` | `oa` · `member` |
| Digital Ads | `05 Data Raw/3. Digital Ads/` | `ads_*` · `gads_*` |
| Social | `05 Data Raw/4. Social Media/Facebook/` | `social_month` |
| Booking & Event | `05 Data Raw/10. Booking & Event/` | `booking` → `lead_*` |
| Partnership | `05 Data Raw/Partnership/` | `partner_month` |
| Promotion · Aggregator · POSM | `05 Data Raw/Promotion-AGG/` | `aggregator` · `budget_nonmedia` |

Gốc dữ liệu: biến môi trường `NOIRE_ROOT` → không có thì suy lên ba cấp thư mục.
Chỉ cần `pip install openpyxl` — không cần pandas, không cần lxml.

---

## Cấu trúc file

| File | Vai trò |
|---|---|
| **`data_input/`** | **Nguồn sự thật** — thứ duy nhất cần commit khi số thay đổi |
| **`data_contract.json`** | **Hợp đồng dữ liệu** — sheet, cột, khoá tự nhiên, cột dẫn xuất. Node và Python cùng đọc |
| **`scripts/build-data.mjs`** | **Loader Node** — `data_input/` → `src/data/*.json`, chạy cả local lẫn Vercel |
| `tools/monthly_lib.py` | Thư viện ETL: bản đồ cửa hàng, đọc CSV UTF-16 / HTML-giả-xls, ghi workbook |
| `tools/build_month.py` | **ETL chính** — dữ liệu thô → `data_input/monthly/YYYY-MM.xlsx` |
| `tools/split_to_monthly.py` | Di trú một lần từ bộ 4 workbook cũ |
| `tools/gen_contract_doc.py` | Sinh lại bảng sheet trong `docs/15` từ hợp đồng |
| `src/utils/analytics.ts` | Engine phân tích — bóc tách nguyên nhân · bất thường ±1,5σ · same-store |
| `src/` | App React + Vite (localhost → Vercel) |
| `docs/` | Tài liệu hệ thống — kiến trúc, hợp đồng, một file cho mỗi tab |
| `build_hub.py` · `build_mkt.py` | Lane ETL **cũ** — giữ lại để tra cứu, đã được `tools/build_month.py` thay thế |
| `_archive/` | Bản HTML tĩnh cũ, wireframe, và `data_input_v1/` (bộ 4 workbook trước di trú) |

---

## Quy ước đo lường đã chốt

| Chỉ số | Công thức | Ghi chú |
|---|---|---|
| **Net Sales** | cột `Tổng tiền` | đã đối soát khớp báo cáo doanh thu tháng |
| **TA** | Net ÷ Guest | quy ước NOIRE — ngược thông lệ quốc tế |
| **AOV** | Net ÷ TC | TC = số hoá đơn |
| **Doanh thu món** | cột `Thành tiền` | trước phí dịch vụ và VAT — chỉ dùng cho cơ cấu menu và khối CTKM |
| **Ad Cost Ratio** | Media Spend ÷ Net | **thay cho ROAS** · KHÔNG gộp chi phí ngoài media |
| **ER (social)** | Tương tác ÷ tiếp cận | mẫu số là `reach` với Facebook, `views` với TikTok |
| **Net follow** | Follows − Unfollows | chỉ số so chéo nền tảng được |
| **Take rate (aggregator)** | (discount + hoa hồng + ads) ÷ sales | phần nền tảng giữ lại |

**Không cộng reach của Facebook với views của TikTok.** Facebook đếm *tài khoản* tiếp cận,
TikTok đếm *lượt xem*. Cộng lại là sai bản chất chứ không phải sai số — loader chặn sẵn ở cả
ba tầng (khoá gộp, trường `unit`, và `social.stat` cố ý không có tổng).

**Không dùng chỉ số ROAS.** Chỉ 9,8% hoá đơn nhận diện được khách nên không đủ dữ liệu quy
doanh thu về quảng cáo.

**Bốn nhãn bản chất chương trình:** `COMMERCIAL` (marketing thật) · `INTERNAL` (ưu đãi nội bộ
— không tính vào hiệu quả marketing) · `PARTNER` · `LOYALTY`.

**Ô trống ≠ số 0.** Trống = chưa đo được (màn hình hiện `—`); 0 = đã đo và bằng không.

---

## Bảy cái bẫy dữ liệu đã chặn sẵn

1. **Dòng TỔNG nằm lẫn trong dữ liệu — cả ba nguồn POS đều có.** Bảng kê ghi `TẠI CHỖ` /
   `MANG VỀ` ngay ở cột *Mã hoá đơn*. Nạp nhầm là nhân đôi toàn bộ.
2. **Từ T8/2026 iPOS xuất mỗi cửa hàng một sheet rồi thêm sheet `Tất cả cửa hàng` ở cuối.**
   Đọc sheet đầu tiên chỉ lấy được một cửa hàng; đọc hết mọi sheet thì cộng đôi.
3. **Tên cửa hàng không nhất quán.** SKC trong POS ghi là "Café & **Lounge**"; JFB The Crest
   có **hai dấu cách**. Phải so khớp bằng bảng alias, tuyệt đối không dò chuỗi tên.
4. **Ô rỗng của iPOS là ký tự vô hình `U+200B`.** Không làm sạch thì tỷ lệ nhận diện khách
   báo 100% thay vì 9,8%.
5. **Export Meta có cả dòng cấp `campaign` lẫn `adset`**, vài tháng còn tách theo tuổi ×
   giới tính. Cộng tất cả ra gấp 3,5 lần số thật.
6. **File `OA Zalo *.xls` thật ra là HTML**, và **CSV Fanpage mã hoá UTF-16** với dòng đầu
   `sep=,`. Đọc bằng trình mặc định ra toàn ký tự rác.
7. **Báo cáo Google xen dòng `Tổng số: …`** ở cả bảng kênh lẫn bảng cụm từ — không loại sẽ
   nhân đôi chi phí.

Cộng thêm: **iPOS đổi tên cột giữa các kỳ export** (T7 `Thời gian`/`Mã hoá đơn`, T8
`Ngày`/`Hoá đơn`) và dòng tiêu đề lúc ở dòng 1 lúc ở dòng 2. ETL dò cột theo danh sách bí
danh và dò dòng tiêu đề theo nội dung, không đếm dòng cứng.

---

## Mở rộng: thêm cửa hàng mới

1. Thêm một dòng vào `dim_store` của `01_master.xlsx`: `code` · `brand` · `tier` · `name` · `open`.
2. Thêm alias tên POS vào `STORE_ALIAS` trong [`tools/monthly_lib.py`](tools/monthly_lib.py).

Alias phải khớp tên trong file POS sau khi chuẩn hoá (thường hoá, gộp khoảng trắng). Nếu số
liệu có cửa hàng chưa khai, **chốt #2 báo đỏ và build DỪNG** — không âm thầm bỏ qua.

---

## Trạng thái hiện tại — 14/15 chốt QA đạt

Chốt duy nhất chưa đạt là **độ phủ giá vốn: 46,3%** (239/1.439 SKU có COGS). Đây là điểm
chặn của toàn bộ tầng biên lợi nhuận.

Ba việc cần bổ sung dữ liệu, xếp theo mức độ chặn:

1. **COGS cho 1.200 SKU còn thiếu** — chặn M2 Menu, CM%, Prime Cost
2. **Số chỗ ngồi mỗi bàn** — chặn vòng quay bàn và doanh thu/chỗ ngồi *(đã có 217 bàn, 18 khu vực, thời gian ngồi bàn)*
3. **Chi phí nhân sự & mặt bằng** — chặn Prime Cost và lãi gộp theo cửa hàng

---

## 15 màn hình trong dashboard

| Khối | Màn hình | Nguồn |
|---|---|---|
| **0** | D1 Kho dữ liệu & QA · D2 Bản đồ hệ thống | quét tự động |
| **I** | M0 Scorecard · M1 Doanh thu · M2 Menu & Biên LN · M3 Công suất & Kênh | Tracking Sales · POS |
| **II** | M4 Ngân sách Marketing *(+ chi phí ngoài media)* · M5 Digital Ads (Meta + Google) · M6 Social Media (Fanpage + TikTok) · M7 Pre-Analytics · M8 Khuyến mãi *(+ Aggregator)* · M9 CRM · Voucher · Zalo OA · M10 Partnership *(+ theo tháng)* · M11 Booking *(phễu chốt tiệc)* | Budget Q3 · Meta · Google · Meta Business Suite · iPOS · Zalo · Grab · Dining City |
| **III** | R1 Insight & Cảnh báo | tổng hợp |

**Toàn bộ M4–M11 dùng chung một thanh lọc: Brand · Từ · Đến.** Trạng thái giữ nguyên khi
chuyển tab. Mỗi module ghi rõ ngay trên thanh lọc phần nào lọc được theo brand, phần nào không.

**M5 và M6 là một cặp:** M5 đo tiền *mua* lượt tiếp cận, M6 đo lượt tiếp cận *tự tạo ra*.

---

## Đưa lên GitHub & Vercel

Repo git nằm ở thư mục cha `Code System/`. Khi tạo project trên Vercel, đặt **Root Directory**
là `Project_/Dashboard System FnB`.

- Build command: `npm run build` (đã khai ở `vercel.json`)
- Output: `dist`
- **Không** cần biến môi trường, **không** cần Python runtime

`.vercelignore` đã loại `tools/` · `docs/` · `L0_input/` · `_archive/` khỏi bundle build.
`data_input/` và `data_contract.json` **phải** được giữ — đó là đầu vào của `prebuild`.
