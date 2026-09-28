-- M8.2 · Social Auto — Fanpage → Zalo OA
-- Chạy lại an toàn: mọi lệnh đều `if not exists` / `create or replace`.
-- Luật M8_2 §0.3: CHỈ ĐƯỢC CỘNG THÊM. File này không drop/rename/alter type
-- bất kỳ bảng `zalo_oa_*` hay `ipos_*` nào — M8.1 và M10.1 đang chạy trên chúng.
-- Luật M8_2 §0.4: mọi bảng ở đây bắt buộc prefix `social_`.
-- Luật riêng tư (M8_2 §2c): KHÔNG lưu nội dung bình luận, chỉ lưu SỐ ĐẾM.

-- ─── Bảng chủ: 1 bài gốc trên Fanpage ───────────────────────────────────────
-- `state` là dữ liệu, không phải biến trong code (M8_2 §2b). Mọi chuyển trạng
-- thái ghi DB TRƯỚC, gọi API SAU — Vercel chết giữa chừng thì tick sau đọc DB
-- là biết đang dở ở đâu.
create table if not exists social_post (
  fb_post_id          text primary key,
  fb_page_id          text not null,
  fb_kind             text not null default 'text'
                        check (fb_kind in ('text', 'photo', 'album', 'video', 'reel', 'link')),
  fb_permalink        text,
  fb_message          text,
  fb_video_id         text,                        -- reel/video: id để gọi ?fields=source
  fb_created_at       timestamptz,

  -- Engagement FB: chụp lúc ingest, refresh mỗi ngày ở reconcile.
  -- Đây chính là nguồn `social_month` mà M6 đang chờ (M8_2 §8).
  fb_reactions        integer not null default 0,
  fb_comments         integer not null default 0,
  fb_shares           integer not null default 0,
  fb_stats_at         timestamptz,

  state               text not null default 'INGESTED' check (state in (
                        'INGESTED', 'MEDIA_STAGED', 'NEEDS_TRANSCODE', 'TRANSFORMED',
                        'PENDING_REVIEW', 'APPROVED', 'REJECTED',
                        'VIDEO_UPLOADING', 'VIDEO_CONVERTING',
                        'ARTICLE_CREATING', 'ARTICLE_VERIFYING', 'PUBLISHED',
                        'BROADCAST_QUEUED', 'BROADCAST_SENT',
                        'FAILED', 'SKIPPED')),
  attempt             integer not null default 0,  -- ≥5 thì chuyển FAILED, không retry vô hạn
  next_run_at         timestamptz not null default now(),
  last_error          text,

  -- Luật M8_2 §0.8: sinh TRƯỚC khi gọi API ghi, lưu DB rồi mới bắn.
  -- Có `zalo_article_id` ⇒ tuyệt đối không tạo lại bài.
  idempotency_key     text,
  zalo_video_token    text,                        -- token từ preparevideo
  zalo_video_id       text,                        -- video_id từ upload_video/verify
  zalo_article_token  text,                        -- token từ article/create
  zalo_article_id     text,                        -- id thật từ article/verify
  zalo_shown_at       timestamptz,                 -- lúc chuyển status="show"

  broadcast_score     integer check (broadcast_score between 0 and 100),
  reject_reason       text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Hàng đợi của tick: nhặt theo (state, next_run_at) với for update skip locked.
create index if not exists social_post_queue
  on social_post (next_run_at, state)
  where state not in ('PUBLISHED', 'BROADCAST_SENT', 'FAILED', 'SKIPPED', 'REJECTED');

create index if not exists social_post_page_time on social_post (fb_page_id, fb_created_at desc);
create index if not exists social_post_article on social_post (zalo_article_id) where zalo_article_id is not null;

-- ─── Media đã chuẩn hoá, đang nằm trên R2 ───────────────────────────────────
-- `source_url` (CDN Facebook) HẾT HẠN — chỉ giữ để debug, không bao giờ đưa cho Zalo.
-- `public_url` mới là cái Zalo fetch về.
create table if not exists social_asset (
  id            bigserial primary key,
  fb_post_id    text not null references social_post(fb_post_id) on delete cascade,
  kind          text not null check (kind in ('image', 'video', 'thumb')),
  ordinal       integer not null default 0,
  source_url    text,
  public_url    text,
  bytes         integer,
  width         integer,
  height        integer,
  duration_sec  numeric(10, 2),
  mime          text,
  ok            boolean not null default false,    -- đã lọt ngưỡng Zalo chưa
  note          text,                              -- vì sao không lọt
  created_at    timestamptz not null default now(),
  unique (fb_post_id, kind, ordinal)
);

-- ─── Bản nháp do AI sinh, có version ────────────────────────────────────────
-- Giữ lịch sử để (1) so sánh khi prompt đổi, (2) lấy bài đã duyệt làm few-shot.
create table if not exists social_draft (
  id               bigserial primary key,
  fb_post_id       text not null references social_post(fb_post_id) on delete cascade,
  version          integer not null default 1,
  title            text not null check (char_length(title) <= 150),        -- trần Zalo
  description      text not null check (char_length(description) <= 300),  -- trần Zalo
  author           text not null check (char_length(author) <= 50),        -- trần Zalo
  body             jsonb not null,
  broadcast_score  integer check (broadcast_score between 0 and 100),
  reject_reason    text,
  model            text,
  prompt_version   text,
  edited_by_human  boolean not null default false,
  approved         boolean,
  approved_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (fb_post_id, version)
);

create index if not exists social_draft_fewshot
  on social_draft (approved, approved_at desc) where approved = true;

-- ─── Lượt broadcast + đối chiếu quota tháng ─────────────────────────────────
-- Quota gói OA rất hẹp (Cơ bản ~1/tháng, Nâng cao ~4/tháng). Bảng này là chỗ
-- CHẶN CỨNG, không phải chỗ ghi log sau khi đã bắn.
create table if not exists social_broadcast (
  id               bigserial primary key,
  oa_id            text not null,
  fb_post_id       text references social_post(fb_post_id) on delete set null,
  zalo_article_id  text not null,
  quota_month      text not null,                  -- 'YYYY-MM' theo giờ ICT
  zalo_message_id  text,
  target           jsonb,                          -- recipient.target đã dùng
  status           text not null default 'queued'
                     check (status in ('queued', 'sent', 'failed', 'blocked')),
  error_message    text,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz
);

-- Một bài chỉ được broadcast một lần. Bản ghi 'failed'/'blocked' không chiếm chỗ.
create unique index if not exists social_broadcast_once
  on social_broadcast (zalo_article_id) where status in ('queued', 'sent');

create index if not exists social_broadcast_quota on social_broadcast (oa_id, quota_month, status);

-- ─── Audit mỗi lần tick ─────────────────────────────────────────────────────
create table if not exists social_run (
  id             bigserial primary key,
  job_type       text not null,                    -- 'tick' · 'reconcile'
  status         text not null default 'running'
                   check (status in ('running', 'success', 'failed')),
  picked         integer not null default 0,
  advanced       integer not null default 0,
  error_message  text,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create index if not exists social_run_recent on social_run (started_at desc);

-- ─── Đếm quota broadcast đã dùng trong tháng ────────────────────────────────
-- Dùng ở _zalo-article trước khi bắn. 'blocked'/'failed' KHÔNG tính vào quota.
create or replace function social_broadcast_used(p_oa_id text, p_month text)
returns integer language sql stable as $$
  select count(*)::integer from social_broadcast
  where oa_id = p_oa_id and quota_month = p_month and status in ('queued', 'sent');
$$;
