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
    description text not null default 'Grupo de estudio' check (char_length(description) between 1 and 500),
    is_public boolean not null default false,
    owner_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table public.community_groups
    add column if not exists description text not null default 'Grupo de estudio'
        check (char_length(description) between 1 and 500);
alter table public.community_groups
    add column if not exists is_public boolean not null default false;

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

revoke select on public.community_groups from authenticated;
grant select (id, name, description, is_public) on public.community_groups to authenticated;
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

create or replace function public.is_community_owner(p_group_id uuid)
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
          and role = 'owner'
    );
$$;

revoke all on function public.is_community_owner(uuid) from public;
grant execute on function public.is_community_owner(uuid) to authenticated;

drop policy if exists "Members can view their groups" on public.community_groups;
drop policy if exists "Members can view their groups and public groups" on public.community_groups;
drop policy if exists "Members and everyone can view public groups" on public.community_groups;
create policy "Members can view their groups and public groups"
    on public.community_groups for select
    to authenticated
    using (is_public or public.is_community_member(id));

drop policy if exists "Members can view group membership" on public.community_members;
create policy "Members can view group membership"
    on public.community_members for select
    to authenticated
    using (public.is_community_member(group_id));

drop policy if exists "Owners can view their join codes" on public.community_invites;
create policy "Owners can view their join codes"
    on public.community_invites for select
    to authenticated
    using (public.is_community_owner(group_id));

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

drop function if exists public.create_community_group(text, text);
create or replace function public.create_community_group(
    p_name text,
    p_description text,
    p_is_public boolean,
    p_join_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_group_id uuid;
    clean_name text := trim(p_name);
    clean_description text := trim(p_description);
    clean_code text := upper(trim(p_join_code));
begin
    if auth.uid() is null then
        raise exception 'Inicia sesión para crear una comunidad.';
    end if;
    if clean_name is null or char_length(clean_name) not between 1 and 80 then
        raise exception 'El nombre del grupo debe tener entre 1 y 80 caracteres.';
    end if;
    if clean_description is null or char_length(clean_description) not between 1 and 500 then
        raise exception 'La descripción del grupo debe tener entre 1 y 500 caracteres.';
    end if;
    if p_is_public is null then
        raise exception 'Selecciona si el grupo será público o privado.';
    end if;
    if clean_code is null or clean_code !~ '^[A-Z0-9]{8,20}$' then
        raise exception 'El código de ingreso no tiene un formato válido.';
    end if;

    insert into public.community_groups (name, description, is_public, owner_id)
    values (clean_name, clean_description, p_is_public, (select auth.uid()))
    returning id into new_group_id;

    insert into public.community_members (group_id, user_id, role)
    values (new_group_id, (select auth.uid()), 'owner');
    insert into public.community_invites (group_id, join_code)
    values (new_group_id, clean_code);
    return new_group_id;
end;
$$;

drop function if exists public.join_community_group(text);
create or replace function public.join_community_group(p_join_code text, p_group_id uuid default null)
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
    where join_code = upper(trim(p_join_code))
      and (p_group_id is null or group_id = p_group_id);
    if target_group_id is null then
        raise exception 'El código no existe o ya no está activo.';
    end if;
    insert into public.community_members (group_id, user_id, role)
    values (target_group_id, (select auth.uid()), 'member')
    on conflict (group_id, user_id) do nothing;
    return target_group_id;
end;
$$;

revoke all on function public.create_community_group(text, text, boolean, text) from public;
revoke all on function public.join_community_group(text, uuid) from public;
grant execute on function public.create_community_group(text, text, boolean, text) to authenticated;
grant execute on function public.join_community_group(text, uuid) to authenticated;

create table if not exists public.profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
    display_name text not null check (char_length(display_name) between 1 and 80),
    bio text not null default '' check (char_length(bio) <= 240),
    school text not null default '' check (char_length(school) <= 120),
    avatar_path text,
    updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;

drop policy if exists "Authenticated users can view profiles" on public.profiles;
create policy "Authenticated users can view profiles"
    on public.profiles for select
    to authenticated
    using (true);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
    on public.profiles for insert
    to authenticated
    with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
    on public.profiles for update
    to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    clean_display_name text := trim(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Estudiante'));
    clean_username text := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '[^a-z0-9_]', '', 'g'));
