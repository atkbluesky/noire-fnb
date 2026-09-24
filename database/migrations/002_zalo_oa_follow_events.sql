-- M8.1 · đếm event follow / unfollow vào bảng ngày.
-- Chạy SAU 001. An toàn khi chạy lại (add column if not exists + create or replace).
-- Webhook đã lưu event follow/unfollow với direction = 'system', message_type = 'follow' | 'unfollow'.

alter table zalo_oa_daily_metric add column if not exists new_followers integer not null default 0;
alter table zalo_oa_daily_metric add column if not exists unfollowers integer not null default 0;

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
  ), follows as (
    select
      count(*) filter (where message_type = 'follow')::integer as new_followers,
      count(*) filter (where message_type = 'unfollow')::integer as unfollowers
    from zalo_oa_webhook_event
    where oa_id = p_oa_id and direction = 'system'
      and event_time >= v_start and event_time < v_end
  ), types as (
    select coalesce(jsonb_object_agg(message_type, n), '{}'::jsonb) as message_types
    from type_counts
  )
  insert into zalo_oa_daily_metric (
    oa_id, metric_date, incoming_messages, outgoing_messages,
    unique_chat_users, conversations, message_types, new_followers, unfollowers, updated_at
  )
  select p_oa_id, p_date, totals.incoming_messages, totals.outgoing_messages,
         totals.unique_chat_users, totals.conversations, types.message_types,
         follows.new_followers, follows.unfollowers, now()
  from totals cross join types cross join follows
  on conflict (oa_id, metric_date) do update set
    incoming_messages = excluded.incoming_messages,
    outgoing_messages = excluded.outgoing_messages,
    unique_chat_users = excluded.unique_chat_users,
    conversations = excluded.conversations,
    message_types = excluded.message_types,
    new_followers = excluded.new_followers,
    unfollowers = excluded.unfollowers,
    updated_at = now();
end;
$$;
