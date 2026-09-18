-- M8.1 · Zalo OA Performance
-- PostgreSQL 14+. Chạy một lần trên database được trỏ bởi DATABASE_URL.

create table if not exists zalo_oa_token (
  oa_id text primary key,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists zalo_oa_daily_snapshot (
  oa_id text not null,
  snapshot_date date not null,
  follower_total integer not null check (follower_total >= 0),
  oa_name text,
  fetched_at timestamptz not null default now(),
  source_payload jsonb not null default '{}'::jsonb,
  primary key (oa_id, snapshot_date)
);

create table if not exists zalo_oa_webhook_event (
  id bigserial primary key,
  oa_id text not null,
  event_key text not null,
  event_name text not null,
  event_time timestamptz not null,
  event_date date not null,
  direction text not null check (direction in ('incoming', 'outgoing', 'system')),
  user_hash text,
  message_id text,
  message_type text not null default 'other',
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (oa_id, event_key)
);

create index if not exists zalo_oa_event_date_idx
  on zalo_oa_webhook_event (oa_id, event_date);
create index if not exists zalo_oa_event_user_time_idx
  on zalo_oa_webhook_event (oa_id, user_hash, event_time);

create table if not exists zalo_oa_daily_metric (
  oa_id text not null,
  metric_date date not null,
  follower_total integer,
  follower_net integer,
  incoming_messages integer not null default 0,
  outgoing_messages integer not null default 0,
  unique_chat_users integer not null default 0,
  conversations integer not null default 0,
  message_types jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (oa_id, metric_date)
);

create table if not exists zalo_oa_sync_run (
  id bigserial primary key,
  oa_id text,
  job_type text not null,
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_written integer not null default 0,
  error_message text
);

-- Rebuild phần message của một ngày sau mỗi webhook. "Conversation" là một
-- phiên bắt đầu bằng incoming message sau >=24 giờ không có event với user đó.
create or replace function zalo_oa_refresh_daily_metric(p_oa_id text, p_date date)
returns void
language plpgsql
as $$
declare
  v_start timestamptz := p_date::timestamp at time zone 'Asia/Bangkok';
  v_end timestamptz := (p_date + 1)::timestamp at time zone 'Asia/Bangkok';
begin
  with ordered as (
    select
      event_time,
      event_date,
      direction,
      user_hash,
      message_type,
      lag(event_time) over (partition by user_hash order by event_time, id) as previous_event_at
    from zalo_oa_webhook_event
    where oa_id = p_oa_id
      and event_time >= v_start - interval '24 hours'
      and event_time < v_end
      and user_hash is not null
      and direction in ('incoming', 'outgoing')
  ), day_events as (
    select * from ordered where event_time >= v_start and event_time < v_end
  ), type_counts as (
    select message_type, count(*)::integer as n
    from day_events
    where direction in ('incoming', 'outgoing')
    group by message_type
  ), totals as (
    select
      count(*) filter (where direction = 'incoming')::integer as incoming_messages,
      count(*) filter (where direction = 'outgoing')::integer as outgoing_messages,
      count(distinct user_hash) filter (where direction in ('incoming', 'outgoing'))::integer as unique_chat_users,
      count(*) filter (
        where direction = 'incoming'
          and (previous_event_at is null or event_time - previous_event_at >= interval '24 hours')
      )::integer as conversations
    from day_events
  ), types as (
    select coalesce(jsonb_object_agg(message_type, n), '{}'::jsonb) as message_types
    from type_counts
  )
  insert into zalo_oa_daily_metric (
    oa_id, metric_date, incoming_messages, outgoing_messages,
    unique_chat_users, conversations, message_types, updated_at
  )
  select p_oa_id, p_date, totals.incoming_messages, totals.outgoing_messages,
         totals.unique_chat_users, totals.conversations, types.message_types, now()
  from totals cross join types
  on conflict (oa_id, metric_date) do update set
    incoming_messages = excluded.incoming_messages,
    outgoing_messages = excluded.outgoing_messages,
    unique_chat_users = excluded.unique_chat_users,
    conversations = excluded.conversations,
    message_types = excluded.message_types,
    updated_at = now();
end;
$$;