begin
    if char_length(clean_username) not between 3 and 24 then
        clean_username := 'estudiante_' || left(replace(new.id::text, '-', ''), 10);
    end if;
    insert into public.profiles (user_id, username, display_name)
    values (new.id, clean_username, left(coalesce(nullif(clean_display_name, ''), 'Estudiante'), 80))
    on conflict (user_id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
    after insert on auth.users
    for each row execute function public.handle_new_user_profile();

insert into public.profiles (user_id, username, display_name)
select
    account.id,
    'estudiante_' || left(replace(account.id::text, '-', ''), 10),
    left(coalesce(
        nullif(trim(account.raw_user_meta_data ->> 'display_name'), ''),
        nullif(split_part(coalesce(account.email, ''), '@', 1), ''),
        'Estudiante'
    ), 80)
from auth.users as account
on conflict (user_id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload their profile avatar" on storage.objects;
create policy "Users can upload their profile avatar"
    on storage.objects for insert
    to authenticated
    with check (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Users can read their profile avatar for replacement" on storage.objects;
create policy "Users can read their profile avatar for replacement"
    on storage.objects for select
    to authenticated
    using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Users can update their profile avatar" on storage.objects;
create policy "Users can update their profile avatar"
    on storage.objects for update
    to authenticated
    using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Users can delete their profile avatar" on storage.objects;
create policy "Users can delete their profile avatar"
    on storage.objects for delete
    to authenticated
    using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

create table if not exists public.conversations (
    id uuid primary key default gen_random_uuid(),
    title text not null check (char_length(title) between 1 and 80),
    is_group boolean not null default false,
    created_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    joined_at timestamptz not null default now(),
    primary key (conversation_id, user_id)
);

create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    sender_id uuid not null references auth.users(id) on delete cascade,
    content text not null check (char_length(content) between 1 and 4000),
    created_at timestamptz not null default now()
);

create index if not exists conversation_members_user_id_idx on public.conversation_members(user_id, conversation_id);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

grant select on public.conversations, public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.conversation_members
        where conversation_id = p_conversation_id
          and user_id = (select auth.uid())
    );
$$;

revoke all on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

drop policy if exists "Members can read their conversations" on public.conversations;
create policy "Members can read their conversations"
    on public.conversations for select
    to authenticated
    using (public.is_conversation_member(id));

drop policy if exists "Members can read conversation participants" on public.conversation_members;
create policy "Members can read conversation participants"
    on public.conversation_members for select
    to authenticated
    using (public.is_conversation_member(conversation_id));

drop policy if exists "Members can read conversation messages" on public.messages;
create policy "Members can read conversation messages"
    on public.messages for select
    to authenticated
    using (public.is_conversation_member(conversation_id));

drop policy if exists "Members can send conversation messages" on public.messages;
create policy "Members can send conversation messages"
    on public.messages for insert
    to authenticated
    with check (
        sender_id = (select auth.uid())
        and public.is_conversation_member(conversation_id)
    );

create or replace function public.touch_conversation_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.conversations
    set updated_at = now()
    where id = new.conversation_id;
    return new;
end;
$$;

drop trigger if exists on_message_created_update_conversation on public.messages;
create trigger on_message_created_update_conversation
    after insert on public.messages
    for each row execute function public.touch_conversation_updated_at();

create or replace function public.create_conversation(p_participant_ids uuid[], p_title text, p_is_group boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_conversation_id uuid;
    participant_count integer;
    profile_count integer;
    clean_title text := trim(p_title);
begin
    if auth.uid() is null then
        raise exception 'Inicia sesión para crear una conversación.';
    end if;
    if clean_title is null or char_length(clean_title) not between 1 and 80 then
        raise exception 'El nombre debe tener entre 1 y 80 caracteres.';
    end if;

    select count(distinct participants.user_id)
    into participant_count
    from unnest(coalesce(p_participant_ids, '{}'::uuid[])) as participants(user_id)
    where participants.user_id <> (select auth.uid());

    if (p_is_group and participant_count < 2) or (not p_is_group and participant_count <> 1) then
        raise exception 'La cantidad de participantes no es válida.';
    end if;

    select count(distinct profile.user_id)
    into profile_count
    from public.profiles as profile
    where profile.user_id = any(coalesce(p_participant_ids, '{}'::uuid[]))
      and profile.user_id <> (select auth.uid());
    if profile_count <> participant_count then
        raise exception 'Uno o más participantes no tienen un perfil válido.';
    end if;

    if not p_is_group then
        select conversation.id
        into new_conversation_id
        from public.conversations as conversation
        where conversation.is_group = false
          and exists (
              select 1 from public.conversation_members
              where conversation_id = conversation.id
                and user_id = (select auth.uid())
          )
          and exists (
              select 1 from public.conversation_members
              where conversation_id = conversation.id
                and user_id = any(coalesce(p_participant_ids, '{}'::uuid[]))
                and user_id <> (select auth.uid())
          )
          and (
              select count(*)
              from public.conversation_members
              where conversation_id = conversation.id
          ) = 2
        limit 1;
        if new_conversation_id is not null then
            return new_conversation_id;
        end if;
    end if;

    insert into public.conversations (title, is_group, created_by)
    values (clean_title, p_is_group, (select auth.uid()))
    returning id into new_conversation_id;

    insert into public.conversation_members (conversation_id, user_id)
    values (new_conversation_id, (select auth.uid()));

    insert into public.conversation_members (conversation_id, user_id)
    select new_conversation_id, participants.user_id
    from unnest(coalesce(p_participant_ids, '{}'::uuid[])) as participants(user_id)
    where participants.user_id <> (select auth.uid())
    on conflict (conversation_id, user_id) do nothing;

    return new_conversation_id;
end;
$$;

revoke all on function public.create_conversation(uuid[], text, boolean) from public;
grant execute on function public.create_conversation(uuid[], text, boolean) to authenticated;

do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
           select 1 from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public'
             and tablename = 'messages'
       ) then
        alter publication supabase_realtime add table public.messages;
    end if;
end;
$$;

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
