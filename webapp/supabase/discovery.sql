-- LinguaFriends opt-in language partner discovery (v0.2).
-- Run AFTER schema.sql, once, in Supabase SQL Editor.
-- Tested in principle against PostgreSQL / Supabase; verify RLS with two test accounts before launch.

alter table public.profiles
  add column if not exists native_language text not null default 'ru',
  add column if not exists learning_language text not null default 'en',
  add column if not exists intro text not null default '',
  add column if not exists discoverable boolean not null default false,
  add column if not exists adult_confirmed boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_languages_valid' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_languages_valid check (
      native_language in ('ru','en','es','fr','de','it','pt','ja','ko','zh')
      and learning_language in ('ru','en','es','fr','de','it','pt','ja','ko','zh')
      and char_length(intro) <= 180
      and (not discoverable or adult_confirmed)
    );
  end if;
end $$;

-- These fields may only be edited on your own row, using the existing update policy.
grant update (native_language, learning_language, intro, discoverable, adult_confirmed)
  on public.profiles to authenticated;

create table if not exists public.partner_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  constraint partner_request_distinct check (sender_id <> recipient_id),
  constraint partner_request_pair unique (sender_id, recipient_id)
);
create index if not exists partner_requests_incoming_idx on public.partner_requests(recipient_id, created_at desc);
create index if not exists partner_requests_sender_idx on public.partner_requests(sender_id, created_at desc);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_distinct check (blocker_id <> blocked_id)
);

create table if not exists public.partner_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','inappropriate','other')),
  created_at timestamptz not null default now(),
  constraint reports_distinct check (reporter_id <> reported_id)
);
create index if not exists partner_reports_created_idx on public.partner_reports(created_at desc);

alter table public.partner_requests enable row level security;
alter table public.blocks enable row level security;
alter table public.partner_reports enable row level security;
revoke all on public.partner_requests, public.blocks, public.partner_reports from anon, authenticated;
grant select on public.partner_requests, public.blocks to authenticated;
-- Reports are intentionally NOT readable or writable directly from browsers.

create policy "read my sent and received requests" on public.partner_requests
  for select to authenticated using ((select auth.uid()) in (sender_id, recipient_id));
create policy "read my blocks" on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));

-- Permit viewing limited profile details only if a request exists or users share a chat.
-- Public discovery uses a separate RPC that exposes only selected columns.
drop policy if exists "read own and chat partners' profiles" on public.profiles;
create policy "read own and chat partners' profiles" on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (select 1 from public.conversations c
      where (c.user_a = (select auth.uid()) and c.user_b = profiles.id)
         or (c.user_b = (select auth.uid()) and c.user_a = profiles.id))
    or exists (select 1 from public.partner_requests r
      where (r.sender_id = (select auth.uid()) and r.recipient_id = profiles.id)
         or (r.recipient_id = (select auth.uid()) and r.sender_id = profiles.id))
  );

-- Security definer avoids exposing other users' block lists via row security.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when auth.uid() not in (a,b) then true
    else exists (select 1 from public.blocks
      where (blocker_id = a and blocked_id = b)
         or (blocker_id = b and blocked_id = a)) end;
$$;
revoke all on function public.is_blocked_between(uuid,uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid,uuid) to authenticated;

-- Prevent *new* messages and uploads between blocked participants.
-- Historical chat remains readable; add data erasure and retention controls before public launch.
create policy "blocked pairs cannot send" on public.messages as restrictive
  for insert to authenticated with check (
    not exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and public.is_blocked_between(c.user_a, c.user_b)
    )
  );
create policy "blocked pairs cannot upload" on storage.objects as restrictive
  for insert to authenticated with check (
    bucket_id <> 'voice-notes' or not exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and public.is_blocked_between(c.user_a, c.user_b)
    )
  );

-- Existing friend invite codes still work but may not bypass a block.
create or replace function public.start_conversation(friend_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid(); other_user uuid; left_user uuid; right_user uuid; result_id uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if char_length(btrim(coalesce(friend_code, ''))) <> 12 then
    raise exception 'Invite code must be 12 characters';
  end if;
  select p.id into other_user from public.profiles p where p.invite_code = upper(btrim(friend_code));
  if other_user is null then raise exception 'Invite code not found'; end if;
  if other_user = me then raise exception 'Cannot chat with yourself'; end if;
  if public.is_blocked_between(me, other_user) then raise exception 'Cannot start this chat'; end if;
  left_user := least(me, other_user); right_user := greatest(me, other_user);
  insert into public.conversations (user_a, user_b)
    values (left_user, right_user)
    on conflict (user_a, user_b) do nothing returning id into result_id;
  if result_id is null then
    select c.id into result_id from public.conversations c
      where c.user_a = left_user and c.user_b = right_user;
  end if;
  return result_id;
end;
$$;
revoke all on function public.start_conversation(text) from public, anon;
grant execute on function public.start_conversation(text) to authenticated;

-- Only opted-in, self-identified adults appear in discovery.
-- No email, personal invite code, location, or other private fields are returned.
create or replace function public.find_language_partners(lang_filter text default null)
returns table(id uuid, display_name text, native_language text, learning_language text, intro text)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); my_lang text; my_target text; eligible boolean;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select p.native_language, p.learning_language, p.adult_confirmed
    into my_lang, my_target, eligible from public.profiles p where p.id = me;
  if not coalesce(eligible, false) then raise exception 'Confirm you are 18+ in your profile first'; end if;
  if lang_filter is not null and lang_filter not in ('ru','en','es','fr','de','it','pt','ja','ko','zh') then
    raise exception 'Unsupported language';
  end if;
  return query
    select p.id, p.display_name, p.native_language, p.learning_language, p.intro
    from public.profiles p
    where p.discoverable and p.adult_confirmed and p.id <> me
      and (lang_filter is null or p.native_language = lang_filter)
      and not public.is_blocked_between(me, p.id)
      and not exists (select 1 from public.conversations c
        where (c.user_a = me and c.user_b = p.id) or (c.user_b = me and c.user_a = p.id))
    order by (p.native_language = my_target and p.learning_language = my_lang) desc,
             p.created_at desc
    limit 40;
