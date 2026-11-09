create extension if not exists pgcrypto;

create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('store_admin', 'technical_admin')),
  created_at timestamptz not null default now()
);

alter table public.admin_roles drop constraint if exists admin_roles_role_check;
update public.admin_roles
set role = case role
  when 'owner' then 'store_admin'
  when 'developer' then 'technical_admin'
  else role
end;
alter table public.admin_roles
  add constraint admin_roles_role_check check (role in ('store_admin', 'technical_admin'));

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 50),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 50),
  whatsapp text not null check (char_length(whatsapp) between 7 and 20),
  service text not null check (service in ('Make-up', 'Hair styling', 'Hair installation', 'Lashes', 'Other')),
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  photos text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  constraint review_photo_limit check (cardinality(photos) <= 3)
);

alter table public.reviews
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create table if not exists public.review_votes (
  review_id uuid not null references public.reviews(id) on delete cascade,
  visitor_id uuid not null,
  is_helpful boolean not null,
  created_at timestamptz not null default now(),
  primary key (review_id, visitor_id)
);

create table if not exists public.catalogue_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  category text not null check (char_length(btrim(category)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 500),
  price numeric(10, 2) not null check (price >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.catalogue_items
  add column if not exists image_path text;

insert into public.catalogue_items
  (name, category, description, price, is_active, sort_order)
select starter.name, starter.category, starter.description, 0, false, starter.sort_order
from (values
  ('Full Glam Make-up Application', 'Make-up Artistry', 'Starter draft. Set your price, update the service details and add a photo before making it visible.', 10),
  ('Bridal Make-up Package', 'Bridal & Occasions', 'Starter draft. Set your price, update the service details and add a photo before making it visible.', 20),
  ('Hair & Wig Styling', 'Hair & Wig Styling', 'Starter draft. Set your price, update the service details and add a photo before making it visible.', 30)
) as starter(name, category, description, sort_order)
where not exists (
  select 1 from public.catalogue_items existing where existing.name = starter.name
);

create table if not exists public.catalogue_item_analytics_daily (
  day date not null,
  catalogue_item_id uuid not null references public.catalogue_items(id) on delete cascade,
  view_count bigint not null default 0 check (view_count >= 0),
  duration_seconds_total bigint not null default 0 check (duration_seconds_total >= 0),
  primary key (day, catalogue_item_id)
);

create index if not exists catalogue_item_analytics_day_idx
  on public.catalogue_item_analytics_daily (day desc);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_name text not null check (char_length(btrim(contact_name)) between 1 and 100),
  phone text not null check (char_length(btrim(phone)) between 7 and 30),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 50),
  estimated_total numeric(10, 2) not null check (estimated_total >= 0),
  customization text not null default '' check (char_length(customization) <= 1000),
  call_requested boolean not null default false,
  status text not null default 'new' check (status in ('new', 'contacted', 'confirmed', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.appointment_blocks (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint appointment_blocks_valid_range check (ends_at > starts_at)
);

create index if not exists appointment_blocks_range_idx
  on public.appointment_blocks (starts_at, ends_at);

create table if not exists public.site_analytics (
  day date not null,
  event_type text not null check (
    event_type in ('page_view', 'booking_request', 'review_submission', 'cart_exit')
  ),
  page_path text not null check (
    page_path in ('/', '/account.html', '/admin.html', '/privacy.html')
  ),
  interest text not null default '' check (
    interest = '' or interest in (
      'Make-up Artistry', 'Hair & Wig Styling', 'Bridal & Occasions', 'Lashes & Finishing'
    )
  ),
  event_count bigint not null default 0 check (event_count >= 0),
  duration_seconds_total bigint not null default 0 check (duration_seconds_total >= 0),
  item_count_total bigint not null default 0 check (item_count_total >= 0),
  primary key (day, event_type, page_path, interest)
);

create index if not exists site_analytics_day_idx
  on public.site_analytics (day desc);

alter table public.catalogue_items enable row level security;
alter table public.service_requests enable row level security;
alter table public.appointment_blocks enable row level security;
alter table public.site_analytics enable row level security;
alter table public.catalogue_item_analytics_daily enable row level security;

drop policy if exists "Anyone can view active catalogue items" on public.catalogue_items;
create policy "Anyone can view active catalogue items"
  on public.catalogue_items for select to anon
  using (is_active);

drop policy if exists "Authenticated users can view active catalogue items and owner can view all" on public.catalogue_items;
drop policy if exists "Authenticated users can view active catalogue items and store admin can view all" on public.catalogue_items;
create policy "Authenticated users can view active catalogue items and store admin can view all"
  on public.catalogue_items for select to authenticated
  using (is_active or exists (
    select 1 from public.admin_roles
    where user_id = (select auth.uid()) and role = 'store_admin'
  ));

drop policy if exists "Owner can manage catalogue items" on public.catalogue_items;
drop policy if exists "Store admin can manage catalogue items" on public.catalogue_items;
create policy "Store admin can manage catalogue items"
  on public.catalogue_items for all to authenticated
  using (exists (
    select 1 from public.admin_roles
    where user_id = (select auth.uid()) and role = 'store_admin'
  ))
  with check (exists (
    select 1 from public.admin_roles
    where user_id = (select auth.uid()) and role = 'store_admin'
  ));

drop policy if exists "Customers can read their own requests and owner can read all" on public.service_requests;
drop policy if exists "Customers can read their own requests and store admin can read all" on public.service_requests;
create policy "Customers can read their own requests and store admin can read all"
  on public.service_requests for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.admin_roles
      where user_id = (select auth.uid()) and role = 'store_admin'
    )
  );

drop policy if exists "Owner can update request status" on public.service_requests;
drop policy if exists "Store admin can update request status" on public.service_requests;
create policy "Store admin can update request status"
  on public.service_requests for update to authenticated
  using (exists (
    select 1 from public.admin_roles
    where user_id = (select auth.uid()) and role = 'store_admin'
  ))
  with check (
    status in ('new', 'contacted', 'confirmed', 'completed', 'cancelled')
    and exists (
      select 1 from public.admin_roles
      where user_id = (select auth.uid()) and role = 'store_admin'
    )
  );

revoke all on public.catalogue_items from anon, authenticated;
revoke all on public.service_requests from anon, authenticated;
grant select on public.catalogue_items to anon, authenticated;
grant insert (name, category, description, price, is_active, sort_order, image_path), update (name, category, description, price, is_active, sort_order, image_path), delete on public.catalogue_items to authenticated;
grant select on public.service_requests to authenticated;
grant update (status) on public.service_requests to authenticated;

drop policy if exists "Anyone can view booked periods" on public.appointment_blocks;
create policy "Anyone can view booked periods"
  on public.appointment_blocks for select to anon, authenticated
  using (true);

drop policy if exists "Store admin can manage booked periods" on public.appointment_blocks;
create policy "Store admin can manage booked periods"
  on public.appointment_blocks for all to authenticated
  using (exists (
    select 1 from public.admin_roles
    where user_id = (select auth.uid()) and role = 'store_admin'
  ))
  with check (exists (
    select 1 from public.admin_roles
    where user_id = (select auth.uid()) and role = 'store_admin'
  ));

revoke all on public.appointment_blocks from anon, authenticated;
grant select (starts_at, ends_at) on public.appointment_blocks to anon, authenticated;
grant select, insert (starts_at, ends_at), update (starts_at, ends_at), delete
  on public.appointment_blocks to authenticated;

revoke all on public.site_analytics from anon, authenticated;
revoke all on public.catalogue_item_analytics_daily from anon, authenticated;

create or replace function public.record_catalogue_item_view(
  p_catalogue_item_id uuid,
  p_duration_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_catalogue_item_id is null
     or coalesce(p_duration_seconds, 0) not between 1 and 86400
     or not exists (
       select 1 from public.catalogue_items
       where id = p_catalogue_item_id and is_active
     ) then
    raise exception 'Invalid catalogue view';
  end if;

  insert into public.catalogue_item_analytics_daily as current_daily (
    day, catalogue_item_id, view_count, duration_seconds_total
  ) values (
    (clock_timestamp() at time zone 'Africa/Johannesburg')::date,
    p_catalogue_item_id,
    1,
    p_duration_seconds
  )
  on conflict (day, catalogue_item_id)
  do update set
    view_count = current_daily.view_count + excluded.view_count,
    duration_seconds_total = current_daily.duration_seconds_total + excluded.duration_seconds_total;
end;
$$;

revoke all on function public.record_catalogue_item_view(uuid, integer) from public;
grant execute on function public.record_catalogue_item_view(uuid, integer) to anon, authenticated;

create or replace function public.record_site_analytics(
  p_event_type text,
  p_page_path text,
  p_duration_seconds integer default 0,
  p_item_count integer default 0,
  p_interest text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not exists (
    select 1 from public.admin_roles
    where user_id = (select auth.uid())
      and role in ('store_admin', 'technical_admin')
  ) then
    raise exception 'Analytics collection is not available for customer accounts';
  end if;

  if p_event_type not in ('page_view', 'booking_request', 'review_submission', 'cart_exit')
     or p_page_path not in ('/', '/account.html', '/admin.html', '/privacy.html')
     or coalesce(p_duration_seconds, -1) not between 0 and 86400
     or coalesce(p_item_count, -1) not between 0 and 50
     or (p_interest is not null and p_interest not in (
       'Make-up Artistry', 'Hair & Wig Styling', 'Bridal & Occasions', 'Lashes & Finishing'
     ))
     or (p_event_type <> 'page_view' and p_duration_seconds <> 0)
     or (p_event_type <> 'cart_exit' and p_item_count <> 0)
     or (p_event_type = 'booking_request' and p_interest is null)
     or (p_event_type <> 'booking_request' and p_interest is not null) then
    raise exception 'Invalid anonymous analytics event';
  end if;

  insert into public.site_analytics as current_daily (
    day, event_type, page_path, interest, event_count,
    duration_seconds_total, item_count_total
  ) values (
    (clock_timestamp() at time zone 'Africa/Johannesburg')::date,
    p_event_type,
    p_page_path,
    coalesce(p_interest, ''),
    1,
    p_duration_seconds,
    p_item_count
  )
  on conflict (day, event_type, page_path, interest)
  do update set
    event_count = current_daily.event_count + excluded.event_count,
    duration_seconds_total = current_daily.duration_seconds_total + excluded.duration_seconds_total,
    item_count_total = current_daily.item_count_total + excluded.item_count_total;
end;
$$;

revoke all on function public.record_site_analytics(text, text, integer, integer, text) from public;
grant execute on function public.record_site_analytics(text, text, integer, integer, text)
  to anon, authenticated;

create or replace function public.get_admin_analytics()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if auth.uid() is not null and not exists (
    select 1 from public.admin_roles
    where user_id = (select auth.uid())
      and role in ('store_admin', 'technical_admin')
  ) then
    raise exception 'Analytics collection is not available for customer accounts';
  end if;
  if not exists (
    select 1 from public.admin_roles
    where user_id = (select auth.uid())
      and role in ('store_admin', 'technical_admin')
  ) then
    raise exception 'Admin access is required';
  end if;

  select jsonb_build_object(
    'totals', jsonb_build_object(
      'pageViews', coalesce((
        select sum(event_count) from public.site_analytics where event_type = 'page_view'
      ), 0),
      'averageVisitSeconds', coalesce((
        select round(sum(duration_seconds_total)::numeric / nullif(sum(event_count), 0))::integer
        from public.site_analytics where event_type = 'page_view'
      ), 0),
      'unfinishedSelections', coalesce((
        select sum(event_count) from public.site_analytics where event_type = 'cart_exit'
      ), 0),
      'unfinishedItems', coalesce((
        select sum(item_count_total) from public.site_analytics where event_type = 'cart_exit'
      ), 0),
      'bookingRequests', coalesce((
        select sum(event_count) from public.site_analytics where event_type = 'booking_request'
      ), 0),
      'serviceRequests', (select count(*) from public.service_requests),
      'openRequests', (
        select count(*) from public.service_requests where status in ('new', 'contacted')
      ),
      'reviewSubmissions', coalesce((
        select sum(event_count) from public.site_analytics where event_type = 'review_submission'
      ), 0)
    ),
    'daily', coalesce((
      select jsonb_agg(day_data order by day_data.day)
      from (
        select
          to_char(day, 'YYYY-MM-DD') as day,
          coalesce(sum(event_count) filter (where event_type = 'page_view'), 0) as visits,
          coalesce(sum(event_count) filter (where event_type = 'booking_request'), 0) as booking_requests,
          coalesce(sum(event_count) filter (where event_type = 'cart_exit'), 0) as unfinished_selections
        from public.site_analytics
        where day >= (clock_timestamp() at time zone 'Africa/Johannesburg')::date - 29
        group by day
      ) as day_data
    ), '[]'::jsonb),
    'topPages', coalesce((
      select jsonb_agg(page_data order by page_data.visits desc)
      from (
        select
          page_path as page,
          sum(event_count) as visits,
          coalesce(round(sum(duration_seconds_total)::numeric / nullif(sum(event_count), 0))::integer, 0) as average_seconds
        from public.site_analytics
        where event_type = 'page_view'
        group by page_path
        order by sum(event_count) desc
        limit 5
      ) as page_data
    ), '[]'::jsonb),
    'topServices', coalesce((
      select jsonb_agg(service_data order by service_data.requests desc)
      from (
        select interest as service, sum(event_count) as requests
        from public.site_analytics
        where event_type = 'booking_request' and interest <> ''
        group by interest
        order by sum(event_count) desc
        limit 4
      ) as service_data
    ), '[]'::jsonb),
    'requestStatuses', coalesce((
      select jsonb_agg(status_data order by status_data.status)
      from (
        select status, count(*)::integer as requests
        from public.service_requests
        group by status
      ) as status_data
    ), '[]'::jsonb),
    'catalogueItems', coalesce((
      select jsonb_agg(item_data order by item_data.views desc)
      from (
        select
          c.id,
          c.name,
          sum(a.view_count) as views,
          coalesce(round(sum(a.duration_seconds_total)::numeric / nullif(sum(a.view_count), 0))::integer, 0) as average_seconds
        from public.catalogue_item_analytics_daily a
        join public.catalogue_items c on c.id = a.catalogue_item_id
        where c.is_active
        group by c.id, c.name
        order by sum(a.view_count) desc
        limit 10
      ) as item_data
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_analytics() from public, anon;
grant execute on function public.get_admin_analytics() to authenticated;

create or replace function public.create_service_request(
  p_items jsonb,
  p_contact_name text,
  p_phone text,
  p_customization text default '',
  p_call_requested boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  product public.catalogue_items%rowtype;
  item_id uuid;
  quantity integer;
  request_items jsonb := '[]'::jsonb;
  request_total numeric(10, 2) := 0;
  seen_ids uuid[] := '{}';
  request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required to send a service request';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Choose between 1 and 50 catalogue items';
  end if;
  if char_length(btrim(coalesce(p_contact_name, ''))) not between 1 and 100
     or char_length(btrim(coalesce(p_phone, ''))) not between 7 and 30
     or char_length(coalesce(p_customization, '')) > 1000 then
    raise exception 'Check your name, phone number, and customization details';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(item->>'id', '') !~* '^[0-9a-f-]{36}$'
       or coalesce(item->>'quantity', '') !~ '^[1-9][0-9]?$' then
      raise exception 'A catalogue item or quantity is invalid';
    end if;
    item_id := (item->>'id')::uuid;
    quantity := (item->>'quantity')::integer;
    if quantity > 10 or item_id = any(seen_ids) then
      raise exception 'Item quantities must be 1 to 10 and items cannot be duplicated';
    end if;
    select * into product from public.catalogue_items
    where id = item_id and is_active;
    if not found then
      raise exception 'A selected catalogue item is no longer available';
    end if;
    seen_ids := array_append(seen_ids, item_id);
    request_total := request_total + product.price * quantity;
    request_items := request_items || jsonb_build_array(jsonb_build_object(
      'id', product.id,
      'name', product.name,
      'category', product.category,
      'unit_price', product.price,
      'quantity', quantity,
      'subtotal', product.price * quantity
    ));
  end loop;

  insert into public.service_requests (user_id, contact_name, phone, items, estimated_total, customization, call_requested)
  values ((select auth.uid()), btrim(p_contact_name), btrim(p_phone), request_items, request_total,
    btrim(coalesce(p_customization, '')), coalesce(p_call_requested, false))
  returning id into request_id;
  return request_id;
end;
$$;

revoke all on function public.create_service_request(jsonb, text, text, text, boolean) from public, anon;
grant execute on function public.create_service_request(jsonb, text, text, text, boolean) to authenticated;

alter table public.admin_roles enable row level security;
alter table public.reviews enable row level security;
alter table public.review_votes enable row level security;

drop policy if exists "Admins can read their own role" on public.admin_roles;
create policy "Admins can read their own role"
  on public.admin_roles for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Anyone can submit a pending review" on public.reviews;
drop policy if exists "Authenticated customers can submit pending reviews" on public.reviews;
create policy "Authenticated customers can submit pending reviews"
  on public.reviews for insert to authenticated
  with check (status = 'pending' and user_id = (select auth.uid()));

drop policy if exists "Owner can read all reviews" on public.reviews;
drop policy if exists "Store admin can read all reviews" on public.reviews;
create policy "Store admin can read all reviews"
  on public.reviews for select to authenticated
  using (
    exists (
      select 1 from public.admin_roles
      where user_id = (select auth.uid()) and role = 'store_admin'
    )
  );

drop policy if exists "Owner can moderate reviews" on public.reviews;
drop policy if exists "Store admin can moderate reviews" on public.reviews;
create policy "Store admin can moderate reviews"
  on public.reviews for update to authenticated
  using (
    exists (
      select 1 from public.admin_roles
      where user_id = (select auth.uid()) and role = 'store_admin'
    )
  )
  with check (
    status in ('pending', 'approved', 'rejected')
    and exists (
      select 1 from public.admin_roles
      where user_id = (select auth.uid()) and role = 'store_admin'
    )
  );

drop policy if exists "Remove incomplete pending review" on public.reviews;
drop policy if exists "Owners and store admins can remove pending reviews" on public.reviews;
create policy "Owners and store admins can remove pending reviews"
  on public.reviews for delete to authenticated
  using (
    status = 'pending'
    and (
      user_id = (select auth.uid())
      or exists (
        select 1 from public.admin_roles
        where user_id = (select auth.uid()) and role = 'store_admin'
      )
    )
  );

revoke all on public.admin_roles from anon, authenticated;
revoke all on public.reviews from anon, authenticated;
revoke all on public.review_votes from anon, authenticated;
grant select on public.admin_roles to authenticated;
grant insert (id, user_id, first_name, last_name, whatsapp, service, rating, body, photos)
  on public.reviews to authenticated;
grant select on public.reviews to authenticated;
grant update (status) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;
revoke all on public.review_votes from anon, authenticated;

create or replace view public.public_reviews
with (security_barrier = true)
as
select
  r.id,
  r.first_name,
  left(r.last_name, 1) as last_initial,
  r.service,
  r.rating,
  r.body,
  r.photos,
  r.created_at,
  count(v.review_id) filter (where v.is_helpful)::integer as helpful_count,
  count(v.review_id) filter (where not v.is_helpful)::integer as not_helpful_count
from public.reviews r
left join public.review_votes v on v.review_id = r.id
where r.status = 'approved'
group by r.id;

grant select on public.public_reviews to anon, authenticated;

create or replace function public.can_upload_review_image(object_name text)
returns boolean
language sql
security definer
set search_path = public, storage, pg_temp
as $$
  select exists (
    select 1 from public.reviews r
    where r.id::text = (storage.foldername(object_name))[1]
      and r.status = 'pending'
      and r.user_id = (select auth.uid())
      and r.photos @> array[object_name]
  );
$$;

create or replace function public.can_read_review_image(object_name text)
returns boolean
language sql
security definer
set search_path = public, storage, pg_temp
as $$
  select exists (
    select 1 from public.reviews r
    where r.photos @> array[object_name]
      and (
        r.status = 'approved'
        or exists (
          select 1 from public.admin_roles a
          where a.user_id = (select auth.uid()) and a.role = 'store_admin'
        )
      )
  );
$$;

revoke all on function public.can_upload_review_image(text) from public;
revoke all on function public.can_read_review_image(text) from public;
grant execute on function public.can_upload_review_image(text) to anon, authenticated;
grant execute on function public.can_read_review_image(text) to anon, authenticated;

create or replace function public.cast_review_vote(
  p_review_id uuid,
  p_visitor_id uuid,
  p_is_helpful boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_visitor_id is null or p_is_helpful is null then
    raise exception 'A voter and vote choice are required';
  end if;
  if not exists (
    select 1 from public.reviews
    where id = p_review_id and status = 'approved'
  ) then
    raise exception 'This review is not available for voting';
  end if;

  insert into public.review_votes (review_id, visitor_id, is_helpful)
  values (p_review_id, p_visitor_id, p_is_helpful)
  on conflict (review_id, visitor_id)
  do update set is_helpful = excluded.is_helpful;
end;
$$;

revoke all on function public.cast_review_vote(uuid, uuid, boolean) from public;
grant execute on function public.cast_review_vote(uuid, uuid, boolean) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-images', 'review-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogue-images', 'catalogue-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Store admins can upload catalogue photos" on storage.objects;
create policy "Store admins can upload catalogue photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'catalogue-images'
    and exists (
      select 1 from public.admin_roles
      where user_id = (select auth.uid()) and role = 'store_admin'
    )
  );

drop policy if exists "Store admins can delete catalogue photos" on storage.objects;
create policy "Store admins can delete catalogue photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'catalogue-images'
    and exists (
      select 1 from public.admin_roles
      where user_id = (select auth.uid()) and role = 'store_admin'
    )
  );

drop policy if exists "Submit photos for pending reviews" on storage.objects;
create policy "Submit photos for pending reviews"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'review-images'
    and public.can_upload_review_image(storage.objects.name)
  );

drop policy if exists "Read approved review photos and owner moderation photos" on storage.objects;
drop policy if exists "Read approved review photos and store admin moderation photos" on storage.objects;
create policy "Read approved review photos and store admin moderation photos"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'review-images'
    and public.can_read_review_image(storage.objects.name)
  );
