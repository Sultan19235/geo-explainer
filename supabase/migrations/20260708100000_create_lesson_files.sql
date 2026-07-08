-- Bulk-uploaded lesson content: topics + their theory/problem files.
-- The teacher authors .js lesson files offline (checked in the previewer),
-- bulk-uploads them in /admin/lessons; the player loads them same-origin via
-- /lesson-files/<item id> and runs them on one shared GeoGebra applet.
--
-- file_id  -> the meta.id slug inside the file: the STABLE content identity.
--             Re-uploading a file with the same id replaces the content but
--             keeps admin-edited metadata (difficulty/tags/order/published),
--             and keeps saved lesson_sets / ?q= links working.

create table if not exists public.lesson_topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  title_kz text not null check (char_length(title_kz) between 1 and 160),
  title_ru text,
  subtitle_kz text,
  subtitle_ru text,
  order_index int not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_items (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.lesson_topics (id) on delete cascade,
  kind text not null check (kind in ('problem', 'theory')),
  file_id text not null check (file_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  number text not null default '',
  title_kz text not null default '',
  title_ru text,
  difficulty text check (difficulty in ('easy', 'med', 'hard')),
  tags_kz text[] not null default '{}',
  tags_ru text[] not null default '{}',
  storage_path text not null,
  order_index int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (topic_id, kind, file_id)
);

create index if not exists lesson_items_topic_idx
  on public.lesson_items (topic_id, kind, order_index);

alter table public.lesson_topics enable row level security;
alter table public.lesson_items enable row level security;

-- Published content is public to read; all writes go through server actions
-- with the service role (which bypasses RLS) after an explicit admin check.
drop policy if exists "published lesson topics are public" on public.lesson_topics;
create policy "published lesson topics are public"
  on public.lesson_topics for select
  using (published = true);

drop policy if exists "published lesson items are public" on public.lesson_items;
create policy "published lesson items are public"
  on public.lesson_items for select
  using (
    published = true
    and exists (
      select 1 from public.lesson_topics t
      where t.id = topic_id and t.published = true
    )
  );
