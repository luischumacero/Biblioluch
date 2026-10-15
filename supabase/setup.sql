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

create table if not exists public.community_groups (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 1 and 80),
    owner_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

create table if not exists public.community_members (
    group_id uuid not null references public.community_groups(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'member' check (role in ('owner', 'member')),
    joined_at timestamptz not null default now(),
    primary key (group_id, user_id)
);

create table if not exists public.community_invites (
    group_id uuid primary key references public.community_groups(id) on delete cascade,
    join_code text not null unique check (join_code ~ '^[A-Z0-9]{8,20}$')
);

create table if not exists public.community_books (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.community_groups(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null check (char_length(name) between 1 and 100),
    storage_path text not null unique,
    created_at timestamptz not null default now()
);

create index if not exists community_members_user_id_idx on public.community_members(user_id);
create index if not exists community_books_group_id_idx on public.community_books(group_id, created_at desc);

alter table public.community_groups enable row level security;
alter table public.community_members enable row level security;
alter table public.community_invites enable row level security;
alter table public.community_books enable row level security;

grant select on public.community_groups to authenticated;
grant select on public.community_members, public.community_invites to authenticated;
grant select, insert, delete on public.community_books to authenticated;

create or replace function public.is_community_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.community_members
        where group_id = p_group_id
          and user_id = (select auth.uid())
    );
$$;

revoke all on function public.is_community_member(uuid) from public;
grant execute on function public.is_community_member(uuid) to authenticated;

drop policy if exists "Members can view their groups" on public.community_groups;
create policy "Members can view their groups"
    on public.community_groups for select
    to authenticated
    using (public.is_community_member(id));

drop policy if exists "Members can view group membership" on public.community_members;
create policy "Members can view group membership"
    on public.community_members for select
    to authenticated
    using (public.is_community_member(group_id));

drop policy if exists "Owners can view their join codes" on public.community_invites;
create policy "Owners can view their join codes"
    on public.community_invites for select
    to authenticated
    using (
        exists (
            select 1 from public.community_groups
            where id = group_id and owner_id = (select auth.uid())
        )
    );

drop policy if exists "Members can view group books" on public.community_books;
create policy "Members can view group books"
    on public.community_books for select
    to authenticated
    using (public.is_community_member(group_id));

drop policy if exists "Members can add group books" on public.community_books;
create policy "Members can add group books"
    on public.community_books for insert
    to authenticated
    with check (
        user_id = (select auth.uid())
        and public.is_community_member(group_id)
        and storage_path like 'community/' || group_id::text || '/' || (select auth.uid())::text || '/%.pdf'
    );

drop policy if exists "Uploaders can delete their group books" on public.community_books;
create policy "Uploaders can delete their group books"
    on public.community_books for delete
    to authenticated
    using (user_id = (select auth.uid()) and public.is_community_member(group_id));

create or replace function public.create_community_group(p_name text, p_join_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_group_id uuid;
    clean_name text := trim(p_name);
    clean_code text := upper(trim(p_join_code));
begin
    if auth.uid() is null then
        raise exception 'Inicia sesión para crear una comunidad.';
    end if;
    if clean_name is null or char_length(clean_name) not between 1 and 80 then
        raise exception 'El nombre del grupo debe tener entre 1 y 80 caracteres.';
    end if;
    if clean_code is null or clean_code !~ '^[A-Z0-9]{8,20}$' then
        raise exception 'El código de ingreso no tiene un formato válido.';
    end if;

    insert into public.community_groups (name, owner_id)
    values (clean_name, (select auth.uid()))
    returning id into new_group_id;

    insert into public.community_members (group_id, user_id, role)
    values (new_group_id, (select auth.uid()), 'owner');
    insert into public.community_invites (group_id, join_code)
    values (new_group_id, clean_code);
    return new_group_id;
end;
$$;

create or replace function public.join_community_group(p_join_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    target_group_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Inicia sesión para ingresar a una comunidad.';
    end if;
    select group_id into target_group_id
    from public.community_invites
    where join_code = upper(trim(p_join_code));
    if target_group_id is null then
        raise exception 'El código no existe o ya no está activo.';
    end if;
    insert into public.community_members (group_id, user_id, role)
    values (target_group_id, (select auth.uid()), 'member')
    on conflict (group_id, user_id) do nothing;
    return target_group_id;
end;
$$;

revoke all on function public.create_community_group(text, text) from public;
revoke all on function public.join_community_group(text) from public;
grant execute on function public.create_community_group(text, text) to authenticated;
grant execute on function public.join_community_group(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comunidad-pdf', 'comunidad-pdf', false, 52428800, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members can upload community PDFs" on storage.objects;
create policy "Members can upload community PDFs"
    on storage.objects for insert
    to authenticated
    with check (
        bucket_id = 'comunidad-pdf'
        and (storage.foldername(name))[1] = 'community'
        and (storage.foldername(name))[2] is not null
        and (storage.foldername(name))[3] = (select auth.uid())::text
        and public.is_community_member(((storage.foldername(name))[2])::uuid)
    );

drop policy if exists "Members can read community PDFs" on storage.objects;
create policy "Members can read community PDFs"
    on storage.objects for select
    to authenticated
    using (
        bucket_id = 'comunidad-pdf'
        and (storage.foldername(name))[1] = 'community'
        and public.is_community_member(((storage.foldername(name))[2])::uuid)
    );

drop policy if exists "Uploaders can delete community PDFs" on storage.objects;
create policy "Uploaders can delete community PDFs"
    on storage.objects for delete
    to authenticated
    using (
        bucket_id = 'comunidad-pdf'
        and (storage.foldername(name))[1] = 'community'
        and (storage.foldername(name))[3] = (select auth.uid())::text
        and public.is_community_member(((storage.foldername(name))[2])::uuid)
    );
