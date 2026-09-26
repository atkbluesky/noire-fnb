-- M10.1 · Đặt bàn từ iPOS Booking Open API
-- Chạy lại an toàn: mọi lệnh đều `if not exists` / `create or replace`.
-- Luật riêng tư (M10_1 §7): KHÔNG lưu SĐT thô, tên, email, nội dung ghi chú.

-- ─── Dim: nhà hàng ──────────────────────────────────────────────────────────
create table if not exists dim_ipos_restaurant (
  pos_parent      text not null,
  pos_id          text not null,                 -- restaurant.reference_pos
  restaurant_id   text,                          -- ObjectId phía iPOS
  name            text,
  store_code      text,                          -- khoá join sang dim_store, gán tay
  booking_active  boolean,
  updated_at      timestamptz not null default now(),
  primary key (pos_parent, pos_id)
);

-- ─── Dim: nguồn đặt bàn ─────────────────────────────────────────────────────
-- `code` ổn định, `name_ipos` là chữ tự do và CÓ THỂ TRÙNG giữa nhiều code
-- (dashboard iPOS của NOIRE đang có nhiều lát cùng tên "Google Ads").
-- Ba cột dưới gán TAY, đây là chỗ duy nhất gom code về kênh chuẩn.
create table if not exists dim_ipos_source (
  code        text primary key,
  name_ipos   text,
  channel     text,                              -- kênh chuẩn: meta · google · zalo · hotline · walkin · website · partner
  is_paid     boolean,                           -- có phải kênh trả phí không
  platform    text,                              -- facebook · google · zalo · tiktok · …
  first_seen  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── Fact: đơn đặt bàn ──────────────────────────────────────────────────────
create table if not exists ipos_reservation (
  booking_code     text primary key,
  pos_parent       text not null,
  pos_id           text,
  source_code      text,
  status           text not null,                -- WAITING_CONFIRM · CONFIRMED · RECEIVED · COMPLETED · CANCELLED · NOT_COME
  created_at       timestamptz not null,         -- trục cohort
  confirmed_at     timestamptz,
  meal_day         date not null,                -- trục phục vụ (ngày địa phương)
  expected_start   timestamptz,
  expected_end     timestamptz,
  real_start       timestamptz,                  -- null = khách chưa ngồi
  real_end         timestamptz,
  seats            integer not null default 0,
  adult_seats      integer,
  child_seats      integer,
  deposit          numeric(14,2) not null default 0,
  total_amount     numeric(14,2) not null default 0,   -- món đặt trước, KHÔNG phải doanh thu bill
  table_ids        text[] not null default '{}',
  tag_ids          text[] not null default '{}',
  phone_hash       text,                         -- HMAC-SHA256(PHONE_HASH_KEY), không bao giờ là số thô
  has_note         boolean not null default false,
  collaborator_id  text,
  pos_push_failed  boolean not null default false,  -- booking_alt.hub_errors ≠ []
  synced_at        timestamptz not null default now()
);

create index if not exists ipos_reservation_created_idx  on ipos_reservation (created_at);
create index if not exists ipos_reservation_meal_idx     on ipos_reservation (meal_day);
create index if not exists ipos_reservation_source_idx   on ipos_reservation (source_code);
create index if not exists ipos_reservation_outlet_idx   on ipos_reservation (pos_parent, pos_id);
-- phục vụ vòng re-sync đơn đang mở
create index if not exists ipos_reservation_open_idx     on ipos_reservation (meal_day)
  where status in ('WAITING_CONFIRM', 'CONFIRMED');

-- ─── Nhật ký đổi trạng thái ─────────────────────────────────────────────────
-- Một trạng thái ghi một lần → idempotent, chạy lại webhook không nhân dòng.
create table if not exists ipos_reservation_status_log (
  booking_code  text not null,
  status        text not null,
  seen_at       timestamptz not null default now(),
  via           text not null,                   -- webhook · sync
  primary key (booking_code, status)
);

-- ─── Hàng đợi webhook ───────────────────────────────────────────────────────
-- Payload webhook RẤT MỎNG và KHÔNG có chữ ký → chỉ lưu "có thay đổi",
-- dữ liệu thật luôn lấy lại bằng filters{codes}. Dòng chưa resolve được
-- sẽ do /api/ipos/sync dọn sau.
create table if not exists ipos_webhook_event (
  id            bigserial primary key,
  booking_code  text not null,
  pos_parent    text,
  event         text,                            -- RESERVATION_NEW · RESERVATION_CHANGE
  status_hint   text,                            -- trạng thái webhook khai, CHƯA được tin
  received_at   timestamptz not null default now(),
  resolved_at   timestamptz
);
create index if not exists ipos_webhook_event_open_idx on ipos_webhook_event (received_at)
  where resolved_at is null;

-- ─── Bàn (mở khoá M3) ───────────────────────────────────────────────────────
-- `filters` KHÔNG trả seats, chỉ trả table_ids. Bảng này nạp từ
-- get-list-fb / get-info-fb, chạy thành job riêng theo tuần.
create table if not exists ipos_table (
  table_id     text primary key,
  pos_parent   text,
  pos_id       text,
  code         text,
  name         text,
  seats        integer,
  min_person   integer,
  max_person   integer,
  area_id      text,
  table_type   text,
  updated_at   timestamptz not null default now()
);

-- ─── Audit ──────────────────────────────────────────────────────────────────
create table if not exists ipos_sync_run (
  id             bigserial primary key,
  kind           text not null,                  -- window · open · webhook · manual
  pos_parent     text,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  fetched        integer not null default 0,
  upserted       integer not null default 0,
  ok             boolean not null default false,
  error_message  text
);
