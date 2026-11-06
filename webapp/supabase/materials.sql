-- Run after webapp/supabase/schema.sql and discovery.sql.
-- Private learning materials shared ONLY inside an existing conversation.
create table if not exists public.learning_materials (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
 kind text not null check (kind in ('phrase','text','video','audio')),
 title text not null check (char_length(btrim(title)) between 1 and 120),
 body text not null default '' check (char_length(body) <= 5000),
 translation text not null default '' check (char_length(translation) <= 5000),
 video_url text,
 audio_path text,
 created_at timestamptz not null default now(),
 constraint material_payload check (
 (kind in ('phrase','text') and char_length(btrim(body)) > 0 and video_url is null and audio_path is null)
 or (kind = 'video' and video_url ~ '^https://[^[:space:]]{3,2000}$' and audio_path is null)
 or (kind = 'audio' and audio_path is not null and video_url is null)
 )
);
create index if not exists learning_materials_conversation_date on public.learning_materials(conversation_id,created_at desc);
alter table public.learning_materials enable row level security;
revoke all on public.learning_materials from anon, authenticated;
grant select, insert on public.learning_materials to authenticated;
drop policy if exists "participants can view shared materials" on public.learning_materials;
create policy "participants can view shared materials" on public.learning_materials for select to authenticated
using (exists (select 1 from public.conversations c where c.id = learning_materials.conversation_id and auth.uid() in (c.user_a,c.user_b)));
drop policy if exists "participants can share materials" on public.learning_materials;
create policy "participants can share materials" on public.learning_materials for insert to authenticated
with check (
 sender_id = auth.uid()
 and exists (select 1 from public.conversations c where c.id = learning_materials.conversation_id and auth.uid() in (c.user_a,c.user_b))
 and (kind <> 'audio' or (
 split_part(audio_path,'/',1) = conversation_id::text
 and split_part(audio_path,'/',2) = auth.uid()::text
 and split_part(audio_path,'/',3) <> ''
 ))
);
do $$ begin alter publication supabase_realtime add table public.learning_materials;
exception when duplicate_object then null; end $$;
-- Audio material uses existing PRIVATE voice-notes bucket and participant RLS.
-- No anonymous access; do not use service_role in browser.
