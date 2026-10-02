# M11 · ĐẶT BÀN — PHỄU CHI PHÍ ADS → ĐƠN ĐẶT BÀN iPOS

> **Đổi mã 01/10/2026:** trước là **M10.1** (con của M10). Tách thành module riêng **M11** vì đặt bàn
> khác hẳn tiệc ở grain, vòng đời, giá trị và nguồn dữ liệu (§1b) — chỉ chung tầng chi phí Ads.
> Link cũ `#m101` vẫn mở được M11.

| | |
|---|---|
| **Câu hỏi** | Mỗi mục chi phí Ads (Meta Ads · Google Ads) chuyển thành **đơn đặt bàn** ra sao, theo từng brand? |
| **`activeView`** | `m11` *(alias `m101`)* |
| **View** | `src/views/ReservationView.tsx` · mô hình `src/utils/reservation.ts` |
| **Giai đoạn 1 — đang chạy** | 5 báo cáo **xuất tệp** từ iPOS Booking → `L0_input/06_ĐAT_BAN/Tháng M.YYYY/` → `scripts/build-reservation.mjs` → `src/data/reservation.json` (nguồn `S27_dat_ban`) |
| **Giai đoạn 2 — chờ iPOS** | `api/ipos/_shared.ts` · `webhook.ts` · `sync.ts` · `database/migrations/003_ipos_reservation.sql` (§2 → §8) |
| **Chi phí Ads** | Postgres M5.1 (`ads_campaign_daily ⋈ dim_ads_campaign`), chỉ `funnel = store` của NCB · NDC · NJFB |
| **Grain** | GĐ1: tháng × nguồn / ngày / cửa hàng · GĐ2: 1 `booking_code` |
| **Phạm vi** | Performance only — đọc đơn để đo phễu. **Không** tạo đơn, **không** đổi trạng thái, **không** CRM |
| **Trạng thái** | 🟢 GĐ1 có số T9/2026 · 🟡 GĐ2 hạ tầng xong, **chặn ở bước brand duyệt kết nối** (§5 bước 0) |

---

## 0. Giai đoạn 1 — báo cáo xuất iPOS (đang chạy từ T9/2026)

### 0a. Thả file

Mỗi tháng một thư mục `L0_input/06_ĐAT_BAN/Tháng <M>.<YYYY>/`, thả nguyên 5 file iPOS xuất (giữ tên, có `(1)` cũng được —
trùng loại thì lấy file sửa gần nhất):

| File iPOS | Cột | Dùng cho |
|---|---|---|
| `nguon_don_dat_ban__xuat_tep` | Nguồn · Giá trị | **số đơn theo nguồn** — chỉ ở cấp toàn chuỗi |
| `theo_doi_tinh_trang_dat_ban` | Ngày · Tổng đơn · Đơn hủy · Số khách | xu hướng ngày, cửa sổ đối chiếu Ads |
| `thong_ke_luong_dat_ban_theo_cu` | Nhà hàng · Tổng số khách · Khách hủy | **tách brand** (map qua `dim_store.aliases`) |
| `ti_le_huy_don` | Trạng thái · Số đơn | đơn huỷ |
| `xu_huong_dat_ban_theo_so_luong` | Nhóm · Lượt | quy mô nhóm khách |

Rồi chạy `npm run build:reservation` (hoặc `CAP_NHAT.bat` — `update.py` tự gọi). Script đọc thêm thực chi Ads từ
Postgres M5.1 bằng `DATABASE_URL` (biến môi trường hoặc `.env.local`), cắt **đúng cửa sổ ngày có đơn**
(T9/2026: 03/09 → 30/09 — iPOS Booking bắt đầu ghi đơn từ 03/09). Không có DB thì giữ số Ads của bản json cũ.
`reservation.json` được commit — Vercel không cần DB lúc build.

### 0b. Mục chi phí ↔ nguồn đơn *(quy ước Marketing chốt 01/10/2026)*

