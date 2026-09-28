# M5.1 · ADS AUTO — META MARKETING API + GOOGLE ADS API

| | |
|---|---|
| **Câu hỏi** | Số chi quảng cáo có tự về hệ thống mỗi ngày mà không ai phải export tay, và có khớp với số Excel đang dùng để báo cáo BOD không? |
| **`activeView`** | `m5` *(nối vào tab M5 sẵn có, KHÔNG tạo tab thứ 18)* |
| **View** | `src/views/DigitalAdsView.tsx` — thêm nhánh nguồn `api`, giữ nguyên nhánh `export` |
| **Server** | `api/ads/` — `_shared.ts` · `_meta.ts` · `_google.ts` · `sync.ts` · `performance.ts` · `export.ts` · `database/migrations/005_ads_auto.sql` |
| **Nguồn** | Meta Marketing API (`/insights`, `level=campaign`, `time_increment=1`) · Google Ads API (GAQL `campaign` + `search_term_view`) |
| **Grain** | **1 ngày × 1 chiến dịch × 1 nền tảng** — quyết định chốt 27/09/2026, xem §0.5 QĐ-2 |
| **Phạm vi** | **Chỉ ĐỌC.** Không tạo chiến dịch, không đổi ngân sách, không bật/tắt gì trên tài khoản quảng cáo |
| **Giai đoạn** | P7.1 |
| **Trạng thái** | 🟢 **Màn hình ba tầng dựng xong 28/09/2026** — Meta 9 tháng trên Neon (tới 27/09), T1→T8 khớp Excel 0,00%, 16/16 biểu đồ kiểm vẽ sạch. Google vẫn từ Excel (API chờ refresh token). Xem **§9** |

