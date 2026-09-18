# M8.1 · ZALO OA PERFORMANCE

| | |
|---|---|
| **Câu hỏi** | OA đang tăng follower và xử lý bao nhiêu tương tác chat? |
| **`activeView`** | `m81` |
| **View** | `src/views/ZaloOAView.tsx` |
| **Nguồn** | Zalo OA OpenAPI `getoa` + Webhook realtime |
| **Grain** | OA × ngày (`Asia/Bangkok`) |
| **Phạm vi** | Performance only — không CRM, không gửi tin tự động |
| **Trạng thái** | 🟡 code sẵn sàng, chờ credential + PostgreSQL production |

---

## 1. Kiến trúc

```text
Zalo OA Webhook ──POST /api/zalo/webhook──▶ verify X-ZEvent-Signature
                                             │
                                             ├─ dedupe event
                                             ├─ HMAC user_id
                                             ├─ bỏ text/attachment
                                             ▼
                                  zalo_oa_webhook_event
                                             │
                                             ▼
                                  zalo_oa_daily_metric

Vercel Cron 00:05 ICT ─▶ /api/zalo/snapshot ─▶ GET /v2.0/oa/getoa
                                             │
                                             ├─ refresh OAuth v4 khi cần
                                             ▼
                                  zalo_oa_daily_snapshot

Dashboard ──GET /api/zalo/performance──▶ Today · 7D · MTD · Month
```

Zalo quy định OA access token hiệu lực 25 giờ; refresh token dùng một lần và được xoay sau
mỗi lần refresh. Vì vậy token mới được mã hoá AES-256-GCM rồi ghi lại database, không giữ
refresh token cũ trong code. Tham khảo tài liệu chính thức:

- [Xác thực và ủy quyền OA OAuth v4](https://stc-developers.zdn.vn/docs/v2/official-account/bat-dau/xac-thuc-va-uy-quyen-cho-ung-dung-new)
- [Lấy thông tin OA — `num_follower`](https://stc-developers.zdn.vn/docs/v2/official-account/quan-ly/quan-ly-thong-tin-oa/lay-thong-tin-zalo-official-account)
- [Webhook OA gửi tin và công thức `X-ZEvent-Signature`](https://stc-developers.zdn.vn/docs/v2/official-account/webhook/tin-nhan/su-kien-official-account-gui-tin-nhan-cho-nguoi-dung?lang=vi)

## 2. Data model

| Bảng | Grain | Mục đích |
|---|---|---|
| `zalo_oa_webhook_event` | 1 event | Event tối thiểu, không chứa nội dung tin nhắn hay user id thô |
| `zalo_oa_daily_snapshot` | OA × ngày | Tổng follower tại thời điểm cron chạy |
| `zalo_oa_daily_metric` | OA × ngày | Bảng phục vụ dashboard |
| `zalo_oa_token` | OA | Access/refresh token đã mã hoá |
| `zalo_oa_sync_run` | 1 lần chạy | Audit snapshot thành công/thất bại |

Migration: `database/migrations/001_zalo_oa_performance.sql`.

## 3. Metric contract

| Metric | Công thức | Lưu ý |
|---|---|---|
| **Tổng follower** | `num_follower` từ snapshot cuối kỳ | Không cộng event follow |
| **Follower net** | snapshot cuối kỳ − snapshot gần nhất trước đầu kỳ | Cần ít nhất 2 snapshot |
| **Incoming message** | event có `event_name LIKE 'user_send_%'` | Realtime |
| **Outgoing message** | event có `event_name LIKE 'oa_send_%'` | Gồm tin do OA Admin gửi; module này không tự gửi |
| **Unique chat user** | `COUNT(DISTINCT user_hash)` trên toàn kỳ | API tính lại từ event, không cộng daily unique |
| **Loại tin nhắn** | suffix của event: text/image/audio/video/file/sticker/gif/location/link/other | Không đọc nội dung |
| **Cuộc hội thoại** | incoming đầu tiên sau ≥24 giờ không event với cùng user | Session start, không phải thread CRM |

Daily table vẫn lưu `unique_chat_users` để vẽ trend. KPI unique trên Today/7D/MTD/Month
được khử trùng lại từ event để tránh double count một người chat nhiều ngày.

## 4. API contract

| Endpoint | Method | Quyền | Chức năng |
|---|---|---|---|
| `/api/zalo/webhook` | POST | `X-ZEvent-Signature` | Nhận + dedupe event realtime |
| `/api/zalo/snapshot` | GET/POST | `Authorization: Bearer CRON_SECRET` | Refresh token, lấy follower, lưu snapshot |
| `/api/zalo/performance?period=7d` | GET | Quyền đọc dashboard hiện hữu | Tổng hợp KPI + daily trend |

`period` nhận `today`, `7d`, `mtd`, `month`; với `month` truyền thêm `month=YYYY-MM`.

## 5. Cài đặt production

1. Tạo PostgreSQL và chạy `database/migrations/001_zalo_oa_performance.sql`.
2. Copy các tên biến trong `.env.example` vào Vercel Settings. Không commit giá trị thật.
   `ZALO_APP_SECRET_KEY` dùng cho OAuth; `ZALO_OA_SECRET_KEY` là secret riêng để kiểm tra webhook — không gộp hai giá trị.
3. Trong Zalo Developers, liên kết App với OA và cấp tối thiểu:
   - quyền quản lý thông tin OA;
   - quyền nhận sự kiện quản lý tin nhắn;
   - không cần quyền gửi tin cho scope M8.1.
4. Lấy OA access/refresh token ban đầu từ OAuth v4 hoặc API Explorer, khai báo một lần vào env.
5. Đăng ký webhook URL: `https://<domain>/api/zalo/webhook` và bật các event message cần đo.
6. Deploy. Vercel cron chạy `17:05 UTC` = `00:05 Asia/Bangkok` mỗi ngày.
7. Gọi `/api/zalo/snapshot` thủ công một lần với bearer token để tạo snapshot đầu tiên.

## 6. QA và vận hành

- Gửi cùng một payload webhook 2 lần: lần hai phải trả `duplicate: true` và metric không tăng.
- Payload sai chữ ký phải trả 401 trước khi chạm database.
- So `follower_total` với OA Manager sau cron; lệch phải điều tra token/OA ID, không chỉnh tay.
- `incoming + outgoing` theo ngày phải bằng tổng message event cùng ngày.
- Month/7D/MTD phải dùng timezone Bangkok, không dùng ngày UTC.
- Nếu snapshot trễ >36 giờ, kiểm tra `zalo_oa_sync_run.error_message` và Vercel Cron log.

## 7. Chủ động loại khỏi scope

- Không lưu tên, SĐT, text, media URL hoặc Zalo user id thô.
- Không xoay `ZALO_USER_HASH_KEY` nếu muốn giữ khả năng khử trùng user xuyên suốt lịch sử.
- Không đổi `ZALO_TOKEN_ENCRYPTION_KEY` trực tiếp; phải giải mã/mã hoá lại token hoặc cấp quyền OAuth lại.
- Không có bảng customer/profile/lead.
- Không gọi API gửi tin và không có workflow automation.
- Không nối user Zalo với hóa đơn, member hay voucher.
- Export `.xls` cũ chỉ giữ làm backfill/đối soát lịch sử, không còn là nguồn realtime của M8.1.