| Mục chi phí (Ads) | Hành động trên nền tảng | Nguồn đơn iPOS ghép cặp | Khoá chia brand |
|---|---|---|---|
| **Meta Ads** = Tin nhắn + Tương tác | hội thoại (`messaging_conversations`) | **Fanpage** = FacebookCRM + Fanpage | hội thoại Meta của brand |
| **Google Ads** = PMax Local | chuyển đổi Google | **Google Ads** = Google Ads *(7 mã cùng tên)* + Website | chuyển đổi Google của brand |

**Zalo Ads không tính** — chưa có thực chi; ZaloCRM xếp vào kênh sở hữu, không gắn chi phí.
Nguồn không gắn chi phí: ZaloCRM · Marketing · Gọi đặt · Hotline · Vãng lai · Sales · CTV · Nội bộ · Đối tác.
Luật gán nằm ở `SOURCE_RULES` / `ADS_ITEMS` trong `build-reservation.mjs` và đi kèm dữ liệu — view không tự phân loại lại.

### 0c. Phân bổ brand — vì sao là ƯỚC TÍNH

iPOS chỉ xuất nguồn đơn ở **cấp toàn chuỗi**; brand chỉ tách được ở báo cáo **khách** theo cửa hàng. Nên:

1. Tầng Ads (chi phí · hiển thị · click · hội thoại · chuyển đổi) — **số thật** theo brand.
2. Đơn của nguồn trả phí chia cho brand theo **tín hiệu Ads của đúng mục đó** (bảng 0b).
3. Nguồn còn lại lấp phần còn thiếu của mỗi brand so với *đơn ước tính theo tỷ trọng khách đặt*, chuẩn hoá về đúng tổng.
   Tổng đơn mọi brand **luôn bằng** tổng đơn iPOS.
4. Đơn giữ = đơn × (1 − tỷ lệ khách huỷ của brand). Khách giữ chỗ = đơn giữ × khách/đơn trung bình chuỗi.

Hệ quả cần nói rõ trên màn hình: tỷ lệ *hội thoại → đơn* giống nhau giữa các brand (do cách chia). Khác biệt thật
giữa brand nằm ở **chi phí / hội thoại** và **chi phí / chuyển đổi**. Muốn số thật theo brand: xuất thêm
"Nguồn đơn đặt bàn" **lọc riêng từng nhà hàng** — đây là việc của Ops, không phải việc code.

### 0d. QA giai đoạn 1 (in khi build, hiện ở cuối màn hình)

| # | Chốt | T9/2026 |
|---|---|---|
| 1 | Đủ 5 báo cáo | ✔ 5/5 |
| 2 | Tổng đơn khớp giữa nguồn · ngày · tỷ lệ huỷ · quy mô nhóm | ✔ 592 ở cả 4 |
| 3 | Đơn huỷ khớp (ngày ↔ tỷ lệ huỷ) | ✔ 93 |
| 4 | Số khách khớp (cửa hàng ↔ ngày) | ⚠ 1.839 ↔ 1.550, lệch 289 — iPOS không ghi trục ngày của từng báo cáo |
| 5 | Cửa hàng iPOS nhận ra hết | ✔ 11/11 |
| 6 | Nguồn đơn phân loại hết | ✔ 13 nguồn |
| 7 | Mã nguồn trùng tên | ⚠ "Google Ads" ×7 mã — cùng vụ §3b |

### 0e. Kết quả T9/2026 (03/09 → 30/09)

592 đơn · 93 huỷ (15,7%) · 1.839 khách đặt · thực chi Ads nhà hàng 23,7 tr (cả tháng 25,1 tr; tiệc NEC 7,0 tr thuộc M10).