> Tài liệu gốc cần đối chiếu khi chạy probe:
> [Meta · Insights API](https://developers.facebook.com/docs/marketing-api/insights) ·
> [Meta · Async job](https://developers.facebook.com/docs/marketing-api/insights/best-practices) ·
> [Google Ads · REST overview](https://developers.google.com/google-ads/api/rest/design/overview) ·
> [Google Ads · campaign fields](https://developers.google.com/google-ads/api/fields/v21/campaign)

---

## 0. ❗ LUẬT SỬA CODE — ĐỌC TRƯỚC KHI GÕ PHÍM

> M8.1 · M10.1 · M8.2 **đang chạy production** trên cùng repo, cùng database, cùng dự án Vercel.
> Riêng M5 còn khác ba module kia một điểm sinh tử: **M5 đang có màn hình SỐNG mà BOD đọc hàng tuần**,
> chạy bằng `src/data/data_mkt.json`. Làm vỡ nhánh đó là vỡ báo cáo đang dùng, không phải vỡ một tab thử nghiệm.

| # | Luật | Vì sao |
|---|---|---|
| **1** | **Đọc hết file trước khi sửa.** Đặc biệt `src/views/DigitalAdsView.tsx` (25KB) và `api/zalo/_shared.ts` (240 dòng) | Sửa mù = xoá nhầm nhánh đang giữ màn hình sống |
| **2** | **CẤM sửa `scripts/build-data.mjs`** — đây là ETL **đang sống**, sinh ra `src/data/data_mkt.json` mà `src/data/index.ts` thật sự import. Muốn thêm gì thì thêm file mới | Một ETL đang cấp số cho **9 tab**, không chỉ M5. Sửa sai là mất số cả khối Marketing. Xem §0.4 về hai nhánh ETL |
| **2b** | **CẤM sửa `build_mkt.py`** — nhánh Python đã ngưng, giữ làm tham chiếu logic gán brand/objective | Còn là nơi duy nhất ghi lại `BRAND_PAT` · `HR_PAT` · `OBJ_PAT`. Xoá là mất luật gán |
| **3** | **CẤM xoá key `ads_*` / `gads_*` khỏi `src/data/data_mkt.json` hay `src/types/mkt.ts`.** Chỉ được THÊM | `DigitalAdsView` · `ScorecardView` · `BudgetView` · `InsightsView` đều đọc các key này |
| **4** | **`api/zalo/_shared.ts` chỉ được THÊM.** Cấm đổi chữ ký `getSql` · `json` · `ictDate` · `requireCron` · `validAccessToken` · `encryptToken` · `decryptToken` | M5.1 là module thứ **TƯ** import lại chính các hàm này. Đổi một chữ ký = hỏng bốn module cùng lúc |
| **5** | **Mọi bảng mới bắt buộc prefix `ads_` hoặc `dim_ads_`.** Không đụng `zalo_oa_*` · `ipos_*` · `social_*` · `dim_ipos_*` | Nhìn tên là biết ai sở hữu, grep một phát ra hết |
| **6** | **Migration chỉ cộng thêm.** Chỉ `create table if not exists` · `create index if not exists` · `alter table … add column if not exists`. **Cấm** `drop table` · `drop column` · `rename` · `alter column … type` | Chạy lại migration phải an toàn — luật đã ghi từ `003_ipos_reservation.sql` |
| **7** | **`vercel.json` chỉ THÊM entry vào mảng `crons`.** Không sửa, không sắp lại 3 cron đang có (`/api/zalo/snapshot` 17:05 · `/api/ipos/sync` 17:15 · `/api/social/reconcile` 17:25) | Đổi lịch cron cũ = thủng chuỗi số liệu M8.1/M10.1. Cron mới đặt **17:35 UTC** để không chồng |
| **8** | **`.env.example` chỉ THÊM key.** Không xoá, không đổi tên key cũ | `_shared.ts` của 3 module đọc theo tên cứng, thiếu key là throw lúc runtime |
| **9** | **CHỈ gọi endpoint ĐỌC.** Meta: `GET /insights`. Google: `POST :searchStream` (POST nhưng là read-only GAQL). **Cấm tuyệt đối** mọi mutate: `campaignBudgets:mutate` · `campaigns:mutate` · `POST /act_*/campaigns` | Nhầm một lệnh là đổi ngân sách thật trên tài khoản đang tiêu tiền thật |
| **10** | **Mỗi bước phải chạy lại được.** Mọi ghi `upsert` theo khoá tự nhiên `(platform, campaign_id, stat_date)`. Cron có thể bị gọi trùng, Vercel có thể timeout giữa chừng và retry | Serverless không đảm bảo exactly-once. Thiếu luật này là chi tiêu bị cộng đôi — đúng cái bẫy M5 §6.1 đã mắc một lần với Excel |
| **11** | **Không bao giờ ghi `src/data/data_mkt.json` từ code TS.** Nhánh API ghi Postgres, nhánh Excel ghi JSON. Hai đường không được chạm nhau ở tầng lưu trữ | Trộn hai đường ghi vào một file = không ai biết số nào thắng |

**Quy trình bắt buộc trước mỗi commit:**

```bash
npx tsc --noEmit
npm run build
```

---

## 0.4 ❗ HAI NHÁNH ETL — phát hiện 27/09/2026, đọc trước khi đối chiếu số

Repo có **hai** ETL cùng sinh ra file tên `data_mkt.json`, ở **hai chỗ khác nhau**.
Nhầm nhánh là đối chiếu với số sai, và kết luận sai theo.

| | Nhánh **SỐNG** | Nhánh **NGƯNG** |
|---|---|---|
| Script | `scripts/build-data.mjs` (Node + exceljs) | `build_mkt.py` (Python + pandas) |
| Đầu vào | `data_input/*.xlsx` | `L0_input/S08_ads/` · `L0_input/S09_gads/` |
| Đầu ra | **`src/data/data_mkt.json`** | `data_mkt.json` ở **gốc repo** |
| Ai import | ✅ `src/data/index.ts:2` → **mọi view** | ❌ **không view nào** |
| Chạy khi nào | tự động qua `predev` / `prebuild` | chạy tay, đã ngưng |
| Cập nhật lần cuối | 27/09/2026 08:50 · 145 KB | 23/09/2026 16:05 · 44 KB |
| JSON hợp lệ | ✅ | ❌ **chứa `NaN`** → `JSON.parse` ném lỗi |

**Hệ quả bắt buộc:**

1. Mọi đối chiếu API vs Excel (§3d) đọc **`src/data/data_mkt.json`**. `scripts/ads-probe.mjs`
   đã khoá đúng file này; bản gốc chỉ dùng làm dự phòng và phải vá `NaN → null` trước khi parse.
2. `build_mkt.py` **vẫn giữ**, không xoá — nó là nơi duy nhất còn ghi lại luật gán
   `BRAND_PAT` · `HR_PAT` · `OBJ_PAT` mà QĐ-4 lấy làm giá trị mặc định cho `dim_ads_campaign`.
3. File `data_mkt.json` ở gốc **không được dùng làm nguồn sự thật cho bất cứ việc gì**.

### Mốc Excel đã đo (từ `src/data/data_mkt.json`, 27/09/2026)

Dùng làm số đối chiếu cho §3d. Probe in lại các số này mỗi lần chạy.

| Tháng | Meta (`ads_month`) | Google (`gads_month`) |
|---|---|---|
| 2026-01 | 6.913.452 | — |
| 2026-02 | 4.487.025 | — |
| 2026-03 | 32.238.387 | — |
| 2026-04 | 23.258.406 | — |
| 2026-05 | 19.292.452 | — |
| 2026-06 | 31.967.188 | — |
| **2026-07** | **38.406.602** | **256.916** |
| **2026-08** | **47.526.065** | **4.411.053** |

> Google Ads **đã có cột `month`** ở bản sống (`gads_stat.period = "2026-07 → 2026-08"`) —
> lỗi "ảnh chụp một kỳ" ghi ở M5 §cuối **đã được vá**. Probe vẫn kiểm lại, không tin sẵn.

---

## 0.45 ✅ KẾT QUẢ PROBE — đo thật 27/09/2026

Chạy `npm run probe:ads meta` + `reconcile --month=2026-08` trên tài khoản production.

### Meta — ĐÃ THÔNG

| Mục | Kết quả |
|---|---|
| Tài khoản | `act_2529975070678277` · **Fnb Ads** — tài khoản **thật**, không phải sandbox |
| Currency | `VND` ✔ QA gate 3 |
| Timezone | `Asia/Ho_Chi_Minh` ✔ — **không lệch ICT**, bẫy §3c.3 không xảy ra |
| Dữ liệu T8/2026 | 376 dòng ngày×chiến dịch · 21 chiến dịch · 31/31 ngày |
| **Đối chiếu** | API **47.526.065đ** vs Excel **47.526.065đ** → **lệch 0,00%** |
| Tin nhắn bắt đầu | 756 — đủ để tính Cost per Conversation |

> **Gate 7 XANH tuyệt đối.** Khớp tới từng đồng nghĩa là `level=campaign` lọc đúng,
> không lẫn cấp adset, và nhánh API tái tạo chính xác nhánh Excel. Đủ điều kiện dựng migration.

**Bậc `development_access` KHÔNG chặn** việc đọc tài khoản quảng cáo thật — lo ngại ghi ở §8 đã được bác bỏ bằng số đo.

### ⚠ Phát hiện: brand thứ tư `NEC` chưa có trong luật gán

Áp đúng `BRAND_PAT` của `build_mkt.py` lên 21 chiến dịch thật của T8:

| Brand | Chiến dịch | Chi tiêu | % |
|---|---|---|---|
| NJFB | 6 | 18.316.509 | 38,5% |
| NDC | 6 | 12.846.399 | 27,0% |
| NCB | 7 | 9.841.787 | 20,7% |
| **KHÔNG XÁC ĐỊNH** | **2** | **6.521.370** | **13,7%** |

Hai chiến dịch rơi ra: `NEC | Messages | 2026` (4.848.395đ) · `NEC | LikePage | 2026` (1.672.975đ).
Số này **khớp y hệt** cột `Không xác định` của `src/data/data_mkt.json` → không phải lỗi API,
mà là **lỗ hổng có sẵn** của luật gán mà probe làm lộ ra.

**Diễn biến — đang xấu đi nhanh:**

| Tháng | 01 | 02 | 03 | 04 | 05 | 06 | 07 | **08** |
|---|---|---|---|---|---|---|---|---|
| % chưa gán | 0 | 0 | 1,0 | 1,5 | 2,9 | 0 | 3,8 | **13,7** |

**Đính chính 27/09/2026 (sau khi kéo đủ 8 tháng):** kết luận ban đầu *"NEC không xuất hiện ở T7"* là **SAI** —
nó rút ra từ danh sách top-10 chiến dịch, mà chiến dịch NEC lớn nhất của T7 chỉ 852.074đ nên rơi khỏi top-10.
Số thật: NEC có mặt **từ T7** với `1.441.081đ` (3 chiến dịch), rồi tăng **4,5×** lên `6.521.370đ` ở T8.
Bài học: không kết luận "không tồn tại" từ một bảng xếp hạng đã cắt ngọn — phải truy vấn toàn tập.

### ❗ Lỗi thiết kế của QA gate cũ

`build_mkt.py` QA gate 10 tính `unknown` trên **toàn bộ 8 tháng cộng lại**:
`ads_stat.unknown = 4,5%` → **dưới ngưỡng 5% nên báo ĐẠT**, trong khi riêng T8 đã **13,7%**.

Trung bình dài kỳ **che mất tháng đang hỏng**. M5.1 sửa: gate 13 tính **theo từng tháng**, không tính gộp.

### Hai việc probe chỉ ra phải làm khi dựng

1. **`dim_ads_campaign` phải có `NEC`** — đây chính là lý do QĐ-4 chọn bảng DB thay vì regex trong code.
   Thêm brand mới = sửa một dòng DB, không phải sửa regex ở hai nơi rồi lệch nhau.
2. **Gate 4 (ngày gấp ≥2×) quá nhạy** — báo động giả ở `2026-08-12` (2.303.736đ vs 933.848đ) dù tổng khớp
   0,00%. Giữ làm **cảnh báo**, tuyệt đối không nâng thành điều kiện chặn.

### Google — CHƯA chạy được

Thiếu `GADS_DEVELOPER_TOKEN`. Vẫn là điểm chặn 🔴 ở §8.

---

## 0.46 ✅ KẾT QUẢ DỰNG — 27/09/2026

### Đã chạy thật, không phải "code xong"

| Việc | Kết quả |
|---|---|
| `005_ads_auto.sql` trên Neon | ✅ 7 bảng + 1 view + 1 hàm. **18 bảng của 3 module cũ nguyên vẹn** |
| `/api/ads/sync?month=2026-08` | ✅ Meta 376 dòng fetched = 376 upserted · mart 124 dòng |
| Google trong cùng lần sync | ✅ trả `NOT_CONFIGURED` **mà không làm vỡ** lần chạy của Meta |
| **QA gate 8 · chạy sync HAI lần** | ✅ `47.526.065đ` cả hai lần — upsert không cộng đôi |
| `/api/ads/performance` | ✅ `complete: true` cho T8 · CPM 33.104đ · CPC 2.282đ · CTR 1,45% · Cost/Conversation 62.865đ |
| `/api/ads/export?month=2026-08` | ✅ XLSX 19KB · 4 sheet đọc lại được · 401/400/404 đúng |
| **QA gate 2 · 3 module cũ** | ✅ `/api/zalo/performance` 200 (cấu trúc key không đổi) · `/api/social/performance` 200 · `/api/ipos/sync` 503 `NOT_CONNECTED` — đúng trạng thái đã ghi ở M10.1 §8, không phải do M5.1 |

### NEC đã tách đúng — QA gate 13 từ ✖ sang ✅

| Brand | media | store | booking | % |
|---|---|---|---|---|
| NJFB | 18.316.509 | 18.316.509 | 0 | 38,5% |
| NDC | 12.846.399 | 12.846.399 | 0 | 27,0% |
| NCB | 9.841.787 | 9.841.787 | 0 | 20,7% |
| **NEC** | 6.521.370 | **0** | **6.521.370** | 13,7% |

**Chiến dịch chưa gán brand: 0** (trước khi dựng là 13,7% chi tiêu).
Hai chiến dịch NEC vào đúng `funnel = booking`, nên `store_spend = 41.004.695đ` tách bạch khỏi `media_spend = 47.526.065đ`.

### ❗ Hai lỗi tự mình gây ra, đã sửa — ghi lại để không lặp

**1. Chuỗi `sao-gạch-chéo` trong comment làm vỡ bundle.**
`api/ads/_meta.ts` có dòng ghi chú `POST /act_*/campaigns`. Chuỗi đó **đóng sớm block comment**,
phần còn lại bị đọc thành mã → `npm run build` vỡ ở esbuild.
→ Viết `/act_<id>/campaigns`. **Không bao giờ để chuỗi đó trong JSDoc.**

**2. Đối chiếu so nhầm đối tượng.**
Băng đối chiếu trên màn hình ban đầu cộng **mọi tháng đang lọc** của Excel rồi so với **phần API đã kéo**.
Đang backfill dần thì API có 1 tháng còn Excel có 8 → báo *lệch 76,71%*, báo động giả.
→ Chỉ so các tháng **cả hai nguồn cùng có**, và hiện rõ `covered/total`.

### ❗ Lỗ hổng QA của repo — phát hiện nhờ lỗi (1)

`tsconfig.json` khai `"include": ["src"]`. Nghĩa là **`npx tsc --noEmit` chưa bao giờ kiểm thư mục `api/`** —
mã server của M8.1 · M10.1 · M8.2 · M5.1 chỉ được esbuild *transpile*, mà transpile thì bỏ qua kiểu.
Một lỗi kiểu trong `api/` lọt qua **cả** `tsc --noEmit` **lẫn** `npm run build`.

→ Thêm `tsconfig.api.json` + `npm run typecheck:api` (**không sửa** `tsconfig.json` đang chạy).
Chạy lần đầu: `api/` sạch, kể cả ba module cũ — không có lỗi nào đang ẩn.

**QA gate 1 sửa lại thành ba lệnh:**

```bash
npx tsc --noEmit          # chỉ src/
npm run typecheck:api     # api/ — TRƯỚC ĐÂY BỊ BỎ SÓT
npm run build
```

### ⏳ Còn phải sửa: ghi từng dòng một

`upsertCampaignDaily` hiện `insert` **một dòng một lượt đi-về** Neon. Tháng T3/2026 có 403 dòng
= 403 lượt → backfill chậm thấy rõ. Trên Vercel (timeout 10s Hobby / 60s Pro) một tháng đông
chiến dịch sẽ **timeout**. Phải gộp thành insert nhiều dòng trước khi bật cron production.

---

## 0.47 ✅ ĐỐI CHIẾU TRỌN 8 THÁNG — 27/09/2026

Backfill T1→T8/2026 qua `/api/ads/sync?month=…`. **2.224 dòng** fact.

| Tháng | API (Meta) | Excel | Lệch |
|---|---|---|---|
| 2026-01 | 6.913.452 | 6.913.452 | **0,00%** |
| 2026-02 | 4.487.025 | 4.487.025 | **0,00%** |
| 2026-03 | 32.238.387 | 32.238.387 | **0,00%** |
| 2026-04 | 23.258.406 | 23.258.406 | **0,00%** |
| 2026-05 | 19.292.452 | 19.292.452 | **0,00%** |
| 2026-06 | 31.967.188 | 31.967.188 | **0,00%** |
| 2026-07 | 38.406.602 | 38.406.602 | **0,00%** |
| 2026-08 | 47.526.065 | 47.526.065 | **0,00%** |
| **Tổng** | **204.089.577** | **204.089.577** | **0,000%** |

Hai đường hoàn toàn độc lập (Meta API theo ngày vs Excel export tay theo tháng) ra **cùng một số
tới từng đồng** trên cả 8 tháng. Đây là bằng chứng mạnh nhất module này có thể đưa ra.

**Tách HR cũng khớp tuyệt đối:** `204.089.577 − 197.099.719 = 6.989.858đ` — đúng con số 6,99tr
chi tuyển dụng ghi ở M5 §6.2, tự rơi ra mà không phải khai tay.

**Chi nhắm tiệc theo tháng:** T3 `63.058đ` (0,2%) · T7 `1.441.081đ` (3,8%) · T8 `6.521.370đ` (13,7%).

### QA gate chạy trên dữ liệu thật

| Gate | Kết quả |
|---|---|
| 1 · `tsc` src + `typecheck:api` + `build` | ✅ cả ba sạch |
| 2 · ba module cũ | ✅ zalo 200 · social 200 · ipos 503 `NOT_CONNECTED` (trạng thái cũ) |
| 3 · currency VND | ✅ 1 tài khoản, 0 sai |
| 5 · không dòng `Tổng số:` | ✅ 0 dòng |
| 6 · spend < 10¹⁰ | ✅ |
| 7 · **đối chiếu ≤2%** | ✅ **0,000%** cả 8 tháng |
| 8 · chạy sync hai lần | ✅ số không đổi |
| 9 · không job treo | ✅ 0 |
| 10 · không rò SĐT | ✅ bảng cụm từ còn rỗng (chờ Google) |
| 11 · mọi campaign có dòng dim | ✅ 0 thiếu |
| 13 · chưa gán brand <5% **mỗi tháng** | ✅ cao nhất 2,93% |
| 14 · nhánh EXPORT vẫn chạy | ✅ nút EXPORT hoạt động, không phụ thuộc DB |

### ❗ Hai lỗi nữa tự mình gây ra — ghi lại

**3. Sửa file giữa lúc backfill đang chạy.**
Sửa `api/ads/_shared.ts` trong khi vòng backfill còn chạy → Vite nạp lại module giữa chừng,
**T5 và T6 trả rỗng** và phải chạy lại. Luật rút ra: **không sửa mã server khi đang có vòng
gọi API dài chạy qua dev server**. Chờ xong rồi sửa.

**4. Kết luận "không tồn tại" từ bảng đã cắt ngọn.**
Xem danh sách top-10 chiến dịch T7 không thấy NEC → kết luận *"NEC chưa có ở T7"*. Sai.
NEC có ở T7 với `1.441.081đ`, chỉ là chiến dịch lớn nhất của nó (852.074đ) rơi khỏi top-10.
Luật: muốn nói "không có" thì **truy vấn toàn tập**, không đọc bảng xếp hạng.

### Còn 4 chiến dịch chưa gán brand — CẦN NGƯỜI QUYẾT

Tổng `1.215.878đ` (0,62% chi 8 tháng). Đều là **biến thể cách đặt tên** mà regex không bắt,
và **Excel cũng bỏ sót y hệt** — không phải lỗi API:

| Chi tiêu | Kỳ | Tên chiến dịch | Nghi là |
|---|---|---|---|
| 528.061 | T4→T5 | `NOIRE DC - Engage` | NDC? |
| 379.483 | T5 | `NOIRE DC - Weekly Performance` | NDC? |
| 245.276 | T3 | `NOIRE JPB - Combo sáng` | NJFB? |
| 63.058 | T3 | `NOIRE DC- Lead Tiệc - Tệp Event` | NDC + funnel booking? |

**Không tự đoán** — gán brand cho dữ liệu thật là quyết định của người vận hành. Sửa bằng:

```sql
update dim_ads_campaign
   set brand = 'NDC', funnel = 'store', mapping_locked = true
 where campaign_name = 'NOIRE DC - Engage';
```

`mapping_locked = true` là chốt: từ đó sync **không bao giờ** đoán đè lên nữa (QĐ-4).

---

## 0.48 ✅ SỬA LUẬT PHỄU — 27/09/2026, sau khi người vận hành chốt NEC

### Lỗi thứ 5, và là lỗi nặng nhất

Người vận hành xác nhận `NOIRE DC- Lead Tiệc - Tệp Event` là **booking tiệc** — chạy nhờ page DC
vì lúc đó chưa có page NEC. Nguyên tắc rút ra: **phễu theo BẢN CHẤT chiến dịch, không theo page nó chạy nhờ.**

Áp nguyên tắc đó lên toàn tập thì lộ ra `guessFunnel` bản đầu **sai có hệ thống**: nó loại trừ ba brand
nhà hàng khỏi phễu `booking`, nên **26 chiến dịch tiệc chạy trên page NCB/NDC/NJFB** bị xếp `store`.

**35.568.697đ — 17,4% chi tiêu 8 tháng.** Trong đó có những cái tên không thể nhầm:
`NOIRE Dining- YEP` (4.559.954đ) · `NOIRE Bistro - Lead tiệc` (2.598.821đ) ·
`NDC | Booking Tiệc | Messages | 2026` (2.242.640đ)…

Nặng ở chỗ: **M10 §3 đã tính đúng** các chiến dịch này là chi phí ads booking từ trước.
Nên M5.1 đang đếm lệch M10 — đúng cái điều chính đoạn ghi chú trong `guessFunnel` nói là phải tránh.

### Luật sau khi sửa — tách theo ĐỘ MẠNH tín hiệu, không theo brand

| Tín hiệu | Từ khoá | Xử lý |
|---|---|---|
| **MẠNH** | `tiệc` · `YEP` · `party` · `banquet` · `sự kiện` · `event` | → `booking`, **bất kể brand** |
| **YẾU** | `booking` · `lead` đứng một mình | → `booking` **chỉ khi** brand không phải NCB/NDC/NJFB |

Tín hiệu yếu phải tách riêng vì `NDC | Messages 2026` là tin nhắn **đặt bàn nhà hàng**, không phải tiệc —
chính M10 §3 nêu ca này.

### Số trước / sau

| | Trước | Sau |
|---|---|---|
| `media_spend` | 197.099.719 | **197.099.719** ✅ **KHÔNG ĐỔI** |
| `store_spend` | 189.074.210 | 153.505.513 |
| `booking_spend` | 8.025.509 | **43.594.206** |
| `hr_spend` | 6.989.858 | 6.989.858 |
| Tổng fact | 204.089.577 | **204.089.577** ✅ |

> **ACR báo cáo BOD không suy suyển** — `media_spend` là tử số của ACR và nó không đổi một đồng.
> Cái đổi là lát `store` vs `booking`, tức chỉ số "ACR phần nhà hàng" mới thêm hôm nay, chưa báo cáo ra ngoài.

### Chi nhắm tiệc theo tháng — con số đáng để BOD nhìn

| Tháng | store | booking | % booking |
|---|---|---|---|
| 2026-01 | 995.777 | 5.917.675 | **85,6%** |
| 2026-02 | 3.075.802 | 1.144.007 | 27,1% |
| 2026-03 | 11.495.507 | 15.457.841 | **57,4%** |
| 2026-04 | 12.524.895 | 9.295.908 | 42,6% |
| 2026-05 | 17.392.921 | 1.899.531 | 9,8% |
| 2026-06 | 31.967.188 | 0 | 0,0% |
| 2026-07 | 35.048.728 | 3.357.874 | 8,7% |
| 2026-08 | 41.004.695 | 6.521.370 | 13,7% |

Nửa đầu năm tiền đổ vào tiệc là chính (T1 **85,6%**, T3 **57,4%**), T6 về **0**, rồi tăng lại từ T7.
Cùng một con số ACR nhưng ý nghĩa T1 và T6 khác hẳn nhau — điều mà lát `store/booking` mới nói ra được.

### Đã kiểm lại sau khi sửa

- Đối chiếu Excel **0,000% cả 8 tháng** — vẫn nguyên
- `store + booking + hr = 204.089.577` = tổng fact ✅
- **QA gate 12 tự chứng minh:** sync chạy lại với regex mới *sẽ* gán
  `NOIRE DC- Lead Tiệc - Tệp Event` thành NDC (vì `noire dc` nay khớp), nhưng
  `mapping_locked = true` **giữ đúng `NEC`** như người vận hành chọn. Cơ chế QĐ-4 hoạt động đúng thiết kế.
- 0 chiến dịch chưa gán brand · 8/8 gate dữ liệu xanh

---

## 0.5 SỔ TAY TƯ DUY — quyết định & vì sao

Ghi lại để lần sau không phải suy luận lại, và để người khác **kiểm được logic** chứ không phải tin.

### Bước 1 — Đọc trước, thiết kế sau

Đã đọc, không đoán: `build_mkt.py:112-280` (ETL Meta + Google) · `monthly_lib.py:212` (`store_in_text`) ·
`api/zalo/_shared.ts` · `api/ipos/_shared.ts` · `api/ipos/sync.ts` · `api/zalo/performance.ts` ·
`api/social/_shared.ts` · `src/views/DigitalAdsView.tsx` · `src/views/ZaloOAView.tsx` ·
`src/types/mkt.ts` · `vite.config.ts` · `vercel.json` · `database/migrations/001` + `003` ·
`docs/modules/M5_Digital_Ads.md` · `M8_2_Social_Auto.md` · `00_INDEX_MODULES.md`.

**Phát hiện quyết định kiến trúc:** repo đã có **3 tiền lệ** module API cùng một khuôn
(M8.1 Zalo · M10.1 iPOS · M8.2 Social). M5.1 **không được sáng tạo khuôn thứ tư** — đi theo khuôn có sẵn
thì người bảo trì đọc một file hiểu cả bốn.

### QĐ-1 · Song song · API là nguồn chính · Excel là nguồn dự phòng

| Phương án | Vì sao KHÔNG / CÓ |
|---|---|
| API thay thế hoàn toàn | ✖ Số T7–T8/2026 đang nằm trong Excel và **đã báo cáo BOD**. Gỡ nhánh Excel trước khi backfill xong là mất chuỗi lịch sử đang được trích dẫn |
| API chỉ để đối chiếu QA | ✖ Không đạt mục tiêu "tự động lấy dữ liệu về hệ thống" |
| **Song song · API ưu tiên** | ✔ Đúng khuôn `ZaloOAView` đã làm (`source: 'api' \| 'export'`). API chưa nối thì màn hình **tự rơi về Excel** thay vì để trống. Và có được thứ quý nhất: **đối chiếu số API vs số Excel trên cùng một tháng** — QA gate mạnh nhất có thể có, xem §6 gate 7 |

**Hệ quả bắt buộc:** `DigitalAdsView` phải có công tắc nguồn **nhìn thấy được**, và khi lệch >2% giữa
hai nguồn thì **hiện cảnh báo trên màn hình**, không im lặng chọn một bên.

### QĐ-2 · Grain = ngày × chiến dịch × nền tảng

Excel hiện tại là **tháng × chiến dịch**. M5 §cuối đã ghi lại đúng cái giá của việc thiếu chiều thời gian:
*"Bản trước lưu Google Ads dưới dạng ảnh chụp một kỳ… mỗi lần nộp tháng mới, màn hình vẫn hiện kỳ cũ — im lặng."*

Lưu theo **ngày** mở ra ba thứ Excel không làm được, và đóng lại đúng cái lỗi trên:

1. **ACR theo tháng trọn kỳ tính được tự động** — có `stat_date` thì biết tháng đã đủ ngày chưa,
   không phải khai tay như `isPartialMonth` hiện nay
2. Diễn biến trong tháng · so tuần · phát hiện ngày chi bất thường
3. Cắt lại theo **bất kỳ** kỳ nào (7D/MTD/QTD) mà không phải export lại

Chi phí: ~150 dòng/ngày × 2 nền tảng ≈ **110k dòng/năm**. Không đáng kể.

**Không chọn grain ad/creative** vì: nhân 5–10× số dòng, Meta tính 1 request/level nên sync chậm hơn,
mà NOIRE **chưa có quy trình chấm creative** — dựng trước khi có người dùng là nợ kỹ thuật.
Ghi vào §7 để lần sau muốn mở thì biết đường.

### QĐ-3 · Phase 0 probe trước khi dựng migration

M10.1 đã trả giá **hai lần** cho việc tin tài liệu: header `access-token` vs `access_token` gộp thành
giá trị nối đôi → 401; và `GET /v1/partner/brands` trả rỗng dù JWT khớp. Cả hai **chỉ lộ ra khi gọi thật**.

Nên: `scripts/ads-probe.mjs` chạy **trước**, in ra tài khoản nào truy cập được, field nào có thật,
và — quan trọng nhất — **số T8/2026 từ API có khớp số T8/2026 trong `src/data/data_mkt.json` không**
(Meta 47.526.065đ · Google 4.411.053đ — mốc đã đo, xem §0.4).
Chưa có kết quả probe thì **không gõ migration**.

### QĐ-4 · Luật gán brand/objective nằm ở DB · KHÔNG port regex sang TS

Đây là quyết định dễ làm sai nhất, nên ghi rõ.

Hiện tại `build_mkt.py:114-124` gán brand/objective bằng regex trên **tên chiến dịch**:
`BRAND_PAT` (NCB/NDC/NJFB) · `HR_PAT` (tuyển dụng) · `OBJ_PAT` (5 nhóm mục tiêu).

| Phương án | Vì sao |
|---|---|
| Port regex sang TS, mỗi bên tự chạy | ✖ **Hai bản luật.** Sửa regex ở Python mà quên TS → số API và số Excel lệch nhau mà không ai biết vì sao. Đây là lỗi **im lặng**, loại tệ nhất |
| **Bảng `dim_ads_campaign` trong DB** | ✔ Sync **tự chèn** dòng cho mỗi chiến dịch mới, đoán brand/objective bằng regex **một lần duy nhất lúc chèn**. Cột `mapping_locked` = người đã sửa tay → sync **không bao giờ ghi đè**. Đúng khuôn `dim_ipos_source` đã dùng ở M10.1 |

Hệ quả: chỗ duy nhất trên đời quyết định "chiến dịch này thuộc brand nào" là **một dòng trong DB** —
xem được, sửa được, không phải đi đọc regex. Regex chỉ còn là giá trị mặc định lúc sinh dòng.

### QĐ-5 · Ba đường xuất báo cáo · không có đường tự gửi ra ngoài

Chốt: XLSX tải từ màn hình · endpoint JSON cho tab khác dùng lại · bảng mart trong Postgres.
**Không** dựng cron tự gửi báo cáo qua Zalo/email ở lần này — gửi ra ngoài là hành động **không thu hồi được**,
để sau khi số đã được đối chiếu đủ một tháng.

### Bước cuối — điều KHÔNG làm

Ghi ra để không ai tưởng là bỏ sót: xem §7.

---

## 1. Kiến trúc

```text
┌─ NGUỒN API ──────────────────────┐   ┌─ NGUỒN EXCEL (giữ nguyên) ─────────┐
│ Meta Marketing API               │   │ data_input/*.xlsx                   │
│   GET /act_<id>/insights         │   │   (nhánh sống · exceljs)            │
│   level=campaign                 │   │        │                            │
│   time_increment=1               │   │        ▼                            │
│ Google Ads API                   │   │ scripts/build-data.mjs  (CẤM SỬA)   │
│   POST /customers/<id>/          │   │        ▼                            │
│        googleAds:searchStream    │   │   src/data/data_mkt.json            │
└────────────┬─────────────────────┘   └────────┬────────────────────────────┘
             │ cron ngày 17:35 UTC = 00:35 ICT           │
             ▼                                           │
   GET /api/ads/sync   Authorization: Bearer CRON_SECRET  │
             │  ├─ ① làm mới dimension (tài khoản · chiến dịch)
             │  ├─ ② kéo cửa sổ [T-N ngày, hôm qua]   N mặc định 7
             │  ├─ ③ upsert theo (platform, campaign_id, stat_date)
             │  └─ ④ gọi ads_refresh_daily_metric() dựng lại mart
             ▼                                           │
┌─ POSTGRES ────────────────────────────────────────────┐│
│ dim_ads_account        tài khoản quảng cáo            ││
│ dim_ads_campaign       chiến dịch + brand/objective   ││
│                        (regex đoán 1 lần · locked)    ││
│ ads_campaign_daily     FACT · ngày × chiến dịch       ││
│ ads_search_term_daily  cụm từ Google theo ngày        ││
│ ads_network_daily      kênh hiển thị Google theo ngày ││
│ ads_daily_metric       MART ngày × brand × nền tảng   ││
│ ads_sync_run           nhật ký chạy                   ││
└──────────────────┬────────────────────────────────────┘│
                   │                                     │
        GET /api/ads/performance?period=…                │
        GET /api/ads/export?month=…  (XLSX)              │
                   │                                     │
                   ▼                                     ▼
        ┌────────────────────────────────────────────────────────────┐
        │  DigitalAdsView.tsx                                        │
        │    nguồn = API    ──▶ /api/ads/performance                 │
        │    nguồn = EXPORT ──▶ MKT_DATA.ads_* (đường cũ, nguyên vẹn)│
        │    lệch >2%       ──▶ hiện cảnh báo, KHÔNG im lặng         │
        └────────────────────────────────────────────────────────────┘
```

### 1a. Vì sao là M5.1 chứ không nhập vào M5

Cùng lý do M10.1 tách khỏi M10: **khác grain · khác vòng đời · khác nguồn sự thật**.
M5 là màn hình đọc Excel theo tháng, đang sống. M5.1 là pipeline API theo ngày, đang dựng.
Nhập chung thì không ai phân biệt được lỗi thuộc bên nào khi số lệch.

Hai tài liệu, **một tab** — người dùng không thấy sự chia tách này, và đó là đúng.

### 1b. Vì sao cron ngày, không phải webhook

Meta và Google **không có webhook cho số liệu chi tiêu**. Cả hai chỉ có API kéo.

Thêm nữa: số của ngày hôm nay **chưa chốt** — Meta còn hiệu chỉnh attribution tới 28 ngày,
Google chốt chi phí sau ~3 giờ. Nên cron ngày kéo **cửa sổ 7 ngày** rồi upsert, chứ không kéo một ngày:
ngày T-3 hôm nay có thể khác ngày T-3 hôm qua, và upsert sẽ bắt được điều đó.

### 1c. Bản đồ file — sửa gì thì đọc gì

| Cần làm | Đọc / sửa file |
|---|---|
| Thêm field từ Meta | `api/ads/_meta.ts` → `INSIGHT_FIELDS` + `mapMetaRow()` |
| Thêm field từ Google | `api/ads/_google.ts` → GAQL + `mapGoogleRow()` |
| Sửa cách gán brand | **Không sửa code** — sửa một dòng `dim_ads_campaign` trong DB |
| Đổi công thức ACR | `api/ads/performance.ts` → **§3 phải sửa cùng lúc** |
| Thêm cột lưu | `005_ads_auto.sql` bằng `alter table … add column if not exists` |
| Thêm sheet vào XLSX | `api/ads/export.ts` |
| Nối field mới lên màn hình | `src/types/ads.ts` → `src/views/DigitalAdsView.tsx` |

---

## 2. Data model

Tất cả bảng prefix `ads_` / `dim_ads_` — luật §0.5.

### 2a. `dim_ads_account` — tài khoản quảng cáo

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `platform` | text | `meta` · `google` — khoá chính cùng `account_id` |
| `account_id` | text | Meta: id **không** có tiền tố `act_` · Google: customer id 10 số không dấu gạch |
| `name` | text | tên tài khoản từ API |
| `currency` | text | **phải kiểm = `VND`** — xem §6 gate 3 |
| `timezone` | text | Meta trả `timezone_name`. Lệch timezone = lệch ngày, xem §3c.3 |

### 2b. `dim_ads_campaign` — chiến dịch + luật gán *(bảng quan trọng nhất)*

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `platform` · `campaign_id` | text | khoá chính |
| `campaign_name` | text | cập nhật mỗi lần sync — tên có thể đổi |
| `brand` | text | `NCB` · `NDC` · `NJFB` · `Tuyển dụng` · `Không xác định`. **Regex đoán 1 lần lúc chèn** |
| `objective` | text | 5 nhóm của `OBJ_PAT` + `Khác` |
| `store_code` | text | khoá join sang `dim_store`. Google Performance Max map theo tên chiến dịch |
| `is_hr` | boolean | `true` = chiến dịch tuyển dụng → **loại khỏi ACR**, xem §3a |
| `mapping_locked` | boolean | `true` = người đã sửa tay → sync **KHÔNG ghi đè** `brand`/`objective`/`store_code`/`is_hr` |
| `first_seen` · `updated_at` | timestamptz | |

> Đây là chỗ **duy nhất** quyết định chiến dịch thuộc brand nào. Regex chỉ sinh giá trị mặc định.

### 2b-bis. ❗ BẢNG GÁN BRAND & PHỄU — CHỐT 27/09/2026, KHÔNG HỎI LẠI

> Người vận hành đã xác nhận. Đây là **nguồn sự thật** cho câu hỏi "chiến dịch này thuộc ai".
> Trước khi hỏi bất kỳ ai, đọc bảng này.

#### Bốn brand

| Mã | Tên đầy đủ | Là gì | Mẫu số doanh thu tương ứng |
|---|---|---|---|
| **NCB** | Noire Café & Bistro | nhà hàng | `store_month.net` |
| **NDC** | Noire Dining & Café | nhà hàng | `store_month.net` |
| **NJFB** | Noire Japanese Fusion & Bar | nhà hàng | `store_month.net` |
| **NEC** | **NOIRE Events & Catering** | **page chạy booking tiệc** | **M10 Booking — KHÔNG nằm trong `store_month.net`** |

#### Biến thể cách đặt tên đã gặp

Người chạy ads gõ tay, nên tên chiến dịch không theo một chuẩn. Các biến thể đã xác nhận:

| Viết trong tên chiến dịch | Thuộc brand | Ghi chú |
|---|---|---|
| `NOIRE DC`, `NDC`, `Dining`, `39 NTMK`, `Berkley` | **NDC** | `NOIRE DC` ≠ `NDC` về mặt chuỗi — regex cũ bỏ sót |
| `NOIRE JPB`, `NJFB`, `NFB`, `JFB`, `Japanese`, `Fusion`, `Crest`, `SSV` | **NJFB** | `JPB` là gõ nhầm/biến thể của `JFB` |
| `NCB`, `Bistro`, `The Mett`, `Empress`, `SKC`, `Café` | **NCB** | |
| `NEC`, `Events & Catering`, `NOIRE Events` | **NEC** | |

#### Phễu — chi tiêu này so được với mẫu số nào

| Phễu | Nhận diện | Vào ACR? | Mẫu số |
|---|---|---|---|
| `hr` | `hr ` · `tuyển dụng` · `recruit` | ❌ **không** | — không phải marketing thương hiệu |
| `booking` | brand NEC, **hoặc** tên có tín hiệu MẠNH: `tiệc` · `YEP` · `party` · `banquet` · `sự kiện` · `event` | ✅ có, trong `media_spend` | doanh thu tiệc — **M10 theo dõi riêng** |
| `store` | còn lại | ✅ có | `store_month.net` |

**Tín hiệu MẠNH thắng brand.** `NOIRE Dining- YEP` chạy trên page NDC nhưng bán **tiệc**,
không bán bữa ăn tại chỗ → `funnel = booking`.

**Riêng chữ `booking` là tín hiệu YẾU** — `NDC | Messages 2026` là tin nhắn **đặt bàn nhà hàng**,
không phải tiệc (chính M10 §3 nêu ca này). Chữ `booking`/`lead` đứng một mình chỉ tính là
tiệc khi brand **không phải** ba brand nhà hàng.

#### Bốn chiến dịch đã khoá tay

`mapping_locked = true` → sync **không bao giờ** đoán đè lên nữa.

| Chiến dịch | Brand | Phễu | Vì sao |
|---|---|---|---|
| `NOIRE DC - Engage` | NDC | store | biến thể tên |
| `NOIRE DC - Weekly Performance` | NDC | store | biến thể tên |
| `NOIRE JPB - Combo sáng` | NJFB | store | biến thể tên |
| `NOIRE DC- Lead Tiệc - Tệp Event` | **NEC** | **booking** | **Lúc chạy CHƯA CÓ page NEC nên phải chạy nhờ page DC. Bản chất là booking tiệc.** Sau này có page NEC mới tách ra |

> Ca cuối là ví dụ mẫu cho một luật chung: **phễu theo BẢN CHẤT chiến dịch, không theo page nó chạy nhờ.**

#### Muốn sửa gán về sau

```sql
update dim_ads_campaign
   set brand = 'NDC', funnel = 'store', mapping_locked = true, updated_at = now()
 where campaign_name = '<tên chính xác>';
-- rồi dựng lại mart:
select ads_refresh_daily_metric('2026-01-01'::date, '2026-12-31'::date);
```

Xem chiến dịch nào chưa gán: `select * from ads_unmapped_campaign;`

---

### 2c. `ads_campaign_daily` — FACT

Khoá tự nhiên `(platform, campaign_id, stat_date)` → upsert chạy lại được (luật §0.10).

| Cột | Ghi chú |
|---|---|
| `platform` · `campaign_id` · `stat_date` | khoá chính |
| `account_id` | |
| `spend` | `numeric(16,2)` · **VND, đã chia micros** — xem §3c.1 |
| `impressions` · `clicks` | integer |
| `reach` | Meta có · Google **không** → `null`, **không phải `0`** |
| `conversions` | `numeric` — Google trả số **thập phân** (attribution phân số) |
| `results` · `result_type` | Meta: số kết quả theo mục tiêu + tên loại kết quả |
| `messaging_conversations` | Meta `onsite_conversion.messaging_conversation_started_7d` — mẫu số Cost per Conversation |
| `video_views` · `link_clicks` · `frequency` | tuỳ chọn, thêm sau bằng `add column if not exists` |
| `status` | trạng thái chiến dịch lúc sync — để tính `paused_spend` |
| `raw` | `jsonb` · payload gốc đã lược. Giữ để sau thêm field **không phải kéo lại API** |
| `synced_at` | |

### 2d. `ads_search_term_daily` · `ads_network_daily` — Google

Hai bảng **riêng** vì grain khác: cụm từ tìm kiếm là `(campaign_id, search_term, stat_date)`,
kênh hiển thị là `(campaign_id, network, stat_date)`.

Nhồi vào `ads_campaign_daily` là **nhân đôi chi phí** — đúng bẫy M5 §6.3 đã mắc với Excel
(6,28tr thay vì 3,14tr).

`ads_search_term_daily.has_brand_term` — boolean, `true` nếu cụm từ chứa `noire`.
Tính **lúc ghi** để khỏi `ilike` toàn bảng mỗi lần đọc.

### 2e. `ads_daily_metric` — MART

Gộp sẵn `ngày × brand × nền tảng`, dựng lại bằng hàm `ads_refresh_daily_metric(date, date)`
sau mỗi lần sync — đúng khuôn `zalo_oa_refresh_daily_metric()` của M8.1.

Mục đích: query nhanh cho view, và **BI ngoài (Metabase/Looker) cắm vào trực tiếp** không cần
hiểu logic gán brand.

| Cột | Ghi chú |
|---|---|
| `stat_date` · `brand` · `platform` | khoá chính |
| `media_spend` | **đã trừ `is_hr`** — số dùng cho ACR |
| `hr_spend` | tách riêng để minh bạch phần đã trừ (M5 checklist mục 3) |
| `impressions` · `clicks` · `reach` · `conversions` · `messaging_conversations` | |
| `campaigns` | số chiến dịch có chi tiêu > 0 |
| `paused_spend` | chi tiêu của chiến dịch đã tạm dừng (M5 checklist mục 1) |
| `updated_at` | |

### 2f. `ads_sync_run` — nhật ký

`id` · `platform` · `kind` (`window`/`backfill`) · `started_at` · `finished_at` · `ok` ·
`window_from` · `window_to` · `fetched` · `upserted` · `error_message`.

Điều kiện `finished_at is null and started_at < now() - interval '30 minutes'` = **job treo** —
hiện ở §6 gate 9.

### 2g. Luật riêng tư

Số liệu quảng cáo là số **tổng hợp**, không có dữ liệu cá nhân → không cần hash gì.

**Nhưng:** `ads_search_term_daily.search_term` là **truy vấn người dùng thật gõ vào Google**.
Có thể lẫn tên riêng, số điện thoại (khách tìm `noire bistro 0908…`).

**Luật:** trước khi ghi, cụm từ khớp `\d{9,}` (chuỗi ≥9 chữ số) → ghi `'[đã lược]'` và đếm vào
`ads_sync_run`. Không lưu truy vấn có thể nhận dạng cá nhân.

---

## 3. Metric contract

### 3a. CẤM dùng từ "ROAS" — luật kế thừa nguyên văn từ M5 §2

NOIRE không có attribution đủ mạnh: chỉ **8,6% hoá đơn có SĐT**, Meta chỉ đo tới bước tin nhắn.
API **không** làm thay đổi điều này — API chỉ lấy số **nhanh hơn**, không tạo ra attribution.

| Chỉ số | Công thức | Ghi chú bắt buộc trên màn hình |
|---|---|---|
| **Ad Cost Ratio (ACR)** | `media_spend ÷ net_sales` | chỉ số chính báo cáo BOD |
| Net / Meta spend | `net ÷ spend_meta` | **phải ghi rõ: tương quan, không phải nhân quả** |
| Cost per Conversation | `spend ÷ messaging_conversations` | Meta đo được tới bước tin nhắn |
| CPR / CPA | `spend ÷ results` · `spend ÷ conversions` | |
| CPM / CPC / CTR | `spend÷impr×1000` · `spend÷clicks` · `clicks÷impr` | chuẩn ngành, an toàn |

`media_spend` = `spend` của các chiến dịch có `is_hr = false`. Chi tuyển dụng **không phải marketing
thương hiệu** → không vào mẫu số ACR. Vẫn lưu, vẫn hiện riêng ở `hr_spend`.

### 3b. ACR chỉ tính trên tháng trọn kỳ — và giờ tính được tự động

M5 §2 đã ghi bằng chứng: chi ads T8 đủ tháng nhưng doanh thu T8 mới có 18/31 ngày →
ACR ra **1,55%** thay vì **0,74%** thật ở T7. Sai lệch gấp đôi.

Có `stat_date` thì điều kiện "trọn kỳ" **kiểm được bằng dữ liệu**, không phải khai tay:

```
tháng M là trọn kỳ  ⟺  tồn tại ads_campaign_daily với stat_date = ngày cuối của M
                     VÀ tồn tại store_month cho M với đủ số ngày
```

Endpoint `performance` trả cờ `acrFullMonth` + `acrMonth` để view **ghi thẳng lên thẻ chỉ số**
đang tính trên tháng nào. **Không có cờ thì không hiện số ACR.**

### 3c. Ba bẫy đơn vị phải chặn ngay ở tầng map

Học từ M10.1 và M5 §6 — bẫy đơn vị là loại sai **im lặng** nhất.

1. **Google Ads trả `cost_micros`, không phải đồng.** `1.000.000 micros = 1 VND`.
   Quên chia là chi phí gấp **một triệu lần**. Chia ở `_google.ts` **ngay lúc map**, không để tầng trên chia.
2. **Meta trả `spend` dạng chuỗi** (`"1234.56"`), không phải số. `Number()` trước khi cộng;
   `NaN` thì **throw** chứ không lặng lẽ thành `0`.
3. **Ngày của API là ngày theo timezone TÀI KHOẢN, không phải ICT.** Tài khoản đặt
   `America/Los_Angeles` thì `2026-08-31` của Meta lệch một ngày so với ICT.
   → probe **phải in `timezone_name`**; lệch `Asia/Ho_Chi_Minh` thì ghi vào `dim_ads_account.timezone`
   và **cảnh báo trên màn hình**, không tự chuyển đổi âm thầm.

### 3d. Đối chiếu bắt buộc: API vs Excel

Với mỗi tháng có **cả hai** nguồn, tính `|spend_api − spend_excel| ÷ spend_excel`:

| Lệch | Nghĩa | Hành động |
|---|---|---|
| < 0,5% | làm tròn · attribution còn hiệu chỉnh | ✅ bình thường |
| 0,5–2% | một chiến dịch lệch cách gán, hoặc lệch timezone | ⚠️ hiện cảnh báo, ghi QA |
| > 2% | **sai cấu trúc** — thiếu tài khoản, lẫn cấp adset, hoặc bẫy micros | ✖ **chặn**, không cho màn hình dùng nguồn API |

Đây là QA gate mạnh nhất của module: **hai đường độc lập cùng ra một số** thì tin được cả hai.

---

## 4. API contract

### 4a. Meta Marketing API

```
GET https://graph.facebook.com/<ver>/act_<ACCOUNT_ID>/insights
    level=campaign                        ← BẮT BUỘC. Thiếu = lẫn adset, bẫy M5 §6.1
    time_increment=1                      ← 1 dòng / 1 ngày
    time_range={"since":"…","until":"…"}
    fields=campaign_id,campaign_name,spend,impressions,clicks,reach,frequency,actions
    limit=500                             ← có paging qua paging.next
```

| Điểm | Ghi chú |
|---|---|
| Token | **System User token** của Business Manager — không hết hạn. KHÔNG dùng user token (60 ngày) cho cron |
| Quyền | `ads_read` là đủ. **Không xin `ads_management`** — luật §0.9, tránh vô tình có quyền ghi |
| Rate limit | Header `X-Business-Use-Case-Usage`. >90% thì dừng, ghi `ads_sync_run`, để cron sau chạy tiếp |
| Kỳ dài | >90 ngày nên dùng async job (`POST /insights` → poll `async_percent_completion`). Backfill dùng, cron ngày không cần |
| `actions` | mảng `{action_type, value}`. Lọc lấy `onsite_conversion.messaging_conversation_started_7d` |
| Dùng lại | `FB_GRAPH_VERSION` · `FB_APP_ID` · `FB_APP_SECRET` **đã có** từ M8.2 — không khai thêm |

### 4b. Google Ads API

```
POST https://googleads.googleapis.com/<ver>/customers/<CUSTOMER_ID>/googleAds:searchStream
Headers: Authorization: Bearer <access_token sinh từ refresh_token>
         developer-token: <GADS_DEVELOPER_TOKEN>
         login-customer-id: <MCC id — chỉ khi truy cập qua MCC>
Body:    { "query": "<GAQL>" }
```

Ba GAQL, mỗi cái vào **một** bảng:

| Bảng đích | GAQL (rút gọn) |
|---|---|
| `ads_campaign_daily` | `SELECT campaign.id, campaign.name, campaign.status, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date BETWEEN '…' AND '…'` |
| `ads_network_daily` | `… segments.ad_network_type … FROM campaign WHERE …` |
| `ads_search_term_daily` | `SELECT campaign.id, search_term_view.search_term, segments.date, metrics.* FROM search_term_view WHERE …` |

| Điểm | Ghi chú |
|---|---|
| `cost_micros` | **chia 1.000.000** — bẫy §3c.1 |
| `metrics.conversions` | số **thập phân**, không phải integer |
| Không có `reach` | Google không trả reach → cột `reach` = `null`, **không phải 0** |
| Dòng `Tổng số:` | API **không** trả dòng cộng dồn — bẫy M5 §6.3 chỉ có ở export Excel. Không cần lọc, nhưng §6 gate 5 vẫn kiểm |
| `developer-token` | phải xin Google phê duyệt. Test token chỉ gọi được tài khoản test — xem §8 |
| Phiên bản API | đặt ở `GADS_API_VERSION`. Probe in ra version nào gọi được. **Không hardcode** |

### 4c. Nội bộ

| Route | Method | Bảo vệ | Trả về |
|---|---|---|---|
| `/api/ads/sync` | GET·POST | `Bearer CRON_SECRET` | `{ok, window, platforms:[{platform, fetched, upserted}]}` |
| `/api/ads/performance` | GET | công khai đọc *(cùng mức M8.1)* | `{ok, source, period, window, metrics, daily, byBrand, byPlatform, reconcile, freshness, definitions}` |
| `/api/ads/export` | GET | `Bearer CRON_SECRET` **hoặc** `ADS_EXPORT_SECRET` | XLSX |

`performance` chưa cấu hình thì trả **503 `{code:'NOT_CONFIGURED'}`** — view bắt mã này và
**tự rơi về nguồn Excel**. Đúng khuôn `handleZaloPerformance`.

`export` trả workbook **4 sheet**: `Tổng hợp` · `Theo ngày` · `Theo chiến dịch` ·
**`Định nghĩa chỉ số`** — sheet cuối để BOD đọc không phải hỏi lại ACR là gì.
Dùng `exceljs` đã có trong `devDependencies`.

---

## 5. Cài đặt production

### 5a. Biến môi trường — CHỈ THÊM vào `.env.example`

```
META_ADS_ACCOUNT_IDS=        # nhiều tài khoản ngăn bằng phẩy, KHÔNG có tiền tố act_
META_ADS_SYSTEM_TOKEN=       # System User token, quyền ads_read
GADS_DEVELOPER_TOKEN=
GADS_CLIENT_ID=
GADS_CLIENT_SECRET=
GADS_REFRESH_TOKEN=
GADS_CUSTOMER_IDS=           # customer id 10 số, không dấu gạch
GADS_LOGIN_CUSTOMER_ID=      # MCC id nếu truy cập qua MCC
GADS_API_VERSION=            # trống = mặc định trong code; probe in ra version gọi được
ADS_SYNC_WINDOW_DAYS=7
ADS_EXPORT_SECRET=
```

Dùng lại **không khai thêm**: `DATABASE_URL` · `CRON_SECRET` · `FB_GRAPH_VERSION` ·
`FB_APP_ID` · `FB_APP_SECRET`.

### 5b. Thứ tự việc

1. `npm run probe:ads meta` — xác nhận tài khoản · currency · timezone · field
2. **`npm run probe:ads google-auth`** — lấy `GADS_REFRESH_TOKEN`, xem §5d
3. `npm run probe:ads google` — xác nhận developer token · API version
4. `npm run probe:ads reconcile --month=2026-08` — **so số API với `src/data/data_mkt.json`**
5. Lệch ≤2% → chạy `005_ads_auto.sql`. Lệch >2% → **DỪNG**, tìm nguyên nhân, không dựng tiếp
6. Thêm cron `17:35 UTC` vào `vercel.json`
7. `GET /api/ads/sync?days=90` một lần để backfill T7–T9
8. Nối `DigitalAdsView` nhánh API — **mặc định vẫn là EXPORT** tới khi gate 7 xanh

### 5d. ❗ `GADS_REFRESH_TOKEN` lấy ở đâu

**Không có sẵn ở đâu để copy.** Nó là **kết quả** của một lần cấp quyền OAuth — cấp một lần, dùng mãi
(refresh token của Google không hết hạn trừ khi bị gỡ quyền hoặc 6 tháng không dùng).

Thứ tự:

1. **Google Cloud Console** › APIs & Services › **Credentials** › Create credentials ›
   **OAuth client ID** › loại **Desktop app**
   → ra `GADS_CLIENT_ID` + `GADS_CLIENT_SECRET`, điền vào `.env.local`
2. Cũng ở Cloud Console › **Library** › bật **Google Ads API** cho project đó
3. Chạy:

```bash
npm run probe:ads google-auth
```

Lệnh in ra một đường dẫn. Mở bằng trình duyệt **đang đăng nhập tài khoản có quyền Google Ads**,
bấm đồng ý, Google chuyển về `http://localhost:8787` — trang đó do chính lệnh này phục vụ.
Token được **ghi thẳng vào `.env.local`**, KHÔNG in ra màn hình.

**Ba tham số bắt buộc trong luồng, thiếu một là không ra refresh token:**

| Tham số | Vì sao |
|---|---|
| loại client **Desktop app** | loại Web bắt khai trước redirect URI; Desktop cho phép loopback bất kỳ cổng nào |
| `access_type=offline` | thiếu thì Google chỉ trả access token sống 1 giờ, **không** có refresh token |
| `prompt=consent` | từ lần cấp quyền **thứ hai** trở đi Google BỎ QUA refresh token nếu không ép hỏi lại |

**Nếu Google không trả refresh token:** gần như luôn vì tài khoản đã cấp quyền cho app này trước đó.
Gỡ ở <https://myaccount.google.com/permissions> rồi chạy lại.

> ⚠ `GG_API_KEY` dạng `AIza…` **không dùng được**. Đó là Google Cloud API key (Maps/YouTube/Places).
> Google Ads API **không có** đường xác thực bằng API key — bắt buộc OAuth2 + developer token.
> Ghi lại vì đã nhầm một lần 27/09/2026.

---

### 5e. Lấy refresh token — những gì đã vướng thật (28/09/2026)

Ghi lại để lần sau không mất một buổi như lần này.

| Vướng | Nguyên nhân | Cách xử |
|---|---|---|
| `GG_API_KEY` dạng `AIza…` không dùng được | Đó là API key của Google Cloud (Maps/YouTube). Google Ads API **không có** đường xác thực bằng API key | Bỏ qua khoá đó, dùng OAuth |
| Màn "Đảm bảo đã bật Bluetooth…" | Google bắt đăng nhập bằng **passkey trên điện thoại**, cần Bluetooth giữa PC–điện thoại | "Thử cách khác" → mật khẩu / SMS. Không được thì dùng tài khoản khác |
| Màn "Xác minh danh tính… Nhận Galaxy S20" | Xác minh danh tính của Google, chỉ nhận thiết bị đã đăng ký | **Không lách được.** Chờ thiết bị, hoặc "Cách xác minh khác" nếu có SMS/mã dự phòng |
| Bấm đồng ý nhưng token không về | Bấm trên **điện thoại** → Google chuyển về `localhost` **của điện thoại** | Copy đường dẫn `localhost:8787/?code=…` rồi chạy `npm run probe:ads google-auth -- --code="…"` trên máy tính. Mã sống ~10 phút, dùng 1 lần. **Không dán vào chat** |
| Listener tự đóng khi chưa bấm gì | Request lạc (favicon, lệnh kiểm cổng) bị coi là lượt Google chuyển về | Đã sửa: listener bỏ qua mọi request không có `code`/`error` |
| Hết giờ trước khi kịp đồng ý | Chờ 5 phút là quá ngắn khi đăng nhập trục trặc | Đã nâng lên 15 phút |

**Luật nên theo:** dùng tài khoản **`quangdai122` quyền Chỉ đọc** để cấp quyền, không dùng tài khoản chủ.
Refresh token mang quyền của người bấm đồng ý — tài khoản chỉ đọc thì token có lộ cũng không sửa được ngân sách.

**Chỉ phải làm một lần.** Refresh token của Google không hết hạn trừ khi bị gỡ quyền hoặc 6 tháng không dùng
(cron chạy mỗi ngày nên không bao giờ rơi vào trường hợp thứ hai).

---

**Thêm 28/09/2026 — ba vướng cuối khi lấy token:**

| Vướng | Cách xử |
|---|---|
| `403 org_internal` | Consent screen đang **Internal** → Audience › **Make external** + **Publish app** (In production). Để *Testing* thì refresh token hết hạn sau 7 ngày |
| Trang "refused to connect" ở `localhost:8787` dù Google đã cho qua | Listener đã hết giờ. Bật lại rồi bấm link lại — KHÔNG chép `code=` từ ảnh chụp |
| Mọi phiên bản API trả 404 | Danh sách thử cũ: v17–v21 đã bị gỡ. Hiện hành **v22–v25** (v26+ chưa có). Cập nhật trong `_google.ts` + probe |
| `403 The caller does not have permission` | Câu chung chung. Mã thật nằm ở `details[].errors[].errorCode` — nay code in ra luôn: `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` = developer token mức Test |

### 5c. Cron

```json
{ "path": "/api/ads/sync", "schedule": "35 17 * * *" }
```

17:35 UTC = 00:35 ICT — sau 3 cron đang có, và sau khi Google chốt chi phí ngày hôm trước.

---

## 6. QA gates

| # | Gate | Chặn gì |
|---|---|---|
| 1 | `npx tsc --noEmit` **+ `npm run typecheck:api`** + `npm run build` sạch | vỡ build. Gate cũ thiếu `typecheck:api` nên KHÔNG kiểm `api/` — xem §0.46 |
| 2 | 3 module cũ không suy suyển: `/api/zalo/performance` · `/api/ipos/sync` · `/api/social/performance` vẫn trả như trước | sửa `_shared.ts` làm hỏng module khác |
| 3 | `dim_ads_account.currency = 'VND'` mọi dòng | tài khoản USD cộng thẳng vào VND |
| 4 | `sum(spend)` một ngày **không** gấp ≥2× ngày liền trước mà không có chiến dịch mới | lẫn cấp adset (bẫy M5 §6.1) |
| 5 | Không dòng nào có `campaign_name` bắt đầu bằng `Tổng số` | bẫy M5 §6.3 lọt qua |
| 6 | `spend` Google < 10¹⁰ cho một ngày một chiến dịch | quên chia micros (bẫy §3c.1) |
| 7 | **Đối chiếu API vs Excel ≤2%** cho mọi tháng có cả hai nguồn | §3d — **gate quan trọng nhất** |
| 8 | Chạy `/api/ads/sync` **hai lần liền** → `sum(spend)` không đổi | upsert không idempotent (luật §0.10) |
| 9 | Không `ads_sync_run` nào `finished_at is null` quá 30 phút | job treo im lặng |
| 10 | `ads_search_term_daily` không dòng nào chứa chuỗi ≥9 chữ số | rò dữ liệu cá nhân (§2g) |
| 11 | Mọi `campaign_id` trong fact đều có dòng `dim_ads_campaign` | chiến dịch không gán được brand → rơi khỏi ACR |
| 12 | `dim_ads_campaign` có `mapping_locked = true` → sync **không** đổi `brand` | ghi đè sửa tay của người |
| 13 | `brand = 'Không xác định'` chiếm <5% chi tiêu **CỦA TỪNG THÁNG** | Gate cũ tính gộp 8 tháng → 4,5% báo đạt trong khi T8 là 13,7%. Trung bình che mất tháng hỏng — xem §0.45 |
| 14 | Nhánh EXPORT của `DigitalAdsView` **vẫn chạy** khi `DATABASE_URL` trống | làm vỡ màn hình đang sống (luật §0.2) |

---

## 7. Chủ động loại khỏi scope

Ghi ra để không ai tưởng là bỏ sót.

| Không làm | Vì sao |
|---|---|
| **Ghi lên tài khoản quảng cáo** — đổi ngân sách, bật/tắt, tạo chiến dịch | Luật §0.9. Module này **chỉ đọc**. Muốn ghi thì là module khác, có quy trình duyệt riêng |
| Grain ad/creative | QĐ-2 — chưa có quy trình chấm creative. Mở sau bằng bảng `ads_creative_daily`, **không** sửa bảng cũ |
| **ROAS / attribution doanh thu** | §3a. Không có dữ liệu để làm đúng. Làm sai còn tệ hơn không làm |
| TikTok Ads · Zalo Ads | Zalo Ads chi **0đ** suốt Q3 (M5 §5). TikTok chưa chạy. Dựng khi có chi thật |
| Cron tự gửi báo cáo ra ngoài | QĐ-5 — gửi ra ngoài **không thu hồi được**. Sau khi đối chiếu đủ một tháng |
| Sửa `scripts/build-data.mjs` để nó đọc DB | Luật §0.2. Hai đường ghi phải độc lập |

---

## 8. Đang chặn & rủi ro

| Mức | Việc | Ghi chú |
|---|---|---|
| 🔴 **chặn** | **Google Ads — developer token ở mức TEST** *(cập nhật 28/09/2026)* | OAuth ĐÃ XONG: refresh token có, `listAccessibleCustomers` thấy 3 tài khoản gồm `1956330376`. Nhưng đọc số trả `403 CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` — token Test chỉ đọc được tài khoản test. **Việc còn lại: xin Explorer/Basic access** ở Google Ads (MCC) › Tools › API Center. Không cần sửa code. Duyệt xong chạy `npm run probe:ads reconcile --month=2026-08` rồi sync |
| 🟡 chờ | `quangdai122` phải được mời vào Google Ads `195-633-0376` quyền **Chỉ đọc** và **chấp nhận** | Không cần để LẤY token, nhưng cần để token ĐỌC được số. Làm song song được |
| 🟡 chưa rõ | Developer token đang ở mức **Test** hay **Basic** | Probe `google` sẽ nói rõ khi có refresh token. Test thì chỉ gọi được tài khoản test — xin Basic ở API Center, 1–3 ngày |
| 🔴 **chặn** | **Meta System User token** cần quyền admin Business Manager | User token 60 ngày dùng **tạm cho probe** được, **không** dùng cho cron |
| 🟡 rủi ro | Timezone tài khoản ≠ `Asia/Ho_Chi_Minh` | §3c.3. Probe in ra; lệch thì cảnh báo, **không tự chuyển** |
| 🟡 rủi ro | Meta hiệu chỉnh attribution tới 28 ngày | Cửa sổ 7 ngày bắt được phần lớn. Backfill lại tháng trọn kỳ sau ngày 5 tháng sau |
| 🟡 rủi ro | Số API lệch >2% so với Excel | §3d chặn. Nguyên nhân hay gặp: thiếu tài khoản trong `META_ADS_ACCOUNT_IDS` |
| 🟢 đã tính | Vercel Function timeout 10s (Hobby) / 60s (Pro) | Sync chia theo nền tảng + theo tài khoản, mỗi lần một lô. Quá giờ thì ghi `ads_sync_run` và để cron sau chạy tiếp |

---

## 9. Màn hình M5 ba tầng — dựng lại 28/09/2026

> Nguồn yêu cầu: prompt "Performance & BI Specialist" của người vận hành — đi từ **tổng thể (Blended)**
> tới **từng kênh (Meta → Google)**, giữ ACR làm thước đo chính, tách Dine-in / Tiệc.
> File: `src/views/DigitalAdsView.tsx` (vỏ) · `src/views/ads/AdsDashboard.tsx` (ba tầng) ·
> `src/views/ads/adsModel.ts` (**mọi công thức**) · `src/views/ads/DigitalAdsExcelView.tsx` (bản cũ, dự phòng).

### 9.1 Trục phân tách: 4 MẢNG — người vận hành chốt 28/09/2026

| Mảng | Gồm | Mẫu số ACR |
|---|---|---|
| **NCB · NDC · NJFB** | chi `funnel = store` của từng brand | `store_month.net` của brand |
| **Tiệc · NEC** | chi `funnel = booking` — **bất kể chạy trên page nào** | *không áp dụng* — doanh thu tiệc ở M10 |
| Tuyển dụng | `funnel = hr` | ngoài mọi con số, chỉ hiện ở khung ghi chú |

**Page NEC mở từ T7/2026** (đo được: chi đầu tiên trên page NEC ngày **15/07/2026**). Trước đó chiến dịch tiệc
chạy **nhờ page brand**, nhận diện bằng tên (*tiệc · YEP · party · sự kiện…* — luật `guessFunnel`, §2b-bis).
Hệ quả: *mảng* là Tiệc, nhưng *page* là brand. Hai chiều này tách riêng — biểu đồ "Chi tiệc theo page" dùng page.

**Sửa gán 28/09/2026:** `NOIRE DC- Lead Tiệc - Tệp Event` (T3/2026) — hôm trước gán page = NEC, nhưng T3 chưa có
page NEC → sửa page = **NDC**, giữ `funnel = booking`, `mapping_locked = true`. Tổng mảng Tiệc không đổi.

**Bỏ ngân sách CRM Q3 (15tr Meta, 30tr Zalo)** khỏi M5 — người vận hành chốt: CRM thuộc M8.

### 9.2 Mục tiêu dữ liệu — mỗi khối trả lời MỘT câu hỏi

Câu hỏi in ngay trên màn hình, dưới tiêu đề từng tầng/khối. Khối nào không trả lời được câu gì thì không có mặt.

| Tầng | Câu hỏi |
|---|---|
| **1 · Tổng quan** | Tiền quảng cáo có nằm trong khung cho phép so với doanh thu, và giải ngân có đúng nhịp kế hoạch không? |
| **2 · Meta** | Mỗi đồng Meta mua được bao nhiêu hội thoại và lead, nội dung có kéo được click, tệp có bão hoà không? |
| **3 · Google** | Google bắt được nhu cầu tìm quán ở kênh nào, và mỗi hành động tốn bao nhiêu? |

| Khối | Câu hỏi | Dạng |
|---|---|---|
| Thẻ ACR | Có vượt trần không? | số lớn + trạng thái |
| Chi media theo tháng × mảng | Tiền dồn vào mảng nào, dịch chuyển ra sao? | cột chồng, tô vùng kỳ đang xem |
| Tỷ trọng kênh | Meta/Google chia ngân sách thế nào? | vòng, % ở chú giải |
| ACR theo tháng | Tháng nào vượt trần? | đường + vạch mục tiêu |
| Kế hoạch vs thực chi từng tháng Q3 | Tháng nào chi lệch? | cột đôi, nhãn % đạt |
| Giải ngân Q3 | Tiền có nằm im so với kế hoạch đã tới hạn? | bảng, trạng thái màu |
| Chi Meta + kết quả theo ngày/tuần | Tiền đổ ngày nào, ngày đó có ra hội thoại? | **hai** biểu đồ xếp dọc |
| Phễu Meta | Rơi ở bước nào: không bấm, hay bấm mà không nhắn? | các bước + tỉ lệ chuyển |
| Chi phí / tin nhắn theo mảng | Mảng nào mua hội thoại rẻ/đắt? | cột ngang + bảng |
| Chi tiệc theo page | Tiệc đã chuyển hẳn sang page NEC chưa? | cột chồng theo page |
| Bảng chiến dịch | Chiến dịch nào ăn tiền không ra hội thoại, tệp nào đã nóng? | bảng sắp xếp được |
| Chi phí / chuyển đổi theo kênh hiển thị (Google) | Kênh nào rẻ nhất để kéo khách tới quán? | cột ngang |
| Cụm từ tìm kiếm | Khách tìm theo tên quán hay theo nhu cầu? | ô số + bảng |

### 9.3 Định nghĩa chỉ số (một chỗ duy nhất: `adsModel.ts`)

| Chỉ số | Công thức | Ghi chú |
|---|---|---|
| **ACR toàn hệ thống** | (Meta mọi mảng trừ HR + Google) ÷ doanh thu thuần | **Khác màn hình cũ**: bản cũ chỉ tính Meta (T8: 0,90%), bản mới cộng Google (T8: **0,98%**) |
| ACR ăn tại chỗ | như trên, bỏ chi Tiệc khỏi tử số | T8: 0,86% |
| ACR brand | (Meta mảng brand + Google brand) ÷ doanh thu brand | |
| **CPTB** | chi chiến dịch **mục tiêu Tin nhắn** ÷ tin nhắn của **chính** chúng | giữ định nghĩa M5 gốc — xem §9.9 lỗi 2 |
| **CPL** | chi chiến dịch **có phát sinh lead** ÷ số lead | |
| Tin nhắn mới | `onsite_conversion.messaging_conversation_started_7d`, **mọi** chiến dịch | T8: **756** (bản Excel cũ: 710 = chỉ chiến dịch mục tiêu Tin nhắn) |
| Hành động inbound | tin nhắn + lead (Meta) + chuyển đổi (Google) | luôn hiện kèm bóc tách — đây là cộng những hành động khác giá trị |
| CTR tất cả / CTR link | `clicks` / `link_click` ÷ hiển thị | |
| Link click → tin nhắn | tin nhắn ÷ link click | nội dung dẫn vào inbox tốt tới đâu |
| Tần suất 7 ngày | reach & hiển thị **cả cửa sổ 7 ngày**, cấp tài khoản (`ads_period_reach`) | KHÔNG lấy tần suất theo ngày-chiến dịch |
| Reach | cấp tài khoản, tháng cuối kỳ | **không cộng được** qua tháng/chiến dịch/mảng → lọc mảng thì hiện "—" |

Mọi tỉ lệ tính **từ tổng**. API chỉ trả số cộng được.

### 9.4 Giả định — người vận hành CHƯA chốt, làm theo đề xuất

| Giả định | Giá trị | Đổi ở đâu |
|---|---|---|
| Mục tiêu ACR | kế hoạch ads Q3 ÷ mục tiêu doanh thu Q3 = **1,067%** (theo brand: cửa hàng của brand) | `acrTarget()` |
| Ngưỡng ACR | ≤ mục tiêu xanh · ≤ 120% cam · vượt đỏ | `acrStatus()` |
| Kế hoạch tháng đang chạy | chia đều theo ngày | `planToDate()` |
| Ngưỡng tần suất | < 3,5 xanh · 3,5–4 cam · ≥ 4 đỏ | `frequencyStatus()` |
| Chi phí đứng yên | ±10% so kỳ trước coi như không đổi | `costDelta()` |

### 9.5 Kỳ và so sánh

- **Kỳ Meta** = các tháng của bộ lọc chung, cắt ở **hôm qua** (tháng đang chạy chưa có số hôm nay).
- **Kỳ trước** = cùng **số ngày**, liền trước — không lấy "tháng trước" vì T9 mới 27 ngày so với T8 đủ 31 ngày là so lệch.
- **Google chỉ có theo tháng** (Excel T7–T8). Nên bộ chọn kỳ vẫn là **tháng**, không phải ngày tự do như prompt đề xuất —
  chọn ngày tự do thì phần Google bị cắt sai. Khi Google API nối xong mới mở chọn theo ngày.
- **Giải ngân Q3 độc lập với kỳ đang xem** — đó là câu hỏi kiểm soát ngân sách quý. Mỗi kênh so tới ngày **nó có số**.

### 9.6 Lệch so với prompt — có chủ ý

| Prompt yêu cầu | Làm khác | Vì sao |
|---|---|---|
| Biểu đồ **trục kép** chi tiêu × tin nhắn | **Hai** biểu đồ xếp dọc chung trục thời gian | Trục kép là lỗi đọc số hàng đầu (dataviz) — hai thang đo tự do khiến mắt so sai độ lớn. Trục kép chi tiêu × ACR của màn hình cũ cũng đã tách |
| Google: bóc theo **loại chiến dịch** (PMax/Local/Search) | Bóc theo **kênh hiển thị** (Maps · Search · Display · YouTube…) | NOIRE chỉ chạy 5 chiến dịch Performance Max — không có loại nào khác để tách |
| Chỉ đường Maps / cuộc gọi / xem menu | Khung "chưa có" | Excel chỉ trả tổng chuyển đổi. Cần Google Ads API |
| Bộ lọc Chi nhánh | Không có ở phần Meta | Chiến dịch Meta chưa gán cửa hàng (`store_code` trống). Google đã có cửa hàng ở bảng chiến dịch |
| TikTok trong bảng giải ngân | Ghi "chưa chạy" | Không có dữ liệu |
| Màu brand gốc | Bảng màu mới | Màu gốc TRƯỢT 4/5 kiểm validator — NCB↔NDC ΔE 7,2, mắt thường cũng khó tách |

### 9.7 Bảng màu mảng — đã chạy validator dataviz

| Mảng | Nền tối | Nền sáng |
|---|---|---|
| NCB | `#d95926` | `#eb6834` |
| NDC | `#199e70` | `#1baf7a` |
| NJFB | `#c98500` | `#eda100` |
| Tiệc | `#9085e9` | `#4a3aa7` |

Tối: qua 5/5 (CVD ΔE ≥ 8,4 · normal ΔE ≥ 19,8). Sáng: qua 4/5 — xanh ngọc & vàng < 3:1 tương phản
→ **bắt buộc có bảng số đi kèm**, mọi biểu đồ M5 đều có. Nền tảng: Meta xanh dương, Google hồng — khác hẳn bảng mảng
vì là thực thể khác. Thực chi = gold hệ thống · kế hoạch/mục tiêu = xám.

### 9.8 Dữ liệu mới cho màn hình — `006_ads_meta_detail.sql`

| | |
|---|---|
| Cột mới ở fact | `link_clicks` · `leads` · `video_views` (≥3 giây) · `thruplays` |
| `ads_daily_segment` | mart ngày × nền tảng × brand × **phễu** — mọi chỉ số, không chỉ chi tiêu |
| `ads_period_reach` | reach/tần suất theo **tháng** và **7 ngày gần nhất**, cấp tài khoản + chiến dịch |
| API | `/api/ads/performance` thêm khoá: `segments` · `segmentDaily` · `segmentMonthly` · `tiecByPage` · `campaigns` · `reach` · `efficiency` · `previous` · `syncedThrough`. Khoá cũ giữ nguyên |

### 9.9 Năm lỗi phát hiện & sửa trong lượt này

**1. `raw` mã hoá JSON hai lần — do tôi, đã lên `main` qua PR #17.**
Đoạn ghi theo lô `unnest(… JSON.stringify(raw) …::jsonb[])`: postgres.js hỏi server kiểu tham số, thấy `jsonb`
thì **tự stringify thêm một lần**. Cả 2.224 dòng lưu `raw` thành *chuỗi*. Đã thử cả ba cách trên Neon rồi mới chọn
`jsonb_to_recordset(<mảng object>::jsonb)`. Migration 006 gỡ lớp bọc — không mất dữ liệu.
⚠ **Production đang chạy code cũ**: cron sẽ tiếp tục ghi sai cho tới khi bản sửa lên `main`. Sau khi deploy,
**chạy lại migration 006** (an toàn, chỉ đụng dòng còn là chuỗi).

**2. CPTB chia toàn bộ chi của mảng — sai nghĩa.** NCB ra **214.368đ/tin** vì 16tr của NCB là chiến dịch Engagement
không nhằm ra tin nhắn. Sửa về định nghĩa gốc (chiến dịch mục tiêu Tin nhắn): NCB **29.106đ/tin**.

**3. Đường mục tiêu ACR không hiện** — trục Y tự co tới 1%, mục tiêu 1,07% nằm ngoài khung.

**4. Khối tuần cuối chỉ 1 ngày** (31/08) → đồ thị tụt giả. Sửa: khối 7 ngày tính ngược từ ngày cuối.

**5. Chú giải mất màu** — truyền `textStyle: { fontSize }` ghi đè màu mà `EChartWrapper` đặt sẵn.

Lỗi 3–5 thấy nhờ chụp màn hình bằng Chrome headless: khung trình duyệt tích hợp đang **dừng vẽ**
(`requestAnimationFrame` không chạy — màn hình M1 cũ cũng 0 canvas), nên phải kiểm bằng hai đường khác:
(a) dựng `AdsDashboard` ngoài trình duyệt, bắt cấu hình từng biểu đồ, cho ECharts vẽ ra SVG — **16/16 biểu đồ, 0 NaN**;
(b) Chrome headless với hồ sơ tạm riêng, rồi xem ảnh.

### 9.10 Dữ liệu mới nhất

Sync lại T1→T9/2026 ngày 28/09/2026: **2.406 dòng**, T1→T8 khớp Excel **0,00%** từng tháng,
**T9 (01→27/09): 24.777.327đ** — lần đầu có. ACR T9 **chưa hiện** vì doanh thu T9 chưa trọn tháng (luật §3b).
