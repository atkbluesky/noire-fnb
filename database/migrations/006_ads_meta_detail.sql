-- M5.1 · bổ sung dữ liệu Meta cho màn hình M5 ba tầng (28/09/2026)
-- Chạy lại an toàn: chỉ `add column if not exists` · `create … if not exists` · `create or replace`.
-- Luật M5_1 §0.6: CẤM drop / rename / alter type. Không chạm bảng module khác.

-- ─── 1. Sửa dữ liệu: cột `raw` bị mã hoá JSON HAI LẦN ───────────────────────
-- Lỗi ở đoạn ghi theo lô (unnest ::jsonb[]): postgres.js hỏi server kiểu tham số,
-- thấy jsonb thì tự JSON.stringify thêm một lần → chuỗi JSON bị bọc thành chuỗi.
-- Toàn bộ 2.224 dòng T1–T8/2026 lưu `raw` dạng jsonb STRING thay vì OBJECT.
-- Gỡ lớp bọc — không mất dữ liệu. Chỉ đụng dòng đang là string → chạy lại vô hại.
update ads_campaign_daily
   set raw = (raw #>> '{}')::jsonb
 where jsonb_typeof(raw) = 'string';

-- ─── 2. Tách hành động Meta ra cột riêng ────────────────────────────────────
-- Trước đây chỉ giữ trong `raw.actions`. Màn hình M5 ba tầng cần truy vấn, lọc,
-- cộng dồn các chỉ số này — để trong JSON là mỗi lần đọc phải bóc lại.
alter table ads_campaign_daily add column if not exists link_clicks  bigint not null default 0;  -- action `link_click`
alter table ads_campaign_daily add column if not exists leads        bigint not null default 0;  -- action `lead` (form đặt tiệc)
alter table ads_campaign_daily add column if not exists video_views  bigint not null default 0;  -- action `video_view` = xem ≥3 giây
alter table ads_campaign_daily add column if not exists thruplays    bigint not null default 0;  -- trường `video_thruplay_watched_actions`

-- Điền ngay cho dữ liệu cũ từ `raw` (ThruPlay không có trong raw → cần sync lại).
update ads_campaign_daily f
   set link_clicks = coalesce(x.link_clicks, 0),
       leads       = coalesce(x.leads, 0),
       video_views = coalesce(x.video_views, 0)
  from (
    select platform, campaign_id, stat_date,
           sum((a->>'value')::numeric) filter (where a->>'action_type' = 'link_click') as link_clicks,
           sum((a->>'value')::numeric) filter (where a->>'action_type' = 'lead')       as leads,
           sum((a->>'value')::numeric) filter (where a->>'action_type' = 'video_view') as video_views
      from ads_campaign_daily, jsonb_array_elements(coalesce(raw->'actions', '[]'::jsonb)) a
     where platform = 'meta'
     group by 1, 2, 3
  ) x
 where f.platform = x.platform and f.campaign_id = x.campaign_id and f.stat_date = x.stat_date;

-- ─── 3. Mart theo MẢNG: ngày × nền tảng × brand × phễu ──────────────────────
-- `ads_daily_metric` (005) gộp theo brand nên tin nhắn/lead của TIỆC lẫn vào
-- brand của page chạy nhờ. Màn hình M5 mới tách 4 mảng: NCB · NDC · NJFB · Tiệc(NEC),
-- nên cần mọi chỉ số — không chỉ chi tiêu — tách theo `funnel`.
-- Bảng cũ GIỮ NGUYÊN (luật §0.6), BI ngoài có thể đang đọc.
create table if not exists ads_daily_segment (
  stat_date               date not null,
  platform                text not null,
  brand                   text not null,      -- page / brand gán ở dim_ads_campaign
  funnel                  text not null,      -- store · booking · hr
  spend                   numeric(16,2) not null default 0,
  impressions             bigint not null default 0,
  clicks                  bigint not null default 0,
  link_clicks             bigint not null default 0,
  messaging_conversations bigint not null default 0,
  leads                   bigint not null default 0,
  video_views             bigint not null default 0,
  thruplays               bigint not null default 0,
  conversions             numeric(14,4) not null default 0,
  campaigns               integer not null default 0,
  paused_spend            numeric(16,2) not null default 0,
  updated_at              timestamptz not null default now(),
  primary key (stat_date, platform, brand, funnel)
);

create index if not exists ads_daily_segment_date_idx on ads_daily_segment (stat_date);

create or replace function ads_refresh_daily_segment(p_from date, p_to date)
returns integer
language plpgsql
as $$
declare
  v_rows integer;
begin
  delete from ads_daily_segment where stat_date between p_from and p_to;

  insert into ads_daily_segment (
    stat_date, platform, brand, funnel, spend, impressions, clicks, link_clicks,
    messaging_conversations, leads, video_views, thruplays, conversions,
    campaigns, paused_spend, updated_at
  )
  select
    f.stat_date,
    f.platform,
    coalesce(nullif(c.brand, ''), 'Không xác định'),
    coalesce(c.funnel, 'store'),
    coalesce(sum(f.spend), 0),
    coalesce(sum(f.impressions), 0),
    coalesce(sum(f.clicks), 0),
    coalesce(sum(f.link_clicks), 0),
    coalesce(sum(f.messaging_conversations), 0),
    coalesce(sum(f.leads), 0),
    coalesce(sum(f.video_views), 0),
    coalesce(sum(f.thruplays), 0),
    coalesce(sum(f.conversions), 0),
    count(*) filter (where f.spend > 0),
    coalesce(sum(f.spend) filter (where f.status ~* '(paused|removed|tạm dừng)'), 0),
    now()
  from ads_campaign_daily f
  left join dim_ads_campaign c on c.platform = f.platform and c.campaign_id = f.campaign_id
  where f.stat_date between p_from and p_to
  group by 1, 2, 3, 4;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- ─── 4. Reach & tần suất theo KỲ ────────────────────────────────────────────
-- Reach KHÔNG cộng được qua ngày hay qua chiến dịch (cùng một người bị đếm nhiều lần).
-- Tần suất lưu ở fact là theo NGÀY-CHIẾN DỊCH (cao nhất 2,91) — không phải chỉ số
-- bão hoà tệp. Muốn cảnh báo tần suất > 3,5 đúng nghĩa phải hỏi Meta reach của
-- CẢ CỬA SỔ. Sync lưu hai loại cửa sổ: từng tháng dương lịch, và 7 ngày gần nhất.
create table if not exists ads_period_reach (
  platform      text not null default 'meta',
  level         text not null check (level in ('account', 'campaign')),
  entity_id     text not null,                 -- account_id hoặc campaign_id
  period_kind   text not null check (period_kind in ('month', 'last7d')),
  period_start  date not null,
  period_end    date not null,                 -- tháng đang chạy: tới hôm qua
  reach         bigint,
  impressions   bigint,
  frequency     numeric(10,4),
  spend         numeric(16,2),
  synced_at     timestamptz not null default now(),
  primary key (platform, level, entity_id, period_kind, period_start)
);

create index if not exists ads_period_reach_kind_idx on ads_period_reach (period_kind, period_start);
