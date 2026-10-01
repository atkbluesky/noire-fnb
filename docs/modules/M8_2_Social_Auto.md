# M8.2 · SOCIAL AUTO — FANPAGE → ZALO OA

> Tài liệu thiết kế lịch sử. Module hiện nằm dưới M6 với tên **M6.2**; xem [trạng thái và điều kiện chạy hiện tại](M6_2_Social_Auto.md). Giữ tài liệu này để bảo toàn các quyết định kỹ thuật và tham chiếu cũ.

| | |
|---|---|
| **Câu hỏi** | Nội dung đã sản xuất cho Fanpage có được tái sử dụng sang kênh sở hữu Zalo OA không, và bài nào đáng đốt quota broadcast? |
| **`activeView`** | `m82` |
| **View** | `src/views/SocialAutoView.tsx` *(chưa dựng)* |
| **Server** | `api/social/` — `_shared.ts` · `_steps.ts` · `_media.ts` · `_transform.ts` · `_zalo-article.ts` · `webhook-fb.ts` · `tick.ts` · `review.ts` · `performance.ts` · `reconcile.ts` · `database/migrations/004_social_auto.sql` |
| **Nguồn** | Facebook Graph API (Page webhook `feed` + `video_reels`) → Claude API → Zalo OA Article API |
| **Grain** | 1 `fb_post_id` (một bài gốc trên Fanpage) |
| **Phạm vi** | **Ghi** — module DUY NHẤT trong hệ thống được phép tạo nội dung trên Zalo OA. Không CRM, không gửi tin 1-1, không trả lời bình luận |
| **Giai đoạn** | P6.3 |
| **Trạng thái** | 🟡 **code xong server 27/09/2026** — 6 endpoint + migration dựng & smoke-test qua, build sạch, M8.1 không suy suyển (QA gate 10 ✅). Còn thiếu: `SocialAutoView.tsx` · chạy migration · credential FB/R2/Claude · kết quả `npm run probe:fb all` |