| Mục chi phí | Thực chi | Hành động | Đơn (nguồn) | Chi phí / đơn | Chi phí / đơn giữ |
|---|---:|---:|---:|---:|---:|
| Meta Ads *(Tin nhắn 12,7 tr + Tương tác 8,5 tr)* | 21,2 tr | 556 hội thoại (38 k) | 83 Fanpage *(FacebookCRM 81 + Fanpage 2)* | 255 k | 310 k |
| Google Ads | 2,5 tr | 1.402 chuyển đổi | 76 Google Ads *(Google Ads 38 + Website 38)* | 33 k | 41 k |

Kênh có Ads tạo 159/592 đơn (27%) · thực chi ÷ đơn từ Ads = 149 k; điện thoại + vãng lai 54%.
Chi phí Meta / hội thoại (gồm cả chi Tương tác): NJFB 27 k · NDC 41 k · NCB 115 k.
Tỷ trọng chi ↔ đơn: NCB 23% ↔ 16% · NDC 41% ↔ 41% · NJFB 36% ↔ 42%. Khách huỷ: NDC 24% · NCB 14% · NJFB 14%.

---

> Tài liệu gốc: [iPOS Booking Open API](https://documenter.getpostman.com/view/2386655/2s83t9LZno) ·
> `BASE_URL = https://booking.ipos.vn/api`

---

## 1. Kiến trúc

```text
iPOS Webhook ──POST /api/ipos/webhook?k=<secret>──▶ xác thực secret trong query
                                                     │
                                                     ├─ payload CHỈ là tiếng gõ cửa
                                                     ├─ luôn refetch filters{codes:[code]}
                                                     ▼
                                          ipos_reservation (upsert)
                                          ipos_reservation_status_log (append)

Vercel Cron 00:15 ICT ─▶ /api/ipos/sync
        ├─ filters{created_at:[T-7, now], page_size 500}     ← đơn mới + sửa gần đây
        ├─ filters{codes: đơn đang mở, meal_day ≥ T-1}       ← bắt đổi trạng thái muộn
        └─ (tuần) get-list-fb theo nhà hàng × ngày           ← dựng ipos_table (số chỗ ngồi)
                                                     ▼
                              ipos_reservation · ipos_reservation_status_log
                              dim_ipos_source · dim_ipos_restaurant · ipos_table
                              ipos_sync_run (audit)
                                                     ▼
Dashboard ──GET /api/ipos/reservations?period=──▶ M11 (GĐ2)
           │
           └─ 503 NOT_CONFIGURED ─▶ màn hình hiện trạng thái chờ kết nối, không dựng số giả
```

### 1b. Vì sao tách khỏi M10 — và vì sao thành module riêng M11

`M10_Booking.md` §3 đã ghi sẵn bằng chứng: sổ Sales lẫn ~110 dòng đặt bàn 2 khách NJFB T7.
**Để lẫn:** 142 lead · chốt 86% · TB 3,3 tr/tiệc. **Tách ra:** 32 lead · TB 13,5 tr/tiệc.
Nhập đặt bàn vào M10 là tái tạo đúng lỗi đã vá ngày 17/09/2026.

| | M10 · Tiệc & sự kiện | M11 · Đặt bàn |
|---|---|---|
| Đơn vị | 1 lead trong sổ Sales | 1 `booking_code` trong iPOS |
| Nguồn | Excel `S07_lead` nhập tay | API + webhook, realtime |
| Vòng đời | tuần → tháng | giờ → ngày |
| Giá trị | ~13,5 tr/đơn | vài trăm k, **không có trong API** |
| Trạng thái | won / open / lost (3) | 6 trạng thái, **có no-show** |
| Trục thời gian | tháng nhận lead ↔ tháng diễn ra | `created_at` ↔ `meal_day` |
| Bộ lọc brand | không tách được | tách được theo `restaurant.reference_pos` |

Chung nhau **duy nhất** tầng chi phí ads (M5) — và M11 chỉ lấy phễu nhà hàng (`funnel = store`), chi tiệc NEC
(`funnel = booking`) vẫn thuộc M10. Bản đầu xếp M10.1 là **con của M10** theo khuôn `M8 → M8.1`; khi có số thật
T9/2026 thì rõ đây là một câu hỏi riêng (Ads → đặt bàn theo brand), nên tách thành **M11** ngang hàng M10.

### 1c. Hai trục thời gian — không được trộn

Cùng một luật với M10 §2, khác tên cột:

| Trục | Cột | Dùng cho |
|---|---|---|
| **Ngày tạo đơn** (cohort) | `created_at` | phễu, xu hướng, nguồn đơn, chi phí trên đơn — vì chi ads ngày nào sinh ra đơn ngày đó |
| **Ngày phục vụ** | `meal_day` | công suất, lấp đầy, lịch bàn — gồm cả ngày tương lai |

Mẫu số của mọi tỷ lệ kết quả (đến / no-show / huỷ) **phải lọc `meal_day < hôm nay`**.
Trộn đơn tương lai vào mẫu số sẽ kéo tỷ lệ đến xuống một cách giả tạo.

---

## 2. Data model

Migration: `database/migrations/003_ipos_reservation.sql` — **đã viết và đã chạy 26/09/2026**
(7 bảng trên Neon PostgreSQL, dùng chung DB với M8.1).

| Bảng | Grain | Mục đích |
|---|---|---|
| `dim_ipos_restaurant` | 1 nhà hàng | `pos_parent · pos_id · restaurant_id · name` → map sang `dim_store.code` |
| `dim_ipos_source` | 1 nguồn | `code · name_ipos` + **cột gán tay** `channel · is_paid · platform` |
| `ipos_reservation` | 1 `booking_code` | Bảng fact chính |
| `ipos_reservation_status_log` | 1 lần đổi trạng thái | Đo thời gian xác nhận, thời điểm huỷ |
| `ipos_table` | 1 bàn | `seats · min_person · max_person · area_id · table_type` — **mở khoá M3** |
| `ipos_sync_run` | 1 lần chạy | Audit thành công/thất bại, giống `zalo_oa_sync_run` |

### 2b. `ipos_reservation` — ánh xạ trường

| Cột | Trường API | Ghi chú |
|---|---|---|
| `booking_code` *(PK)* | `booking_code` | mã đơn, duy nhất trong brand |
| `pos_parent` · `pos_id` | `brand_code` · `restaurant.reference_pos` | `reference_pos` là khoá join sang `dim_store` |
| `source_code` | `booking_source` | **chỉ có code, không có tên** → join `dim_ipos_source` |
| `status` | `status` | `WAITING_CONFIRM · CONFIRMED · RECEIVED · COMPLETED · CANCELLED · NOT_COME` |
| `created_at` | `created_at` | unix giây |
| `confirmed_at` | `booking_confirmed_at` | 0 nếu chưa xác nhận |
| `meal_day` | `meal_day` | 00:00 ngày phục vụ |
| `expected_start` · `expected_end` | `meal_start_expected` · `meal_end_expected` | giờ hẹn |
| `real_start` · `real_end` | `meal_start_reality` · `meal_end_reality` | 0 nếu khách chưa ngồi → dùng đo đúng giờ & dwell |
| `seats` · `adult_seats` · `child_seats` | `booking_seats` · `booking_adult_seats` · `booking_child_seats` | số khách đặt |
| `deposit` · `deposit_at` · `deposit_method` | như tên | |
| `total_amount` | `total_amount` | **tiền món đặt trước, KHÔNG phải doanh thu bill** |
| `table_ids` | `table_ids[]` | mảng id bàn |
| `tag_ids` | `tag_ids[]` | join `/reservations/tags` |
| `phone_hash` | `customer_temp_phone` | **HMAC-SHA256 bằng `PHONE_HASH_KEY`, không lưu số thô** |
| `has_note` | `booking_note` ≠ "" | chỉ lưu có/không, không lưu nội dung |
| `collaborator_id` | `collaborator_id` | đơn do CTV đặt |
| `pos_push_failed` | `booking_alt.hub_errors[]` ≠ [] | đơn **không đẩy được về POS** — cờ QA |

Số chỗ ngồi **không có** trong `filters` (chỉ trả `table_ids`). Muốn `ipos_table.seats`
phải quét `get-list-fb` theo nhà hàng × ngày, hoặc `get-info-fb` theo từng mã. Đây là job
riêng chạy theo tuần, không nằm trong sync hằng ngày.

---

## 3. Metric contract

| Metric | Công thức | Lưu ý |
|---|---|---|
| **Đơn tạo trong kỳ** | `count` theo `created_at` | trục cohort |
| **Đơn theo ngày phục vụ** | `count` theo `meal_day` | trục công suất, có tháng tương lai |
| **Khách đặt** | `sum(seats)` | |
| **Khách đến** | `sum(seats)` với `status ∈ {RECEIVED, COMPLETED}` | |
| **Tỷ lệ xác nhận** | `status ∉ {WAITING_CONFIRM}` ÷ tổng | |
| **Tỷ lệ huỷ** | `CANCELLED` ÷ **đơn đã qua ngày phục vụ** | |
| **Tỷ lệ no-show** | `NOT_COME` ÷ **đơn đã qua ngày phục vụ** | mẫu số bắt buộc lọc `meal_day < hôm nay` |
| **Tỷ lệ đến thật** | `(RECEIVED + COMPLETED)` ÷ **đơn đã qua ngày phục vụ** | |
| **Lead time** | trung vị `expected_start − created_at` | khách đặt trước bao lâu |
| **Thời gian xác nhận** | trung vị `confirmed_at − created_at` | chất lượng vận hành lễ tân |
| **Độ trễ nhận bàn** | trung vị `real_start − expected_start` | âm = khách đến sớm |
| **Tỷ lệ đơn có cọc** | `deposit > 0` ÷ tổng | |
| **Chi phí trên đơn đặt bàn** | chi ads kênh ÷ đơn cùng `channel` cùng kỳ | **tương quan, không phải nhân quả** |

### 3b. ❗ Áp nguyên luật cấm "ROAS" của M5 §2

`booking_source` là **kênh tạo đơn trong iPOS**, không phải attribution quảng cáo.

- Nói được: *"28% đơn vào qua FacebookCRM"*.
- **Không** nói được: *"đơn này do campaign X sinh ra"*.

API `/reservations/sources` cho thấy `code` ổn định còn `name` là chữ tự do
(`WEB_SITE1` → "Facebook", `Website_2` → "Tiktok"). Ảnh dashboard iPOS của NOIRE đang có
**ba lát riêng đều tên "Google Ads" (8% · 4% · 8%)** — tức nhiều code trùng tên.

Vì vậy `dim_ipos_source` có ba cột gán tay `channel · is_paid · platform`: gom code về kênh
chuẩn ở tầng dữ liệu, **không** đổi tên trong iPOS (đổi tên không sửa được lịch sử, mà
code mới là thứ đơn cũ trỏ tới).

### 3c. Không có cột doanh thu

API chỉ trả `deposit` (tiền cọc) và `total_amount` (món đặt trước, thường = 0) — **không có
bill thật**. Nối sang doanh thu POS phải qua `phone_hash`, mà `M8_CRM.md` ghi
**chỉ 8,6% hoá đơn có SĐT**. Nên phễu M11 dừng ở *đã đến / số khách*. Không dựng cột
doanh thu ước lượng.

---

## 4. API contract

### 4a. Phía iPOS — endpoint dùng đến

| Endpoint | Method | Header | Dùng khi |
|---|---|---|---|
| `/v1/partner/brands/auth` | GET | `token: <Khoá ứng dụng>` | một lần, lấy URL để admin brand duyệt |
| `/v1/partner/brands` | GET | `access-token` | liệt kê `pos_parent` đã kết nối |
| `/v1/partner/brands/{brand}/restaurants` | GET | `access-token` | dựng `dim_ipos_restaurant` |
| `/v1/partner/reservations/sources` | GET | `access_token` | dựng `dim_ipos_source` |
| `/v1/partner/reservations/tags` | GET | `access_token` | dựng nhãn thẻ |
| **`/v1/partner/reservations/filters`** | **POST** | `access-token` | **xương sống** — backfill + sync |
| `/v1/partner/reservations/get-list-fb` | GET | `access-token` | quét `seats` theo nhà hàng × ngày |
| `/v1/partner/reservations/get-info-fb` | GET | `access_token` | tra một mã đơn |

> ⚠️ Tài liệu iPOS **không nhất quán tên header**: chỗ `access-token`, chỗ `access_token`,
> `Get restaurant detail` gửi cả `access_token` lẫn `token`.
>
> **Đo trên production 26/09/2026 — KHÔNG được gửi cả ba cùng lúc.** iPOS chuẩn hoá
> `_` ↔ `-` nên `access-token` và `access_token` gộp thành một giá trị nối đôi →
> `401 Định dạng partner_key không hợp lệ`. Gửi riêng từng cái đều `200 Hoàn thành`.
> Client nội bộ gửi **một** header, gặp 401/403 mới thử tên kế tiếp.

> 💡 **Đo 26/09/2026: Khoá ứng dụng dùng luôn được làm `PARTNER_ACCESSTOKEN`.**
> `GET /v1/partner/brands` với header là Khoá ứng dụng trả `200` (danh sách rỗng khi chưa
> kết nối brand). Tức `{{PARTNER_ACCESSTOKEN}}` trong Postman chính là Khoá ứng dụng, không
> phải giá trị thứ hai sinh ra sau khi duyệt. Bước duyệt chỉ để **gắn brand vào app**.

Body `filters`:

```json
{ "pos_parent": "BRAND-XXXX", "created_at": [từ, đến], "sources": [], "status": [],
  "codes": [], "phones": [], "tag_ids": [], "page_size": 500, "page_index": 0 }
```

Trả `{ data: { results: [...], total: N }, error: 0 }`. `error ≠ 0` là lỗi nghiệp vụ,
đọc `message`.

**`filters` chỉ lọc theo `created_at`, không lọc theo `meal_day`.** Đơn tạo tháng trước đổi
trạng thái hôm nay sẽ lọt khỏi cửa sổ sync → bắt buộc có vòng re-sync `codes` của đơn đang mở.

Tài liệu **không công bố rate limit**. Backfill chạy tuần tự, `page_size` 500, nghỉ giữa các
trang; nếu dính 429 thì lùi theo cấp số nhân và ghi vào `ipos_sync_run`.

### 4b. Webhook iPOS

```json
{ "event": "RESERVATION_NEW",
  "reservation": { "_id": "…", "code": "N8S2B", "brand_code": "BRAND-BB06",
                   "restaurant_code": "12345", "status": "CONFIRMED", "booking_note": "…" } }
```

`RESERVATION_NEW` · `RESERVATION_CHANGE`. Payload **mỏng** — không có `meal_day`, `source`,
`seats`.

> 🔒 **Webhook không có chữ ký.** Tài liệu ghi `HEADERS: []`. Đây là endpoint POST công khai
> không xác thực. Hai lớp chống: ① secret trong query string `?k=…` so bằng `timingSafeEqual`;
> ② **không bao giờ tin body** — chỉ lấy `code` rồi refetch `filters{codes:[code]}`.
> Sai secret hoặc sai JSON: trả **200** `{ignored: …}` và không chạm database
> *(cùng luật M8.1 §6 — iPOS chỉ nhận Webhook URL khi request kiểm tra được 200)*.

### 4c. Phía nội bộ

| Endpoint | Method | Quyền | Chức năng |
|---|---|---|---|
| `/api/ipos/webhook` | POST | secret trong query `?k=` | nhận tiếng gõ cửa → refetch → upsert · ✅ **đã dựng** |
| `/api/ipos/sync` | GET/POST | `Authorization: Bearer CRON_SECRET` | cron ngày: cửa sổ `created_at` + re-sync đơn mở + dọn hàng đợi webhook · ✅ **đã dựng** |
| `/api/ipos/reservations` | GET | quyền đọc dashboard hiện hữu | KPI + daily trend cho M11 (GĐ2) · ⬜ chưa dựng |

Mã nguồn: `api/ipos/_shared.ts` · `api/ipos/webhook.ts` · `api/ipos/sync.ts`. Nối vào Vite dev
qua plugin `iposApi` trong `vite.config.ts`; cron khai ở `vercel.json` lúc `15 17 * * *` UTC
= 00:15 `Asia/Bangkok`.

`period` nhận `today · 7d · mtd · month` (+ `month=YYYY-MM`), thêm `axis=created|meal` để
chọn trục thời gian, và `brand=` để lọc.

---

## 5. Cài đặt production

0. **Kết nối brand vào app** — đây là việc chặn mọi thứ còn lại.
   `IPOS_APP_KEY` = `IPOS_PARTNER_ACCESS_TOKEN` (cùng giá trị, xem §4a), nên chỉ còn thiếu
   bước gắn brand: `node scripts/ipos-probe.mjs auth` → mở URL → **admin brand bấm duyệt**
   → `node scripts/ipos-probe.mjs brands` phải trả về `BRAND-…` thay vì rỗng.

   > 🔴 **Đang kẹt ở đây (26/09/2026).** Trang `booking.ipos.vn/brand/open-connection`
   > báo *"Ứng dụng không tồn tại hoặc đã bị xoá"*, trong khi phía API app hoàn toàn bình thường:
   > `/brands/auth` trả `200`, JWT chứa `_id = 6ab649d6a16afbac126e37ae` mà ObjectId timestamp
   > `2026-09-25T10:15:50Z` **khớp đúng giây** với ngày tạo app `APP.NYSQFEFSMLCG`.
   > Trang duyệt là SPA, chuỗi lỗi do API nội bộ trả về theo cookie đăng nhập của brand.
   > Giả thuyết đang chờ iPOS xác nhận: app **tự tạo** dưới cùng tài khoản chủ thương hiệu
   > không tự kết nối vào chính brand đó được, phải được iPOS đánh dấu là *ứng dụng nội bộ*.
1. **Điền Webhook URL** trong iPOS › Ứng dụng của tôi › `APP.NYSQFEFSMLCG`
   → `https://<domain>/api/ipos/webhook?k=<IPOS_WEBHOOK_SECRET>` *(ô này đang trống)*.
2. Copy tên biến ở `.env.example` sang Vercel Settings. Không commit giá trị thật.
3. `node scripts/ipos-probe.mjs pull --days=90` → soi dữ liệu thật **trước khi** viết migration.
4. Chạy `database/migrations/003_ipos_reservation.sql`, rồi gán tay
   `dim_ipos_source.channel · is_paid · platform` cho từng code.
5. Thêm cron vào `vercel.json`: `{ "path": "/api/ipos/sync", "schedule": "15 17 * * *" }`
   = 00:15 `Asia/Bangkok`.
6. Backfill lịch sử một lần bằng `/api/ipos/sync?from=&to=` với bearer token.
7. **Việc của Ops, không phải việc code:** mỗi kênh trả phí một source code riêng, link iframe
   đặt bàn tách theo campaign. Không làm bước này thì attribution dừng ở mức thô của iPOS.

---

## 6. QA gates

| # | Cổng | Đạt khi |
|---|---|---|
| 1 | **Idempotent webhook** ✅ *(đo 26/09)* | gửi lại cùng payload 2 lần → đơn không nhân đôi, `status_log` không thêm dòng trùng |
| 2 | **Webhook sai secret / sai JSON** ✅ *(đo 26/09)* | trả **200** `{ignored: INVALID_SECRET \| INVALID_JSON}`, **không** chạm database |
| 3 | **Không tin body webhook** ✅ *(đo 26/09)* | log phải cho thấy mọi upsert đều đi sau một lần gọi `filters{codes}`; refetch hỏng → `pending: REFETCH_FAILED`, đơn KHÔNG được ghi |
| 4 | **Khớp tổng với iPOS** | `count` theo kỳ = số đơn trên dashboard iPOS cùng kỳ, lệch > 1% phải điều tra |
| 5 | **Mẫu số kết quả** | mọi tỷ lệ đến/huỷ/no-show đều lọc `meal_day < hôm nay` — test bằng kỳ có đơn tương lai |
| 6 | **Timezone** | Today/7D/MTD/Month tính theo `Asia/Bangkok`, không dùng ngày UTC |
| 7 | **Nguồn phủ hết** | mọi `source_code` trong fact đều có dòng trong `dim_ipos_source`; code lạ → cảnh báo, không im lặng bỏ |
| 8 | **Code trùng tên** | hai `source_code` khác nhau cùng `name` → cảnh báo trên D1 *(vụ "Google Ads" ×3)* |
| 9 | **Đơn hỏng đẩy POS** | `pos_push_failed = true` phải lên bảng cảnh báo — đây là đơn có thật mà POS không biết |
| 10 | **Không có PII thô** | `select` bất kỳ trên `ipos_reservation` không trả SĐT, tên, hay nội dung ghi chú |
| 11 | **Kỳ chưa chín** | kỳ có > 40% đơn `meal_day` còn ở tương lai → màn hình phải ghi rõ, giống M10 |

---

## 7. Chủ động loại khỏi scope

- **Không** gọi `POST /reservations` (tạo đơn) và `PUT /reservations/update-status`. Module
  này chỉ đọc. Token có quyền ghi, nhưng code không dùng.
- **Không** lưu SĐT, tên, email, nội dung `booking_note`. Chỉ `phone_hash` + cờ `has_note`.
- **Không** đổi `PHONE_HASH_KEY` — đổi là mất khả năng nối lịch sử sang bill POS.
- **Không** dựng bảng customer/profile. Việc nhận diện khách thuộc M8.
- **Không** dựng cột doanh thu ước lượng từ `total_amount` *(xem §3c)*.
- **Không** dùng từ "ROAS" *(xem §3b và M5 §2)*.

---

## 8. Đang chặn & phần thưởng kèm theo

| Thiếu | Hệ quả | Ai cấp |
|---|---|---|
| `PARTNER_ACCESSTOKEN` | chặn toàn bộ module | admin brand bấm duyệt URL từ `/brands/auth` |
| Webhook URL chưa điền | mất realtime, phải chờ cron ngày | admin brand |
| Source code trùng/gộp | attribution dừng ở mức thô | Ops + Marketing |
| SĐT trên hoá đơn POS (8,6%) | không nối được đơn → doanh thu | M8, dài hạn |

### Phần thưởng: API này gỡ chốt chặn #2 của M3

`20_BAN_DO_MODULE.md` §4 liệt kê chốt chặn #2 — *"Số chỗ ngồi mỗi bàn, chặn M3, ai cấp: Ops"*.
`get-list-fb` và `get-info-fb` trả về `tables[]` kèm `seats · min_person · max_person ·
area_id · table_type`. Quét đủ dải ngày là dựng được `ipos_table` phủ phần lớn 217 bàn
→ mở khoá **vòng quay bàn** và **tỷ lệ lấp đầy** cho M3.

Hạn chế trung thực: chỉ thấy bàn **đã từng có đơn đặt**. Bàn chỉ đón khách vãng lai sẽ không
xuất hiện. Nên coi đây là nguồn *bổ sung* cho sơ đồ bàn của Ops, không thay thế.
