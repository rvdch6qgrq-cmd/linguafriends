-- LinguaFriends: run once in Supabase SQL Editor, before inviting users.
-- Text and voice messages are visible only to the two conversation participants.
-- The storage bucket is PRIVATE. Do not put service_role keys in the frontend.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Friend' check (char_length(display_name) between 1 and 60),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint different_participants check (user_a <> user_b),
  constraint unique_pair unique (user_a, user_b)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('text', 'audio')),
  body text,
  audio_path text,
  created_at timestamptz not null default now(),
  constraint valid_message check (
    (kind = 'text' and body is not null and char_length(btrim(body)) between 1 and 3000 and audio_path is null)
    or (kind = 'audio' and audio_path is not null and body is null)
  )
);
create index if not exists messages_conversation_date on public.messages (conversation_id, created_at);

create table if not exists public.phrases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  original text not null check (char_length(btrim(original)) between 1 and 1000),
  translation text not null default '' check (char_length(translation) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists phrases_owner_date on public.phrases (owner_id, created_at);

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(split_part(new.email, '@', 1), ''), 'Friend'), 60))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists auth_user_created_linguafriends on auth.users;
create trigger auth_user_created_linguafriends
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

-- Create profiles for users who signed up before the SQL was installed, if any.
insert into public.profiles (id, display_name)
select id, left(coalesce(nullif(split_part(email, '@', 1), ''), 'Friend'), 60) from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.phrases enable row level security;

-- Hardening: no direct conversation creation, no client changes to invite codes.
revoke all on public.profiles, public.conversations, public.messages, public.phrases from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert, delete on public.phrases to authenticated;

create policy "read own and chat partners' profiles"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid()) or exists (
      select 1 from public.conversations c
      where (c.user_a = (select auth.uid()) and c.user_b = profiles.id)
         or (c.user_b = (select auth.uid()) and c.user_a = profiles.id)
    )
  );
create policy "edit own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "read my conversations"
  on public.conversations for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));

create policy "read messages in my conversations"
  on public.messages for select to authenticated
  using (
    exists (select 1 from public.conversations c
      where c.id = messages.conversation_id and (select auth.uid()) in (c.user_a, c.user_b))
  );
create policy "send messages into my conversations"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (select 1 from public.conversations c
      where c.id = messages.conversation_id and (select auth.uid()) in (c.user_a, c.user_b))
    and (
      kind = 'text'
      or (split_part(audio_path, '/', 1) = conversation_id::text
          and split_part(audio_path, '/', 2) = (select auth.uid())::text
          and split_part(audio_path, '/', 3) <> '')
    )
  );

create policy "read my phrases" on public.phrases for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "insert my phrases" on public.phrases for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "delete my phrases" on public.phrases for delete to authenticated
  using (owner_id = (select auth.uid()));

-- A security-definer RPC is the only way to create private chats.
-- Invite codes are intentionally not searchable in the client.
create or replace function public.start_conversation(friend_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  other_user uuid;
  left_user uuid;
  right_user uuid;
  result_id uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if char_length(btrim(coalesce(friend_code, ''))) <> 12 then
    raise exception 'Invite code must be 12 characters';
  end if;
  select p.id into other_user from public.profiles p
  where p.invite_code = upper(btrim(friend_code));
  if other_user is null then raise exception 'Invite code not found'; end if;
  if other_user = me then raise exception 'Cannot chat with yourself'; end if;
  left_user := least(me, other_user);
  right_user := greatest(me, other_user);
  insert into public.conversations (user_a, user_b)
  values (left_user, right_user)
  on conflict (user_a, user_b) do nothing
  returning id into result_id;
  if result_id is null then
    select c.id into result_id from public.conversations c
    where c.user_a = left_user and c.user_b = right_user;
  end if;
  return result_id;
end;
$$;
revoke all on function public.start_conversation(text) from public, anon;
grant execute on function public.start_conversation(text) to authenticated;

-- Private voice files: conversations/<participant>/<random>.mp4|webm|ogg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-notes', 'voice-notes', false, 8388608,
  array['audio/mp4', 'audio/webm', 'audio/ogg', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/x-m4a']
)
on conflict (id) do update set public = false, file_size_limit = 8388608,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "upload voice notes to my own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (select auth.uid()) in (c.user_a, c.user_b)
    )
  );
create policy "read voice notes in my conversations"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'voice-notes'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(name))[1]
        and (select auth.uid()) in (c.user_a, c.user_b)
    )
  );

-- Simpler realtime subscription for a small friend-group MVP.
-- Database RLS is checked for each subscriber.
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null;
end $$;
