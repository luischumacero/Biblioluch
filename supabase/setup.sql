create table if not exists public.libros_pdf (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    nombre text not null check (char_length(nombre) between 1 and 100),
    storage_path text not null unique,
    is_shared boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.libros_pdf enable row level security;

grant select, insert, update, delete on public.libros_pdf to authenticated;

drop policy if exists "Users can read their own or shared books" on public.libros_pdf;
create policy "Users can read their own or shared books"
    on public.libros_pdf for select
    to authenticated
    using (auth.uid() = user_id or is_shared);

drop policy if exists "Users can add their own books" on public.libros_pdf;
create policy "Users can add their own books"
    on public.libros_pdf for insert
    to authenticated
    with check (auth.uid() = user_id and is_shared = false);

drop policy if exists "Users can rename their own books" on public.libros_pdf;
create policy "Users can rename their own books"
    on public.libros_pdf for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own books" on public.libros_pdf;
create policy "Users can delete their own books"
    on public.libros_pdf for delete
    to authenticated
    using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('libros-pdf', 'libros-pdf', false, 52428800, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload books to their own folder" on storage.objects;
create policy "Users can upload books to their own folder"
    on storage.objects for insert
    to authenticated
    with check (
        bucket_id = 'libros-pdf'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Users can read their own or shared book files" on storage.objects;
create policy "Users can read their own or shared book files"
    on storage.objects for select
    to authenticated
    using (
        bucket_id = 'libros-pdf'
        and (
            (storage.foldername(name))[1] = (select auth.uid())::text
            or exists (
                select 1
                from public.libros_pdf as book
                where book.storage_path = name
                  and book.is_shared = true
            )
        )
    );

drop policy if exists "Users can update their own book files" on storage.objects;
create policy "Users can update their own book files"
    on storage.objects for update
    to authenticated
    using (
        bucket_id = 'libros-pdf'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
        bucket_id = 'libros-pdf'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Users can delete their own book files" on storage.objects;
create policy "Users can delete their own book files"
    on storage.objects for delete
    to authenticated
    using (
        bucket_id = 'libros-pdf'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );
