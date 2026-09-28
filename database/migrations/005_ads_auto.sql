-- M5.1 · Ads Auto — Meta Marketing API + Google Ads API
-- PostgreSQL 14+. Chạy lại an toàn: mọi lệnh đều `if not exists` / `create or replace`.
--
-- Luật M5_1 §0.6: CHỈ cộng thêm. Cấm `drop table` · `drop column` · `rename` ·
-- `alter column … type` trên mọi bảng. Cấm chạm namespace `zalo_oa_*` · `ipos_*` ·
-- `social_*` · `dim_ipos_*` — ba module đó đang chạy production trên cùng database.
--
-- Grain fact: 1 ngày × 1 chiến dịch × 1 nền tảng (QĐ-2).

-- ─── Dim: tài khoản quảng cáo ───────────────────────────────────────────────
create table if not exists dim_ads_account (
  platform      text not null check (platform in ('meta', 'google')),
  account_id    text not null,              -- Meta: id KHÔNG có tiền tố act_ · Google: 10 số không gạch
  name          text,
  currency      text,                       -- phải là 'VND' — QA gate 3
  timezone      text,                       -- lệch Asia/Ho_Chi_Minh = lệch ngày (M5_1 §3c.3)
  updated_at    timestamptz not null default now(),
  primary key (platform, account_id)
);

-- ─── Dim: chiến dịch + luật gán ─────────────────────────────────────────────
-- BẢNG QUAN TRỌNG NHẤT của module (M5_1 §2b, QĐ-4).
-- Đây là chỗ DUY NHẤT quyết định một chiến dịch thuộc brand nào và có vào ACR không.
-- Regex chỉ đoán MỘT LẦN lúc chèn dòng; `mapping_locked = true` là người đã sửa tay
-- và sync KHÔNG BAO GIỜ ghi đè nữa.
create table if not exists dim_ads_campaign (
  platform        text not null check (platform in ('meta', 'google')),
  campaign_id     text not null,
  account_id      text,
  campaign_name   text,                     -- cập nhật mỗi lần sync — tên có thể đổi
  brand           text,                     -- NCB · NDC · NJFB · NEC · Tuyển dụng · Không xác định
  objective       text,                     -- 5 nhóm OBJ_PAT + Khác
  store_code      text,                     -- khoá join sang dim_store, gán tay

  /* Phễu doanh thu mà chi tiêu này nhắm tới — quyết định mẫu số nào dùng được.
       store   → doanh thu nhà hàng (store_month.net)  → vào ACR
       booking → doanh thu tiệc/catering (M10 theo dõi riêng, KHÔNG nằm trong store_month)
       hr      → tuyển dụng, không phải marketing thương hiệu
     `hr` kế thừa nguyên luật M5 §6.2. `booking` là phát hiện 27/09/2026: brand NEC
     (NOIRE Events & Catering) chạy booking tiệc và ĐÃ được M10 §3 tính là chi phí ads
     booking — để nguyên trong tử số ACR mà mẫu số không có doanh thu tiệc thì ACR bị
     thổi lên. T8/2026: 0,898% so với 0,775%. Xem M5_1 §3e. */
  funnel          text not null default 'store' check (funnel in ('store', 'booking', 'hr')),

  mapping_locked  boolean not null default false,
  first_seen      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (platform, campaign_id)
);

create index if not exists dim_ads_campaign_brand_idx  on dim_ads_campaign (brand);
create index if not exists dim_ads_campaign_funnel_idx on dim_ads_campaign (funnel);

-- ─── Fact: ngày × chiến dịch ────────────────────────────────────────────────
-- Khoá tự nhiên (platform, campaign_id, stat_date) → upsert chạy lại được (luật §0.10).
create table if not exists ads_campaign_daily (
  platform                text not null check (platform in ('meta', 'google')),
  campaign_id             text not null,
  stat_date               date not null,
  account_id              text,
  spend                   numeric(16,2) not null default 0,   -- VND. Google ĐÃ chia micros ở tầng map
  impressions             bigint not null default 0,
  clicks                  bigint not null default 0,
  reach                   bigint,                             -- Meta có · Google KHÔNG → null, không phải 0
  frequency               numeric(10,4),
  conversions             numeric(14,4) not null default 0,   -- Google trả THẬP PHÂN
  results                 numeric(14,4),                      -- Meta: kết quả theo mục tiêu
  result_type             text,
  messaging_conversations bigint not null default 0,          -- mẫu số Cost per Conversation
  status                  text,                               -- để tính paused_spend
  raw                     jsonb not null default '{}'::jsonb, -- payload đã lược, để sau thêm field khỏi kéo lại API
  synced_at               timestamptz not null default now(),
  primary key (platform, campaign_id, stat_date)
);

create index if not exists ads_campaign_daily_date_idx     on ads_campaign_daily (stat_date);
create index if not exists ads_campaign_daily_platform_idx on ads_campaign_daily (platform, stat_date);

-- ─── Fact: kênh hiển thị Google (grain KHÁC) ────────────────────────────────
-- Bảng riêng vì grain là (campaign_id, network, stat_date). Nhồi vào bảng trên
-- là nhân đôi chi phí — đúng bẫy M5 §6.3 đã mắc với Excel (6,28tr thay vì 3,14tr).
create table if not exists ads_network_daily (
  platform     text not null default 'google',
  campaign_id  text not null,
  network      text not null,                -- Maps · Search · Display · YouTube · Discover
  stat_date    date not null,
  spend        numeric(16,2) not null default 0,
  impressions  bigint not null default 0,
  clicks       bigint not null default 0,
  conversions  numeric(14,4) not null default 0,
  synced_at    timestamptz not null default now(),
  primary key (platform, campaign_id, network, stat_date)
);

create index if not exists ads_network_daily_date_idx on ads_network_daily (stat_date);

-- ─── Fact: cụm từ tìm kiếm Google ───────────────────────────────────────────
-- Luật riêng tư M5_1 §2g: `search_term` là truy vấn NGƯỜI DÙNG THẬT gõ vào Google,
-- có thể lẫn số điện thoại. Cụm khớp \d{9,} phải ghi '[đã lược]' TRƯỚC khi vào đây.
create table if not exists ads_search_term_daily (
  platform        text not null default 'google',
  campaign_id     text not null,
  search_term     text not null,
  stat_date       date not null,
  spend           numeric(16,2) not null default 0,
  impressions     bigint not null default 0,
  clicks          bigint not null default 0,
  conversions     numeric(14,4) not null default 0,
  has_brand_term  boolean not null default false,   -- chứa 'noire' — tính lúc GHI, khỏi ilike toàn bảng
  synced_at       timestamptz not null default now(),
  primary key (platform, campaign_id, search_term, stat_date)
);

create index if not exists ads_search_term_date_idx  on ads_search_term_daily (stat_date);
create index if not exists ads_search_term_brand_idx on ads_search_term_daily (has_brand_term, stat_date);

-- ─── Mart: ngày × brand × nền tảng ──────────────────────────────────────────
-- Dựng lại bằng ads_refresh_daily_metric() sau mỗi lần sync — cùng khuôn với
-- zalo_oa_refresh_daily_metric() của M8.1. Mục đích: view query nhanh, và BI ngoài
-- (Metabase/Looker) cắm thẳng vào không cần hiểu logic gán brand.
create table if not exists ads_daily_metric (
  stat_date               date not null,
  brand                   text not null,
  platform                text not null,

  /* Ba rổ tách theo `funnel`. Cộng lại = tổng chi tiêu.
     media_spend giữ ĐÚNG định nghĩa ACR đang báo cáo BOD = store + booking.
     store_spend là rổ dùng cho ACR lõi — chỉ phần nhắm doanh thu nhà hàng. */
  store_spend             numeric(16,2) not null default 0,
  booking_spend           numeric(16,2) not null default 0,
  hr_spend                numeric(16,2) not null default 0,
  media_spend             numeric(16,2) not null default 0,   -- store + booking (KHÔNG gồm hr)

  impressions             bigint not null default 0,
  clicks                  bigint not null default 0,
  reach                   bigint,
  conversions             numeric(14,4) not null default 0,
  messaging_conversations bigint not null default 0,
  campaigns               integer not null default 0,         -- số chiến dịch có chi tiêu > 0
  paused_spend            numeric(16,2) not null default 0,   -- M5 checklist mục 1
  updated_at              timestamptz not null default now(),
  primary key (stat_date, brand, platform)
);

create index if not exists ads_daily_metric_date_idx on ads_daily_metric (stat_date);

-- ─── Nhật ký chạy ───────────────────────────────────────────────────────────
create table if not exists ads_sync_run (
  id             bigserial primary key,
  platform       text,
  kind           text not null default 'window',   -- window · backfill
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  ok             boolean,
  window_from    date,
  window_to      date,
  fetched        integer not null default 0,
  upserted       integer not null default 0,
  redacted_terms integer not null default 0,       -- số cụm từ bị lược vì nghi lộ SĐT (§2g)
  error_message  text
);

-- `finished_at is null and started_at < now() - interval '30 minutes'` = job treo (QA gate 9)
create index if not exists ads_sync_run_open_idx on ads_sync_run (started_at)
  where finished_at is null;

-- ─── Dựng lại mart cho một khoảng ngày ──────────────────────────────────────
-- Gọi sau mỗi lần sync. Idempotent: xoá đúng khoảng rồi dựng lại từ fact,
-- nên chạy hai lần liền ra cùng một kết quả (QA gate 8).
create or replace function ads_refresh_daily_metric(p_from date, p_to date)
returns integer
language plpgsql
as $$
declare
  v_rows integer;
begin
  delete from ads_daily_metric where stat_date between p_from and p_to;

  with joined as (
    select
      f.stat_date,
      coalesce(nullif(c.brand, ''), 'Không xác định') as brand,
      f.platform,
      coalesce(c.funnel, 'store') as funnel,
      f.spend,
      f.impressions,
      f.clicks,
      f.reach,
      f.conversions,
      f.messaging_conversations,
      f.status
    from ads_campaign_daily f
    left join dim_ads_campaign c
      on c.platform = f.platform and c.campaign_id = f.campaign_id
    where f.stat_date between p_from and p_to
  )
  insert into ads_daily_metric (
    stat_date, brand, platform,
    store_spend, booking_spend, hr_spend, media_spend,
    impressions, clicks, reach, conversions, messaging_conversations,
    campaigns, paused_spend, updated_at
  )
  select
    stat_date,
    brand,
    platform,
    coalesce(sum(spend) filter (where funnel = 'store'), 0),
    coalesce(sum(spend) filter (where funnel = 'booking'), 0),
    coalesce(sum(spend) filter (where funnel = 'hr'), 0),
    coalesce(sum(spend) filter (where funnel in ('store', 'booking')), 0),
    coalesce(sum(impressions), 0),
    coalesce(sum(clicks), 0),
    -- reach KHÔNG cộng được giữa các chiến dịch (trùng người). Chỉ giữ khi có,
    -- và phải đọc là "tổng reach từng chiến dịch", không phải reach hợp nhất.
    sum(reach),
    coalesce(sum(conversions), 0),
    coalesce(sum(messaging_conversations), 0),
    count(*) filter (where spend > 0),
    coalesce(sum(spend) filter (where status is not null and status ~* '(paused|removed|tạm dừng)'), 0),
    now()
  from joined
  group by stat_date, brand, platform;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- ─── Tiện tra cứu: chiến dịch chưa gán brand, xếp theo tiền ─────────────────
-- Dùng cho QA gate 11 + 13. Người vận hành mở view này là thấy ngay phải sửa dòng nào.
create or replace view ads_unmapped_campaign as
select
  c.platform,
  c.campaign_id,
  c.campaign_name,
  c.brand,
  c.funnel,
  c.mapping_locked,
  sum(f.spend) as spend,
  min(f.stat_date) as first_date,
  max(f.stat_date) as last_date
from ads_campaign_daily f
left join dim_ads_campaign c
  on c.platform = f.platform and c.campaign_id = f.campaign_id
where c.campaign_id is null
   or c.brand is null
   or c.brand = 'Không xác định'
group by c.platform, c.campaign_id, c.campaign_name, c.brand, c.funnel, c.mapping_locked
order by sum(f.spend) desc;
