create table if not exists domains (
  id                serial primary key,
  host              text not null unique,
  root_redirect_url text,
  not_found_url     text,
  created_at        timestamptz not null default now()
);

create table if not exists links (
  id              serial primary key,
  domain_id       integer not null references domains(id) on delete restrict,
  slug            text not null,
  destination_url text not null,
  title           text,
  notes           text,
  redirect_code   integer not null default 302 check (redirect_code in (301, 302)),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (domain_id, slug)
);

create table if not exists clicks (
  id         bigserial primary key,
  link_id    integer not null references links(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  referrer   text,
  country    text,
  device     text not null default 'other'
);

create index if not exists clicks_link_time_idx on clicks (link_id, clicked_at);

create table if not exists users (
  id           serial primary key,
  email        text not null,
  github_login text,
  created_at   timestamptz not null default now()
);

create unique index if not exists users_email_idx on users (lower(email));

-- Campaign tracking (UTM). Added to existing databases on startup.
alter table links add column if not exists utm_source   text;
alter table links add column if not exists utm_medium   text;
alter table links add column if not exists utm_campaign text;
alter table links add column if not exists utm_term     text;
alter table links add column if not exists utm_content  text;

create index if not exists links_campaign_idx on links (utm_campaign);

-- QR scan tracking: newly generated QR codes carry a marker, stored here.
alter table clicks add column if not exists via text;

-- Link galleries (link-in-bio pages). A gallery lives at a slug, sharing the slug space with links.
create table if not exists galleries (
  id                serial primary key,
  domain_id         integer not null references domains(id) on delete restrict,
  slug              text not null,
  title             text not null,
  bio               text,
  avatar            text,
  bg_color          text not null default '#f7f5f2',
  text_color        text not null default '#220c10',
  button_color      text not null default '#004ba8',
  button_text_color text not null default '#ffffff',
  button_style      text not null default 'rounded' check (button_style in ('rounded', 'pill', 'square', 'outline')),
  footer            text,
  published         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (domain_id, slug)
);

create table if not exists gallery_items (
  id         serial primary key,
  gallery_id integer not null references galleries(id) on delete cascade,
  position   integer not null default 0,
  kind       text not null check (kind in ('link', 'social', 'image', 'video')),
  label      text,
  url        text,
  image      text,
  network    text,
  hidden     boolean not null default false
);

create index if not exists gallery_items_gallery_idx on gallery_items (gallery_id, position);

-- One row per page view or button click. Deleting a button keeps its history (item_id becomes null).
create table if not exists gallery_events (
  id          bigserial primary key,
  gallery_id  integer not null references galleries(id) on delete cascade,
  item_id     integer references gallery_items(id) on delete set null,
  kind        text not null default 'view' check (kind in ('view', 'click')),
  occurred_at timestamptz not null default now(),
  referrer    text,
  country     text,
  device      text not null default 'other',
  via         text
);

create index if not exists gallery_events_gallery_idx on gallery_events (gallery_id, occurred_at);

-- Counts password sign-in attempts per client and overall, in a fixed window (see ratelimit.ts).
create table if not exists login_attempts (
  key          text primary key,
  attempts     integer not null default 0,
  window_start timestamptz not null default now()
);

-- Brand icon fetched from each domain's website, shown beside the domain in the admin.
alter table domains add column if not exists favicon_data       bytea;
alter table domains add column if not exists favicon_type       text;
alter table domains add column if not exists favicon_checked_at timestamptz;

-- When a domain first answered as live. Domains that have not yet are listed first in the admin.
-- Domains that already existed when this column was added count as live.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'domains' and column_name = 'went_live_at') then
    alter table domains add column went_live_at timestamptz;
    update domains set went_live_at = now();
  end if;
end $$;

-- QR code colours: a default per domain, and an optional override on a single link or gallery.
alter table domains   add column if not exists qr_dark  text;
alter table domains   add column if not exists qr_light text;
alter table links     add column if not exists qr_dark  text;
alter table links     add column if not exists qr_light text;
alter table galleries add column if not exists qr_dark  text;
alter table galleries add column if not exists qr_light text;
