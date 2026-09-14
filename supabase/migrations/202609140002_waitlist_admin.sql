-- Read-only admin projection. No table grants, policies, or mobile dependencies.
create or replace function public.admin_waitlist_dashboard(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_today date := (current_timestamp at time zone 'UTC')::date;
  v_from date;
  v_to date;
  v_page integer := 1;
  v_result jsonb;
begin
  if p_filters is null or jsonb_typeof(p_filters) <> 'object' then
    raise exception 'Invalid filters';
  end if;
  if exists (select 1 from jsonb_each(p_filters) x where x.key not in
    ('status','city_region','gender','interested_in','referred','date_from','date_to','page')
    or (x.key <> 'page' and jsonb_typeof(x.value) <> 'string')) then
    raise exception 'Invalid filters';
  end if;
  if (p_filters ? 'status' and p_filters->>'status' not in ('waiting','priority','invited','beta','blocked'))
    or (p_filters ? 'gender' and p_filters->>'gender' not in ('Woman','Man','Non-binary','Prefer not to say'))
    or (p_filters ? 'interested_in' and p_filters->>'interested_in' not in ('Women','Men','Everyone','Prefer not to say'))
    or (p_filters ? 'referred' and p_filters->>'referred' not in ('yes','no'))
    or (p_filters ? 'city_region' and (length(btrim(p_filters->>'city_region')) not between 1 and 100 or p_filters->>'city_region' ~ '[[:cntrl:]]')) then
    raise exception 'Invalid filters';
  end if;
  if p_filters ? 'page' then
    if jsonb_typeof(p_filters->'page') <> 'number' or p_filters->>'page' !~ '^[1-9][0-9]{0,4}$' then raise exception 'Invalid filters'; end if;
    v_page := (p_filters->>'page')::integer;
    if v_page > 10000 then raise exception 'Invalid filters'; end if;
  end if;
  if p_filters ? 'date_from' then
    if p_filters->>'date_from' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid filters'; end if;
    v_from := (p_filters->>'date_from')::date;
  end if;
  if p_filters ? 'date_to' then
    if p_filters->>'date_to' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid filters'; end if;
    v_to := (p_filters->>'date_to')::date;
  end if;
  if v_from > v_to then raise exception 'Invalid filters'; end if;

  with filtered as materialized (
    select w.* from public.waitlist_entries w
    where (not p_filters ? 'status' or w.status = p_filters->>'status')
      and (not p_filters ? 'city_region' or lower(w.city_region) = lower(btrim(p_filters->>'city_region')))
      and (not p_filters ? 'gender' or w.gender = p_filters->>'gender')
      and (not p_filters ? 'interested_in' or w.interested_in = p_filters->>'interested_in')
      and (not p_filters ? 'referred' or (w.referred_by is not null) = (p_filters->>'referred' = 'yes'))
      and (v_from is null or w.created_at >= (v_from::timestamp at time zone 'UTC'))
      and (v_to is null or w.created_at < ((v_to + 1)::timestamp at time zone 'UTC'))
  ), stats as (
    select count(*) as total,
      count(*) filter (where (created_at at time zone 'UTC')::date = v_today) as today,
      count(*) filter (where (created_at at time zone 'UTC')::date between v_today - 6 and v_today) as last7,
      count(*) filter (where (created_at at time zone 'UTC')::date between v_today - 29 and v_today) as last30,
      coalesce(sum(referral_count),0) as total_referrals,
      count(*) filter (where referred_by is not null) as referred_signups,
      count(*) filter (where referral_count > 0) as referrers,
      coalesce(max(referral_count),0) as highest_referrals,
      coalesce(round(avg(referral_count) filter (where referral_count > 0),2),0) as average_referrals
    from filtered
  ), paging as (
    select least(v_page,greatest(1,ceil(total::numeric / 25)::integer)) as page,
      25 as page_size,total,greatest(1,ceil(total::numeric / 25)::integer) as pages from stats
  ), recent as (
    select left(split_part(email,'@',1),2)||'***@'||split_part(email,'@',2) as masked_email,
      created_at,city_region,gender,interested_in,status,referral_count,
      referred_by is not null as referred,heard_from
    from filtered order by created_at desc,id desc
    limit 25 offset (select (page-1)*25 from paging)
  ), top_referrers as (
    select left(split_part(email,'@',1),2)||'***@'||split_part(email,'@',2) as masked_email,
      city_region,referral_count,referral_code,created_at
    from filtered where referral_count > 0 order by referral_count desc,created_at,id limit 10
  ), cities as (
    select city_region as label,count(*) as count from filtered group by city_region
  ), city_ranked as (
    select *,row_number() over(order by count desc,label) as rank from cities
  ), city_chart as (
    select label,count from city_ranked where rank <= 10
    union all select 'Other cities',sum(count) from city_ranked where rank > 10 having count(*) > 0
  ), trend as (
    select to_char(day,'YYYY-MM-DD') as label,count(f.id) as count
    from generate_series(v_today - 29,v_today,interval '1 day') day
    left join filtered f on (f.created_at at time zone 'UTC')::date = day::date
    group by day order by day
  ), buckets as (
    select label,count(f.id) as count from (values ('0',0,0,0),('1',1,1,1),('2–4',2,4,2),('5–9',5,9,3),('10+',10,2147483647,4)) b(label,lo,hi,position)
    left join filtered f on f.referral_count between b.lo and b.hi group by label,position order by position
  )
  select jsonb_build_object(
    'overview',(select to_jsonb(s)||jsonb_build_object('top_referral_code',(select referral_code from top_referrers limit 1)) from stats s),
    'pagination',(select to_jsonb(p) from paging p),
    'recent',coalesce((select jsonb_agg(r) from recent r),'[]'::jsonb),
    'top_referrers',coalesce((select jsonb_agg(t) from top_referrers t),'[]'::jsonb),
    'breakdowns',jsonb_build_object(
      'city',coalesce((select jsonb_agg(c order by count desc,label) from city_chart c),'[]'::jsonb),
      'gender',coalesce((select jsonb_agg(g) from (select gender as label,count(*) as count from filtered group by gender order by gender) g),'[]'::jsonb),
      'interest',coalesce((select jsonb_agg(i) from (select interested_in as label,count(*) as count from filtered group by interested_in order by interested_in) i),'[]'::jsonb),
      'status',(select jsonb_agg(s order by label) from (select label,count(f.id) as count from unnest(array['waiting','priority','invited','beta','blocked']) label left join filtered f on f.status=label group by label) s),
      'trend',(select jsonb_agg(t) from trend t),
      'referrals',(select jsonb_agg(b) from buckets b)
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_waitlist_dashboard(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_waitlist_dashboard(jsonb) to service_role;
comment on function public.admin_waitlist_dashboard(jsonb) is 'Internal read-only masked waitlist dashboard. Server credentials only; application session authorization required.';
