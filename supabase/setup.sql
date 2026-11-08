create extension if not exists pgcrypto;

create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'developer')),
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
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

alter table public.catalogue_items enable row level security;
alter table public.service_requests enable row level security;

drop policy if exists "Anyone can view active catalogue items" on public.catalogue_items;
create policy "Anyone can view active catalogue items"
  on public.catalogue_items for select to anon
  using (is_active);

drop policy if exists "Authenticated users can view active catalogue items and owner can view all" on public.catalogue_items;
create policy "Authenticated users can view active catalogue items and owner can view all"
  on public.catalogue_items for select to authenticated
  using (is_active or exists (
    select 1 from public.admin_roles
    where user_id = (select auth.uid()) and role = 'owner'
  ));

drop policy if exists "Owner can manage catalogue items" on public.catalogue_items;
create policy "Owner can manage catalogue items"
  on public.catalogue_items for all to authenticated
  using (exists (
    select 1 from public.admin_roles
    where user_id = (select auth.uid()) and role = 'owner'
  ))
  with check (exists (
    select 1 from public.admin_roles
    where user_id = (select auth.uid()) and role = 'owner'
  ));

drop policy if exists "Customers can read their own requests and owner can read all" on public.service_requests;
create policy "Customers can read their own requests and owner can read all"
  on public.service_requests for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.admin_roles
      where user_id = (select auth.uid()) and role = 'owner'
    )
  );

drop policy if exists "Owner can update request status" on public.service_requests;
create policy "Owner can update request status"
  on public.service_requests for update to authenticated
  using (exists (
    select 1 from public.admin_roles
    where user_id = (select auth.uid()) and role = 'owner'
  ))
  with check (
    status in ('new', 'contacted', 'confirmed', 'completed', 'cancelled')
    and exists (
      select 1 from public.admin_roles
      where user_id = (select auth.uid()) and role = 'owner'
    )
  );

revoke all on public.catalogue_items from anon, authenticated;
revoke all on public.service_requests from anon, authenticated;
grant select on public.catalogue_items to anon, authenticated;
grant insert (name, category, description, price, is_active, sort_order), update (name, category, description, price, is_active, sort_order), delete on public.catalogue_items to authenticated;
grant select on public.service_requests to authenticated;
grant update (status) on public.service_requests to authenticated;

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
create policy "Anyone can submit a pending review"
  on public.reviews for insert to anon, authenticated
  with check (status = 'pending');

drop policy if exists "Owner can read all reviews" on public.reviews;
create policy "Owner can read all reviews"
  on public.reviews for select to authenticated
  using (
    exists (
      select 1 from public.admin_roles
      where user_id = (select auth.uid()) and role = 'owner'
    )
  );

drop policy if exists "Owner can moderate reviews" on public.reviews;
create policy "Owner can moderate reviews"
  on public.reviews for update to authenticated
  using (
    exists (
      select 1 from public.admin_roles
      where user_id = (select auth.uid()) and role = 'owner'
    )
  )
  with check (
    status in ('pending', 'approved', 'rejected')
    and exists (
      select 1 from public.admin_roles
      where user_id = (select auth.uid()) and role = 'owner'
    )
  );

drop policy if exists "Remove incomplete pending review" on public.reviews;
create policy "Remove incomplete pending review"
  on public.reviews for delete to anon, authenticated
  using (status = 'pending');

revoke all on public.admin_roles from anon, authenticated;
revoke all on public.reviews from anon, authenticated;
revoke all on public.review_votes from anon, authenticated;
grant select on public.admin_roles to authenticated;
grant insert (id, first_name, last_name, whatsapp, service, rating, body, photos)
  on public.reviews to anon, authenticated;
grant select on public.reviews to authenticated;
grant update (status) on public.reviews to authenticated;
grant delete on public.reviews to anon, authenticated;
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
          where a.user_id = (select auth.uid()) and a.role = 'owner'
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

drop policy if exists "Submit photos for pending reviews" on storage.objects;
create policy "Submit photos for pending reviews"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'review-images'
    and public.can_upload_review_image(storage.objects.name)
  );

drop policy if exists "Read approved review photos and owner moderation photos" on storage.objects;
create policy "Read approved review photos and owner moderation photos"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'review-images'
    and public.can_read_review_image(storage.objects.name)
  );
