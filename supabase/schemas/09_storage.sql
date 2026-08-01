-- Storage buckets (private) + RLS policies
-- Build guide §12 step 6 / §13
-- Buckets: audio, video, srt. All private (public=false).

insert into storage.buckets (id, name, public)
values
  ('audio', 'audio', false),
  ('video', 'video', false),
  ('srt',   'srt',   false)
on conflict (id) do nothing;

-- owner can read, insert, and update objects in these buckets
drop policy if exists "storage_audio_owner_select" on storage.objects;
create policy "storage_audio_owner_select" on storage.objects
  for select to authenticated
  using ( bucket_id = 'audio' and owner = auth.uid() );

drop policy if exists "storage_audio_owner_insert" on storage.objects;
create policy "storage_audio_owner_insert" on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'audio' and owner = auth.uid() );

drop policy if exists "storage_audio_owner_update" on storage.objects;
create policy "storage_audio_owner_update" on storage.objects
  for update to authenticated
  using ( bucket_id = 'audio' and owner = auth.uid() )
  with check ( bucket_id = 'audio' and owner = auth.uid() );

drop policy if exists "storage_video_owner_select" on storage.objects;
create policy "storage_video_owner_select" on storage.objects
  for select to authenticated
  using ( bucket_id = 'video' and owner = auth.uid() );

drop policy if exists "storage_video_owner_insert" on storage.objects;
create policy "storage_video_owner_insert" on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'video' and owner = auth.uid() );

drop policy if exists "storage_video_owner_update" on storage.objects;
create policy "storage_video_owner_update" on storage.objects
  for update to authenticated
  using ( bucket_id = 'video' and owner = auth.uid() )
  with check ( bucket_id = 'video' and owner = auth.uid() );

drop policy if exists "storage_srt_owner_select" on storage.objects;
create policy "storage_srt_owner_select" on storage.objects
  for select to authenticated
  using ( bucket_id = 'srt' and owner = auth.uid() );

drop policy if exists "storage_srt_owner_insert" on storage.objects;
create policy "storage_srt_owner_insert" on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'srt' and owner = auth.uid() );

drop policy if exists "storage_srt_owner_update" on storage.objects;
create policy "storage_srt_owner_update" on storage.objects
  for update to authenticated
  using ( bucket_id = 'srt' and owner = auth.uid() )
  with check ( bucket_id = 'srt' and owner = auth.uid() );