> Tài liệu gốc đã đối chiếu 26/09/2026:
> [Zalo · Nội dung dạng Bài viết](https://developers.zalo.me/docs/official-account/noi-dung/noi-dung-dang-bai-viet/) ·
> [Zalo · Tải video lên](https://developers.zalo.me/docs/official-account/noi-dung/noi-dung-dang-bai-viet/tai-video-len-cho-noi-dung-bai-viet) ·
> [Zalo · Broadcast](https://developers.zalo.me/docs/official-account/tin-nhan/tin-truyen-thong/gui-tin-truyen-thong-broadcast) ·
> [Facebook · Reels](https://developers.facebook.com/docs/video-api/guides/reels-publishing)

---

## 0. ❗ LUẬT SỬA CODE — ĐỌC TRƯỚC KHI GÕ PHÍM

> M8.1 và M10.1 **đang chạy production** trên cùng repo, cùng database, cùng dự án Vercel.
> Một lệnh `drop` hay một chữ ký hàm bị đổi là sập tab đang sống. Tám luật dưới đây là bắt buộc,
> không phải khuyến nghị.

| # | Luật | Vì sao |
|---|---|---|
| **1** | **Đọc hết file trước khi sửa.** Không sửa mù theo trí nhớ, không sửa theo đoạn trích. Đặc biệt `api/zalo/_shared.ts` — 240 dòng, M8.1 phụ thuộc toàn bộ | Sửa mù = xoá nhầm nhánh xử lý token đang giữ OA sống |
| **2** | **`api/zalo/_shared.ts` là tài sản dùng chung — CHỈ ĐƯỢC THÊM.** Được `export` hàm mới. **Cấm** đổi chữ ký, đổi tên, đổi thứ tự tham số, đổi giá trị trả về của: `validAccessToken` · `getSql` · `encryptToken` · `decryptToken` · `requireCron` · `ictDate` · `json` | M8.2 `import` lại chính các hàm này. Đổi một chữ ký = hỏng cả hai module cùng lúc |
| **3** | **Migration chỉ được cộng thêm.** Chỉ dùng `create table if not exists`, `create index if not exists`, `alter table … add column if not exists`. **Cấm tuyệt đối** `drop table` · `drop column` · `rename` · `alter column … type` trên mọi bảng `zalo_oa_*` và `ipos_*` | Chạy lại migration phải an toàn — đúng luật đã ghi ở đầu `003_ipos_reservation.sql` |
| **4** | **Mọi bảng mới bắt buộc prefix `social_`.** Không đụng namespace `zalo_oa_*`, `ipos_*`, `dim_*` | Nhìn tên là biết ai sở hữu, grep một phát ra hết |
| **5** | **`vercel.json` chỉ thêm entry mới vào mảng `crons`.** Không sửa, không sắp xếp lại 2 cron đang có (`/api/zalo/snapshot`, `/api/ipos/sync`) | Đổi lịch cron cũ = mất snapshot follower, thủng chuỗi số liệu M8.1 |
| **6** | **`.env.example` / `.env.local` chỉ thêm key.** Không xoá, không đổi tên key cũ | `_shared.ts` đọc theo tên cứng, thiếu key là throw lúc runtime |
| **7** | **Mặc định `status: "hide"` khi tạo bài Zalo.** Chỉ chuyển `"show"` sau khi có người duyệt hoặc điểm tự động vượt ngưỡng. Trong lúc dev thì **luôn** `hide` | Bài lỡ hiện trên OA thật là sự cố truyền thông, không phải bug |
| **8** | **Mỗi bước phải chạy lại được.** Tick có thể bị gọi trùng, webhook có thể đến hai lần, Vercel có thể timeout giữa chừng và retry. Mọi ghi đều `upsert` theo khoá tự nhiên, mọi lệnh gọi ra ngoài đều có `idempotency_key` lưu trong DB trước khi bắn | Serverless không đảm bảo exactly-once. Thiếu luật này là bài đăng đôi lên OA |

**Quy trình bắt buộc trước mỗi commit:**

```bash
node --check api/social/tick.ts 2>/dev/null || npx tsc --noEmit
npm run build
```

---

## 1. Kiến trúc

```text
┌─ NGUỒN ──────────────┐
│  Facebook Fanpage    │
└──────────┬───────────┘
           │ webhook field `feed` (real-time, miễn phí)
           ▼
   POST /api/social/webhook-fb
           │  ├─ verify X-Hub-Signature-256 (HMAC-SHA256, FB_APP_SECRET)
           │  ├─ GET verify_token khi FB đăng ký lần đầu
           │  ├─ dedupe theo fb_post_id
           │  └─ CHỈ ghi hàng đợi, KHÔNG gọi API nặng trong webhook
           ▼
   social_post  state = INGESTED
           │
           │  ◀── nhịp đập: cron-job.org gọi mỗi 3 phút
           │      GET /api/social/tick   Authorization: Bearer CRON_SECRET
           ▼
┌─ MÁY TRẠNG THÁI (mỗi tick đẩy TỐI ĐA 1 bước / TỐI ĐA 3 bài) ─────────────┐
│                                                                          │
│  INGESTED ──────▶ refetch Graph API (caption + attachment + engagement)  │
│      │            tải media → chuẩn hoá → đẩy lên R2                     │
│      ▼            ảnh: ≤1MB · video: mp4 ≤50MB                           │
│  MEDIA_STAGED ──▶ Claude API · JSON schema cứng · Zod validate           │
│      │            retry ≤2 lần bằng cách feed lỗi ngược lại              │
│      ▼                                                                   │
│  TRANSFORMED ───▶ chấm broadcast_score · auto-reject bài không hợp       │
│      ▼                                                                   │
│  PENDING_REVIEW ─── người duyệt ở SocialAutoView ──▶ APPROVED / REJECTED │
│      ▼                                                                   │
│  APPROVED                                                                │
│      ├─ có video ─▶ VIDEO_UPLOADING ─▶ VIDEO_CONVERTING ─┐               │
│      │              preparevideo        poll verify      │               │
│      │                                  status 1=xong    │               │
│      └─ chỉ ảnh ────────────────────────────────────────┤               │
│                                                          ▼               │
│                                              ARTICLE_CREATING            │
│                                              POST article/create         │
│                                              status="hide"               │
│                                                          ▼               │
│                                              ARTICLE_VERIFYING           │
│                                              POST article/verify → id    │
│                                                          ▼               │
│                                              PUBLISHED                   │
│                                              update → status="show"      │
│                                                          ▼               │
│                                              BROADCAST_QUEUED            │
│                                              (chỉ khi còn quota tháng)   │
│                                                          ▼               │
│                                              BROADCAST_SENT              │
└──────────────────────────────────────────────────────────────────────────┘
           │
           ▼
   Vercel Cron 1 lần/ngày → /api/social/reconcile
   quét published_posts 7 ngày, bắt bài webhook làm rơi

   Dashboard ──GET /api/social/performance──▶ phễu + tồn kho duyệt + quota
```

### 1b. Vì sao tách khỏi M8.1 chứ không nhập chung

`M8_1_Zalo_OA.md` §7 tự khai: *"Không gọi API gửi tin và không có workflow automation"*.
M8.2 phá đúng ranh giới đó. Nhập chung sẽ làm M8.1 tự mâu thuẫn với chính nó và mất khả
năng nói *"module này chỉ đọc, không ghi"* — câu quan trọng khi rà soát rủi ro.

| | M8.1 | M8.2 |
|---|---|---|
| Chiều dữ liệu | **Đọc** OA | **Ghi** lên OA |
| Rủi ro tối đa | Sai số trên dashboard | Đăng nhầm nội dung ra công chúng |
| Quyền Zalo App | Quản lý OA + nhận webhook tin nhắn | **+ nhóm quyền Nội dung** |
| Hỏng thì | Tab trống | Sự cố truyền thông |
| Nhịp chạy | 1 cron/ngày | tick 3 phút |

Dùng chung: `zalo_oa_token`, `validAccessToken()`, `getSql()`, `requireCron()`.
Không dùng chung: bảng dữ liệu, endpoint, view, quyền.

> **Bắt buộc dùng lại đúng Zalo App đang chạy M8.1.** `M8_1_Zalo_OA.md` §5 bước 0 ghi OA đã
> hết slot App liên kết — tạo app mới là tự chặn mình. Chỉ cần cấp thêm **nhóm quyền Nội dung**
> cho app cũ.

### 1c. Vì sao là máy trạng thái đẩy bằng tick, không phải job chạy dài

Vercel Hobby (đo 26/09/2026): `maxDuration` **300s**, RAM **2GB/1vCPU**, bundle **250MB**,
cron **tối thiểu 1 lần/ngày**. Ba hệ quả:

1. **Không có worker thường trú** → trạng thái phải nằm trong Postgres, không nằm trong RAM.
2. **Không có cron dày** → nhịp đập đến từ bên ngoài (cron-job.org), Vercel cron chỉ lo reconcile ngày.
3. **300s là trần cứng** → mỗi tick làm **đúng một bước có biên**, không bao giờ chờ vòng lặp
   convert video trong cùng một request. Zalo convert xong hay chưa là việc của tick sau.

Đây là kiến trúc đúng cho serverless, không phải cách lách. Đổi lại: mọi bước phải idempotent (Luật §0.8).

### 1d. Bản đồ file — sửa gì thì đọc gì

Cột "thực tế" đo ngày 27/09/2026. Trần = số đo thật + ~15% headroom — nó tồn tại để bắt
**drift về sau**, nên đừng chỉnh trần khi vượt: tách file như `tick.ts` đã phải tách.
Số dòng gồm cả khối chú thích tiếng Việt, vốn là phong cách sẵn có của repo này.

| File | Trách nhiệm DUY NHẤT | Thực tế | Trần | **Cấm** |
|---|---|:-:|:-:|---|
| `api/social/_shared.ts` | env · kiểu dữ liệu · ký SigV4 cho R2 · tải có trần · masking | 251 | 290 | Cấm gọi Graph/Zalo API trực tiếp |
| `api/social/webhook-fb.ts` | Verify chữ ký · dedupe · `insert … on conflict do nothing` | 148 | 170 | Cấm gọi API ngoài, cấm xử lý nặng. Webhook phải trả 200 trong <1s |
| `api/social/tick.ts` | Nhặt job `for update skip locked` · lease · attempt/backoff · `social_run` | **129** | 200 | **Cấm nhét logic nghiệp vụ.** Nó là bộ điều phối |
| `api/social/_steps.ts` | 9 hàm `step*` — mỗi hàm đẩy 1 bài đi đúng 1 bước | 321 | 370 | Cấm biết về hàng đợi, lease, attempt, audit |
| `api/social/_media.ts` | Tải media · chọn rendition ≤1MB · ffmpeg ≤50MB · đẩy R2 | 297 | 340 | Cấm ghi DB. Nhận id, trả mô tả asset |
| `api/social/_transform.ts` | Prompt · gọi Claude · validate · retry | 256 | 300 | Cấm gọi Zalo. Nhận bài thô, trả draft |
| `api/social/_zalo-article.ts` | 6 lệnh Zalo, từ `preparevideo` tới `oa/message` | 245 | 280 | Cấm tự quyết `show`/`hide`. Nhận tham số, không nghĩ hộ |
| `api/social/review.ts` | `approve`·`reject`·`edit`·`broadcast`·`retry` | 154 | 180 | **Cấm đăng trực tiếp** — chỉ đổi state |
| `api/social/performance.ts` | Đọc số cho dashboard | 113 | 160 | Cấm ghi |
| `api/social/reconcile.ts` | Quét bài sót 7 ngày + refresh engagement | 96 | 120 | Cấm đăng. Chỉ đẩy vào `INGESTED` |
| `src/views/SocialAutoView.tsx` | Hàng chờ duyệt · phễu · quota | — | 400 | Cấm gọi Graph/Zalo trực tiếp từ browser |

**Luật một chiều phụ thuộc** — vẽ thành mũi tên, không được có vòng:

```text
              ┌──────────────┐
tick.ts ─────▶│  _steps.ts   │──┬──▶ _media.ts ────────┐
(điều phối)   └──────────────┘  ├──▶ _transform.ts ────┤
                                └──▶ _zalo-article.ts ─┤
                                                       ▼
webhook-fb.ts ────────────────────────────────▶  _shared.ts
review.ts ────────────────────────────────────▶       │
performance.ts ───────────────────────────────▶       ▼
reconcile.ts ─────────────────────────────────▶  api/zalo/_shared.ts
                                                 (CHỈ ĐỌC — import, không sửa)
```

`_media` · `_transform` · `_zalo-article` **không được import lẫn nhau** — ba hộp kín, chỉ
`_steps.ts` biết thứ tự gọi. Và `_steps.ts` **không được import `tick.ts`**: bước không được
biết mình đang bị ai gọi.

### 1e. Bốn quyết định khi code khác với bản thiết kế đầu

Ghi lại để người đọc code sau không tưởng là code làm sai doc.

| Chỗ | Thiết kế ban đầu | Code thực tế | Vì sao đổi |
|---|---|---|---|
| Nén ảnh | `sharp` resize xuống ≤1MB | Lấy `?fields=images` của Facebook, **chọn bản render sẵn lớn nhất còn ≤1MB** | Facebook đã render sẵn nhiều size. Bỏ được một native dep ~30MB trong bundle 250MB, và ảnh không bị nén hai lần |
| Validate JSON | Zod | Validator viết tay trong `_transform.ts` | Không thêm dependency chỉ để kiểm 6 trường. Đổi lại được thông báo lỗi **tiếng Việt** feed thẳng cho model sửa |
| Ảnh trong body | Model tự ghi `url` | Model trả `index`, code thay bằng URL thật | Model bịa URL trở thành **bất khả thi về cấu trúc**, không phải nhờ dặn dò trong prompt |
| Broadcast | Tự động khi đủ điểm | **Người bấm** ở `review.ts` mới vào `BROADCAST_QUEUED` | Quota 1–4/tháng quá hiếm để máy tự quyết. Tick chỉ thực thi, không tự chọn |

Thêm một phát hiện khi đối chiếu tài liệu Zalo ngày 27/09/2026: **`article/update` không phải
patch từng trường** — phải gửi lại TOÀN BỘ payload kèm `id`, và nó cũng trả `token` bất đồng bộ
y như `create`, nên phải gọi `article/verify` lần thứ hai. Đó là lý do `ARTICLE_VERIFYING` gọi
tới ba lệnh Zalo chứ không phải một.

---

## 2. Data model

| Bảng | Grain | Mục đích |
|---|---|---|
| `social_post` | 1 `fb_post_id` | **Bảng chủ** — giữ state machine, mọi id đối chiếu, số engagement FB |
| `social_asset` | 1 file media | Ảnh/video đã chuẩn hoá + URL trên R2 + dung lượng thật |
| `social_draft` | 1 phiên bản AI | Output Claude có version — giữ lịch sử để so sánh và làm few-shot |
| `social_broadcast` | 1 lượt broadcast | Đối chiếu quota tháng theo gói OA |
| `social_run` | 1 lần tick | Audit: tick nào đẩy bài nào, lỗi gì |

Migration: `database/migrations/004_social_auto.sql` — tuân Luật §0.3.
Token dùng lại `zalo_oa_token` của M8.1, **không tạo bảng token thứ hai**.

### 2b. `social_post` — các cột quyết định

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `fb_post_id` | text PK | Khoá tự nhiên, chống đăng trùng |
| `fb_kind` | text | `photo` · `album` · `video` · `reel` · `link` · `text` |
| `state` | text | Xem §1 — có `check` constraint liệt kê đủ giá trị |
| `attempt` | int | Đếm lần thử; ≥5 thì chuyển `FAILED`, không retry vô hạn |
| `next_run_at` | timestamptz | Backoff mũ: 1' → 2' → 4' → 8' → 16' |
| `idempotency_key` | text | Sinh TRƯỚC khi gọi API ghi, lưu rồi mới bắn |
| `zalo_article_id` | text | Có giá trị ⇒ tuyệt đối không tạo lại |
| `zalo_video_id` | text | Từ `upload_video/verify` |
| `fb_reactions` `fb_comments` `fb_shares` | int | Chụp lúc ingest + refresh ở reconcile → đầu vào chấm điểm |
| `broadcast_score` | int | 0–100, Claude chấm + hệ số engagement thật |
| `reject_reason` | text | Vì sao không sync — để rà prompt về sau |

**Trạng thái là dữ liệu, không phải biến trong code.** Mọi chuyển trạng thái ghi DB trước,
gọi API sau. Vercel chết giữa chừng thì tick sau đọc DB là biết đang dở ở đâu.

### 2c. Luật riêng tư

Kế thừa nguyên `M8_1_Zalo_OA.md` §7: không lưu tên, SĐT, Zalo user id thô. Riêng M8.2 thêm:
**không lưu bình luận của người dùng trên Fanpage** — chỉ lưu *số đếm* bình luận. Đếm thì được,
đọc thì không.

---

## 3. Contract chuyển đổi nội dung

Claude trả JSON, Zod chặn ở biên. **Ràng buộc cứng lấy từ tài liệu Zalo, không phải ước lượng:**

| Trường | Trần | Nguồn |
|---|---|---|
| `title` | **150 ký tự** | Zalo `article/create` |
| `description` | **300 ký tự** | Zalo `article/create` |
| `author` | **50 ký tự** | Zalo `article/create` |
| file ảnh | **1 MB** | Zalo Article API |
| file video | **50 MB**, chỉ `mp4`/`avi` | Zalo `preparevideo` |

```jsonc
{
  "title":       "string ≤150",
  "description": "string ≤300",
  "author":      "string ≤50",
  "body": [
    { "type": "text",  "content": "…" },
    { "type": "image", "url": "https://<r2>/…", "caption": "…" }
  ],
  "broadcast_score": 0,
  "reject_reason": null
}
```

**Bốn việc prompt phải làm** (thiếu một là ra nội dung ngô nghê):

1. **Đổi ngữ cảnh** — Fanpage là feed công cộng, Zalo OA đọc trong khung chat. Bớt giật tít,
   bớt emoji dày, xưng hô nhất quán.
2. **Bóc sạch dấu vết Facebook** — "comment bên dưới" · "inbox shop" · "tag bạn bè" ·
   "link ở bình luận" · `@mention` · chuỗi hashtag · link `facebook.com`
   → thay bằng CTA Zalo: nhắn tin OA · hotline · `zalo.me/…`.
3. **Chia lại độ dài** — caption FB thường một khối dài; Zalo cần đoạn 2–3 câu.
4. **Tự chấm + tự loại** — `broadcast_score` để xếp hạng, `reject_reason` để bỏ bài không nên
   sync (chia sẻ link báo, chúc mừng nội bộ, ảnh đơn không caption).

Trong tool schema gửi cho Claude, block ảnh dùng `{"type":"image","index":N}` — model **không
bao giờ** chạm vào URL; `_transform.ts` thay `index` bằng URL R2 thật sau khi validate. Model bịa
URL là bất khả thi về cấu trúc.

**Luật validate:** `title` quá 150 ký tự thì **feed lỗi ngược cho model sửa**, KHÔNG `slice()`.
Cắt cứng hay đứt giữa từ. Quá 3 vòng → ném `CLAUDE_VALIDATION_FAILED`, tick đếm attempt và cuối
cùng chuyển `FAILED` để người viết tay qua `review.ts` action `edit`.

Few-shot: nạp 3–5 bài OA đã duyệt từ `social_draft` (`approved = true`) vào prompt.
Hệ thống càng chạy càng giống giọng brand.

---

## 4. API contract

### 4a. Phía Facebook

| Việc | Endpoint |
|---|---|
| Nhận bài mới | Webhook Page, field `feed` → `POST /api/social/webhook-fb` |
| Lấy chi tiết | `GET /{post-id}?fields=message,created_time,permalink_url,full_picture,attachments{...},reactions.summary(true),comments.summary(true),shares` |
| Danh sách reel | `GET /{page-id}/video_reels` |
| File video thô | `GET /{video-id}?fields=source,length,format,picture` |
| Quét bài sót | `GET /{page-id}/published_posts?since=<7 ngày>` |

Token: Page token sinh từ long-lived user token — **không hết hạn**, không cần token service.
App để **Development mode** là đủ cho Page mình quản trị, **không cần App Review**.
Thăm dò bằng `npm run probe:fb all` (`scripts/fb-probe.mjs`).

### 4b. Phía Zalo — thứ tự gọi không được đảo

```text
① có video?
   POST https://openapi.zalo.me/v2.0/article/upload_video/preparevideo   (multipart, ≤50MB)
   → { data: { token } }                                    lưu token vào DB NGAY

② GET https://openapi.zalo.me/v2.0/article/upload_video/verify?token=…
   → { status, convert_percent, video_id }
   status: 1=dùng được · 2=bị khoá · 3=đang xử lý · 4=lỗi · 5=đã xoá
   status≠1 → trả tick, KHÔNG chờ trong request  (Luật §1c)

③ POST https://openapi.zalo.me/v2.0/article/create
   type "normal" (bài+ảnh) | "video" (video_id + avatar)
   status: "hide"                                           ← Luật §0.7
   → { data: { token } }                                    lưu token vào DB NGAY

④ POST https://openapi.zalo.me/v2.0/article/verify  { token }
   → { data: { id } }                                       ← zalo_article_id thật

⑤ POST https://openapi.zalo.me/v2.0/article/update  status: "show"   (sau khi duyệt)

⑥ POST https://openapi.zalo.me/v2.0/oa/message                        (broadcast, tuỳ chọn)
   attachment.payload.elements[0] = { media_type: "article", attachment_id: <id ở ④> }
```

Hạ tầng: Article API **chỉ chạy TLS 1.2 trở lên**.
Header `access_token` lấy bằng `validAccessToken()` của M8.1 — **không tự viết lại luồng refresh**.

**Quota broadcast — hẹp hơn người ta tưởng:**

| Ràng buộc | Số |
|---|---|
| Gói Cơ bản | ~1 broadcast/tháng |
| Gói Nâng cao | ~4 broadcast/tháng |
| Mỗi follower | tối đa 1 tin/ngày |
| Khung giờ | 6h00 – 21h59 |
| Độ trễ | Zalo xử lý ~30 phút trước khi tới người dùng |

⇒ **Đăng bài ≠ tiếp cận follower.** 30 bài/tháng sync sang OA thì chỉ 1–4 bài được đẩy
notification. Đây là lý do `broadcast_score` tồn tại: quota hiếm thì phải chọn, không bắn bừa.
`social_broadcast` giữ counter theo tháng và **chặn cứng** khi hết.

### 4c. Phía nội bộ

| Endpoint | Method | Quyền | Chức năng |
|---|---|---|---|
| `/api/social/webhook-fb` | GET | `hub.verify_token` | FB đăng ký webhook lần đầu |
| `/api/social/webhook-fb` | POST | `X-Hub-Signature-256` | Nhận bài mới, chỉ ghi hàng đợi |
| `/api/social/tick` | GET/POST | `Bearer CRON_SECRET` | Đẩy máy trạng thái 1 bước |
| `/api/social/reconcile` | GET | `Bearer CRON_SECRET` | Quét bài sót 7 ngày |
| `/api/social/review` | POST | `Bearer SOCIAL_REVIEW_SECRET` | `approve` · `reject` · `edit` · `broadcast` · `retry` |
| `/api/social/performance` | GET | mở | Phễu · quota · lỗi (chỉ số đếm) |
| `/api/social/performance?queue=1` | GET | `Bearer SOCIAL_REVIEW_SECRET` | Kèm NỘI DUNG bản nháp chờ duyệt |

**Vì sao `review` có secret mà `/api/zalo/performance` thì không:** M8.1 chỉ ĐỌC, lộ ra cùng lắm
là lộ số. `review` GHI, và hệ quả hiện ra trước công chúng trên Zalo OA. Rủi ro khác hẳn nên cơ
chế bảo vệ phải khác. `SOCIAL_REVIEW_SECRET` chưa đặt = **khoá**, không phải mở.

Webhook trả **200** kể cả khi chữ ký sai (`{ignored: INVALID_SIGNATURE}`) — cùng luật đã áp cho
`api/zalo/webhook.ts` §6: nền tảng chỉ nhận Webhook URL khi request kiểm tra được 200.

---

## 5. Cài đặt production

0. **Cấp thêm nhóm quyền Nội dung** cho **đúng Zalo App đang chạy M8.1** (xem §1b).
1. Chạy `npm run probe:fb all`. Ghi lại hai kết quả vào §8:
   - `source` có trả về không → quyết định có cần fallback HLS/DASH
   - dung lượng reel thật → quyết định có cần ffmpeg hay không
2. Chạy `database/migrations/004_social_auto.sql`.
3. Tạo bucket Cloudflare R2 công khai (10GB + egress miễn phí). Thêm `R2_*` vào `.env.example`
   theo Luật §0.6.
4. Đăng ký Facebook Page webhook field `feed` → `https://<domain>/api/social/webhook-fb`.
5. Tạo job ở cron-job.org: mỗi **3 phút** gọi `/api/social/tick` kèm `Bearer CRON_SECRET`.
6. **Thêm** vào mảng `crons` của `vercel.json` (Luật §0.5):
   `{ "path": "/api/social/reconcile", "schedule": "25 17 * * *" }`
7. Chạy Phase 1 với **review gate BẬT** tối thiểu 2 tuần. Chỉ tắt khi tỉ lệ duyệt-không-sửa
   vượt 80%.

**Biến môi trường mới** — đã khai trong `.env.example`, chỉ thêm, không xoá:
`FB_APP_ID` · `FB_APP_SECRET` · `FB_PAGE_ID` · `FB_PAGE_TOKEN` · `FB_WEBHOOK_VERIFY_TOKEN` ·
`ANTHROPIC_API_KEY` · `ANTHROPIC_MODEL` · `R2_ACCOUNT_ID` · `R2_ACCESS_KEY_ID` ·
`R2_SECRET_ACCESS_KEY` · `R2_BUCKET` · `R2_PUBLIC_BASE` · `SOCIAL_REVIEW_SECRET` ·
`SOCIAL_BROADCAST_QUOTA` *(4)* · `SOCIAL_AUTOPUBLISH` *(false)* · `FFMPEG_PATH` *(trống)*

Dùng lại của M8.1, **không khai lại**: `DATABASE_URL` · `CRON_SECRET` · `ZALO_APP_ID` ·
`ZALO_APP_SECRET_KEY` · `ZALO_OA_ID` · `ZALO_TOKEN_ENCRYPTION_KEY`.

---

## 6. QA gates

| # | Kiểm tra | Đạt khi |
|---|---|---|
| 1 | Gửi cùng payload webhook 2 lần | Lần hai `duplicate: true`, `social_post` không sinh dòng mới |
| 2 | Chữ ký sai / không phải JSON | Trả **200** `{ignored:…}` và **không chạm DB** |
| 3 | Giết tick giữa `ARTICLE_CREATING` | Tick sau đọc `idempotency_key` từ DB, **không** tạo bài thứ hai |
| 4 | Bài ảnh 4MB | Sau `_media` phải **≤1MB**, mắt thường không thấy vỡ |
| 5 | Reel 120MB | Sau ffmpeg **≤50MB**, `preparevideo` nhận |
| 6 | Claude trả `title` 200 ký tự | Bị Zod chặn, retry, **không** có `slice()` trong code |
| 7 | Hết quota broadcast tháng | `social_broadcast` chặn, state dừng ở `PUBLISHED`, không gọi API |
| 8 | Chạy lại `004_social_auto.sql` | Không lỗi, không mất dữ liệu |
| 9 | `SOCIAL_AUTOPUBLISH=false` | Không bài nào tự sang `show`, dù điểm cao |
| 10 | M8.1 sau khi deploy M8.2 | `/api/zalo/performance` vẫn `ok`, snapshot vẫn chạy |

Gate 10 chạy **mỗi lần** deploy M8.2. Đó là cái chuông báo Luật §0.2 bị vi phạm.

---

## 7. Chủ động loại khỏi scope

- **Không** đăng sang **Zalo Video** (feed video riêng trong app Zalo) — Zalo không mở API.
  Đích đến đúng là *Nội dung dạng Video* của OA.
- **Không** gửi tin 1-1, không tin Tư vấn, không tin Giao dịch. Chỉ Article + Broadcast.
- **Không** trả lời bình luận, không đọc nội dung bình luận (chỉ đếm).
- **Không** sync ngược Zalo → Facebook.
- **Không** tạo bảng customer/profile/lead — việc nhận diện khách thuộc M8.
- **Không** đăng lên TikTok/Instagram. Muốn thì mở M8.3, không nhét vào đây.
- **Không** tự sinh ảnh mới bằng AI. Chỉ cắt/nén ảnh có sẵn — ảnh sinh ra lệch nhận diện brand.

---

## 8. Đang chặn & rủi ro

| Hạng mục | Mức | Tình trạng |
|---|---|---|
| Kết quả `probe:fb` — `source` có trả về? | 🔴 chặn | Chưa chạy. Code đã xử lý cả hai nhánh: không có `source` thì asset mang note `FB_SOURCE_FIELD_MISSING`, không vỡ pipeline |
| Kết quả `probe:fb` — reel có >50MB? | 🟡 | Chưa chạy. >50MB mà không có ffmpeg thì bài vào `NEEDS_TRANSCODE`, chờ người — không nuốt lỗi |
| Nhóm quyền Nội dung trên Zalo App | 🟡 | **Bớt lo hơn dự kiến.** Smoke-test 27/09/2026 cho thấy `/api/zalo/performance` đã trả `ok` với dữ liệu thật (OA "NOIRE Cafe & Bistro", 651 follower) ⇒ App ĐÃ liên kết OA và token đang sống. Chỉ còn phải cấp thêm nhóm quyền Nội dung cho app đó |
| `SocialAutoView.tsx` | 🟡 | Chưa dựng. Server chạy được mà không có nó; duyệt tạm bằng `curl` tới `/api/social/review` |
| Chạy `004_social_auto.sql` | 🟡 | Chưa chạy. `/api/social/performance` đang trả đúng `MIGRATION_PENDING` |
| Vercel Hobby = phi thương mại theo ToS | 🟡 | Rủi ro đã tồn tại từ M8.1/M10.1, không do M8.2 sinh ra. Pro $20/tháng gỡ luôn cả trần cron |
| Quota broadcast 1–4/tháng | 🟡 | Không sửa được bằng kỹ thuật. Giảm đau bằng `broadcast_score` |
| Chất lượng giọng văn AI | 🟡 | Giảm dần theo thời gian nhờ few-shot từ `social_draft` đã duyệt |
| URL CDN Facebook hết hạn | 🟢 | Tải ngay lúc ingest, không lưu URL |

**Chi phí vận hành dự kiến:** Vercel Hobby 0đ · Neon free 0đ · R2 free 0đ · cron-job.org 0đ ·
**Claude API ~$3–10/tháng** (khoản trả tiền duy nhất). Tổng dưới $10/tháng.

### Phần thưởng kèm theo

`social_post` giữ `fb_reactions` · `fb_comments` · `fb_shares` theo từng bài, refresh mỗi ngày ở
reconcile. Đó **chính là** `social_month` mà **M6 · Social Media** đang chờ
(`00_INDEX_MODULES.md`: *"🟡 chờ `social_month`"*). M8.2 chạy được thì M6 hết chặn mà không tốn
thêm nguồn dữ liệu nào — giống cách M10.1 gỡ chốt chặn số chỗ ngồi cho M3.