end;
$$;
revoke all on function public.find_language_partners(text) from public, anon;
grant execute on function public.find_language_partners(text) to authenticated;

create or replace function public.request_language_partner(partner_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); result_id uuid;
begin
  if me is null or partner_id is null or partner_id = me then raise exception 'Invalid partner'; end if;
  if not exists (select 1 from public.profiles p where p.id = me and p.adult_confirmed) then
    raise exception 'Confirm you are 18+ in your profile first';
  end if;
  if not exists (select 1 from public.profiles p where p.id = partner_id and p.discoverable and p.adult_confirmed) then
    raise exception 'Profile no longer available';
  end if;
  if public.is_blocked_between(me, partner_id) then raise exception 'Cannot contact this profile'; end if;
  if exists (select 1 from public.conversations c
    where (c.user_a = me and c.user_b = partner_id) or (c.user_b = me and c.user_a = partner_id)) then
    raise exception 'You are already connected';
  end if;
  if exists (select 1 from public.partner_requests r
    where (r.sender_id = me and r.recipient_id = partner_id)
       or (r.sender_id = partner_id and r.recipient_id = me)) then
    raise exception 'A request already exists between you';
  end if;
  if (select count(*) from public.partner_requests r
    where r.sender_id = me and r.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Daily limit reached (10 requests)';
  end if;
  insert into public.partner_requests(sender_id, recipient_id) values (me,partner_id)
    returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.request_language_partner(uuid) from public, anon;
grant execute on function public.request_language_partner(uuid) to authenticated;

create or replace function public.answer_language_request(request_id uuid, approve boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); sender uuid; result_id uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select r.sender_id into sender from public.partner_requests r
    where r.id = request_id and r.recipient_id = me and r.status = 'pending' for update;
  if sender is null then raise exception 'Request no longer available'; end if;
  if public.is_blocked_between(me, sender) then raise exception 'Cannot accept this request'; end if;
  update public.partner_requests set status = case when approve then 'accepted' else 'declined' end,
    answered_at = now() where id = request_id;
  if not approve then return null; end if;
  insert into public.conversations(user_a, user_b)
    values (least(me,sender), greatest(me,sender))
    on conflict (user_a,user_b) do nothing returning id into result_id;
  if result_id is null then
    select c.id into result_id from public.conversations c
      where c.user_a = least(me,sender) and c.user_b = greatest(me,sender);
  end if;
  return result_id;
end;
$$;
revoke all on function public.answer_language_request(uuid,boolean) from public, anon;
grant execute on function public.answer_language_request(uuid,boolean) to authenticated;

create or replace function public.block_language_partner(partner_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null or partner_id is null or me = partner_id then raise exception 'Invalid partner'; end if;
  insert into public.blocks(blocker_id, blocked_id) values (me,partner_id)
    on conflict do nothing;
  update public.partner_requests set status = 'declined', answered_at = now()
    where status = 'pending' and
      ((sender_id = me and recipient_id = partner_id) or (sender_id = partner_id and recipient_id = me));
end;
$$;
revoke all on function public.block_language_partner(uuid) from public, anon;
grant execute on function public.block_language_partner(uuid) to authenticated;

create or replace function public.report_language_partner(partner_id uuid, report_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null or partner_id is null or partner_id = me then raise exception 'Invalid report'; end if;
  if report_reason not in ('spam','harassment','inappropriate','other') then
    raise exception 'Invalid reason';
  end if;
  if (select count(*) from public.partner_reports r
    where r.reporter_id = me and r.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Daily report limit reached';
  end if;
  insert into public.partner_reports(reporter_id,reported_id,reason)
    values (me,partner_id,report_reason);
end;
$$;
revoke all on function public.report_language_partner(uuid,text) from public, anon;
grant execute on function public.report_language_partner(uuid,text) to authenticated;
