-- =====================================================================================================
-- Fenomen: Kiralık Hayat v2.2 — bulut kayıt (girişli)  (TASLAK — hiçbir canlı DB'ye UYGULANMADI)
-- HEDEF: YALNIZ Fenomen'in kendi Supabase'i (Dokploy `fenomen` → fenomen-api.teserix.com).
--        Kodhane / ortak instance (supabase.teserix.com, kodhane-api.teserix.com) DEĞİL: kodhane_saves ya da
--        acik_ofis_saves görünürse bu dosya hiçbir şey yapmadan hata verir. Önce ops/v2_2_cloud_save_preflight_readonly.sql.
--
-- Ne kurar:
--   1. public.fenomen_saves          — kullanıcı başına tek satır (PK user_id → auth.users, on delete cascade).
--      data jsonb (nesne, en fazla 262144 bayt metin), save_version, revision (iyimser kilit, her yazışta +1),
--      device ('mobil'|'masaustu'|null), created_at/updated_at (sunucu yazar).
--   2. public.fenomen_save_backups   — "Baştan başla" yedekleri. 30 gün, kullanıcı başına en fazla 5.
--   3. RPC (authenticated): fenomen_reset_save, fenomen_list_save_backups, fenomen_delete_my_account.
--      RPC (yalnız service_role/postgres): fenomen_cleanup_save_backups, fenomen_purge_inactive_accounts,
--      fenomen_admin_restore_save_backup.
--      İç (kimseye EXECUTE yok): _fenomen_delete_user(uid) (Hesabımı sil + 24 ay temizliği aynı yol),
--      _fenomen_trim_backups, _fenomen_inactive_cutoff, _fenomen_save_summary, fenomen_saves_before_write.
--   4. Ayarlar TEK yerde, sabit fonksiyonlar: fenomen_cfg_inactive_interval() = 24 ay,
--      fenomen_cfg_backup_retention() = 30 gün, fenomen_cfg_backup_max_per_user() = 5,
--      fenomen_cfg_purge_batch_max() = 100. Değiştirmek = bu fonksiyonu yeniden tanımlamak (migration).
--   5. RLS açık + FORCE. authenticated: fenomen_saves'te yalnız kendi satırı (select/insert/update, kolon bazlı).
--      anon: hiçbir yetki yok. İstemcinin DELETE yetkisi/policy'si yok ("Baştan başla" = RPC).
--      fenomen_save_backups: istemci rollerine hiçbir yetki yok (liste RPC ile).
--
-- Bilerek YAPMADIKLARI: pg_cron kurmaz/zamanlamaz, temizliği/24 ay silmesini ÇALIŞTIRMAZ (ayrı onay adımları:
-- ops/v2_2_backup_cleanup_pg_cron.sql, ops/v2_2_inactive_purge_pg_cron.sql, ops/v2_2_schedule_dokploy.md).
-- Sayaç (anon_stats_*) ve Umami ile hiçbir bağ yok: FK, trigger, join, ortak fonksiyon yok.
--
-- Kurallar: tek transaction (BEGIN/COMMIT dosyada), idempotent (iki kez çalıştırılabilir, veri korunur),
-- nesne sahibi postgres, search_path = '', Supabase default privileges'a karşı açık REVOKE, notify pgrst.
-- Çalıştırma:  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/migrations/20260929193000_v2_2_fenomen_cloud_save.sql
-- Rollback:    supabase/rollback/20260929193000_v2_2_fenomen_cloud_save.rollback.sql  (VERİYİ SİLER)
-- =====================================================================================================
begin;
set local role postgres;

-- ---------------------------------------------------------------- 0. koruma
do $pre$
declare extra text;
begin
  if exists (select 1 from pg_catalog.pg_class where relname in ('kodhane_saves', 'acik_ofis_saves')) then
    raise exception 'WRONG TARGET: kodhane_saves/acik_ofis_saves present in database %; this file is for Fenomen''s own Supabase only', current_database();
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'auth.users is missing: not a Supabase database';
  end if;
  if to_regclass('auth.audit_log_entries') is null then
    raise exception 'auth.audit_log_entries is missing: _fenomen_delete_user deletes the user''s GoTrue audit rows';
  end if;
  if not has_table_privilege('postgres', 'auth.audit_log_entries', 'DELETE') then
    raise exception 'role postgres cannot DELETE auth.audit_log_entries: account deletion would fail';
  end if;
  if not (select r.rolbypassrls from pg_catalog.pg_roles r where r.rolname = 'postgres') then
    raise exception 'role postgres has no BYPASSRLS: the security definer functions would not see rows under FORCE RLS';
  end if;
  if to_regclass('public.fenomen_saves') is not null then
    select string_agg(attname, ', ' order by attname) into extra from pg_catalog.pg_attribute
     where attrelid = 'public.fenomen_saves'::regclass and attnum > 0 and not attisdropped
       and attname not in ('user_id', 'data', 'save_version', 'revision', 'device', 'created_at', 'updated_at');
    if extra is not null then raise exception 'public.fenomen_saves exists with unexpected columns: %', extra; end if;
  end if;
  if to_regclass('public.fenomen_save_backups') is not null then
    select string_agg(attname, ', ' order by attname) into extra from pg_catalog.pg_attribute
     where attrelid = 'public.fenomen_save_backups'::regclass and attnum > 0 and not attisdropped
       and attname not in ('id', 'user_id', 'revision', 'save_version', 'device', 'data', 'reason', 'save_updated_at', 'created_at');
    if extra is not null then raise exception 'public.fenomen_save_backups exists with unexpected columns: %', extra; end if;
  end if;
end $pre$;

-- ---------------------------------------------------------------- 1. ayarlar (tek yer)
create or replace function public.fenomen_cfg_inactive_interval()
returns interval language sql immutable parallel safe set search_path = ''
as $$ select interval '24 months' $$;
comment on function public.fenomen_cfg_inactive_interval() is
  'Fenomen v2.2: bu süredir giriş yapmayan hesap (coalesce(last_sign_in_at, created_at)) fenomen_purge_inactive_accounts() ile silinir. TEK kaynak.';

create or replace function public.fenomen_cfg_backup_retention()
returns interval language sql immutable parallel safe set search_path = ''
as $$ select interval '30 days' $$;
comment on function public.fenomen_cfg_backup_retention() is 'Fenomen v2.2: "Baştan başla" yedeklerinin saklama süresi. TEK kaynak.';

create or replace function public.fenomen_cfg_backup_max_per_user()
returns integer language sql immutable parallel safe set search_path = ''
as $$ select 5 $$;
comment on function public.fenomen_cfg_backup_max_per_user() is 'Fenomen v2.2: kullanıcı başına en fazla yedek (en eskiler silinir). TEK kaynak.';

create or replace function public.fenomen_cfg_purge_batch_max()
returns integer language sql immutable parallel safe set search_path = ''
as $$ select 100 $$;
comment on function public.fenomen_cfg_purge_batch_max() is 'Fenomen v2.2: fenomen_purge_inactive_accounts() tek çalıştırmada en fazla bu kadar hesap siler. TEK kaynak.';

-- ---------------------------------------------------------------- 2. tablolar
create table if not exists public.fenomen_saves (
  user_id      uuid        primary key references auth.users (id) on delete cascade,
  data         jsonb       not null,
  save_version integer     not null default 1,
  revision     bigint      not null default 1,
  device       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint fenomen_saves_data_object  check (jsonb_typeof(data) = 'object'),
  constraint fenomen_saves_data_size    check (octet_length(data::text) <= 262144),   -- 256 KiB (jsonb metni)
  constraint fenomen_saves_save_version check (save_version between 1 and 1000000),
  constraint fenomen_saves_revision_pos check (revision >= 1),
  constraint fenomen_saves_device_chk   check (device is null or device in ('mobil', 'masaustu'))
);
comment on table public.fenomen_saves is
  'Fenomen v2.2 bulut kayıt: kullanıcı başına tek satır. RLS: yalnız sahibi okur/yazar; istemci silemez. Sayaç (anon_stats_*) ile bağı yok.';
comment on column public.fenomen_saves.revision is
  'İyimser kilit. INSERT: istemcinin gönderdiği (yoksa 1). UPDATE: yalnız revision = sunucu revision + 1 kabul; aksi PT409 stale_revision (HTTP 409).';
comment on column public.fenomen_saves.updated_at is 'Sunucu yazar (trigger); istemci yazamaz.';

create table if not exists public.fenomen_save_backups (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  revision        bigint      not null,
  save_version    integer     not null,
  device          text,
  data            jsonb       not null,
  reason          text        not null default 'reset',
  save_updated_at timestamptz,
  created_at      timestamptz not null default now(),
  constraint fenomen_save_backups_reason_chk check (reason in ('reset', 'restore')),
  constraint fenomen_save_backups_data_size  check (octet_length(data::text) <= 262144)
);
comment on table public.fenomen_save_backups is
  'Fenomen v2.2 "Baştan başla" yedekleri (30 gün, kullanıcı başına en fazla 5). İstemci rollerine yetki yok; liste fenomen_list_save_backups().';
create index if not exists fenomen_save_backups_user_created_idx on public.fenomen_save_backups (user_id, created_at desc);
create index if not exists fenomen_save_backups_created_idx on public.fenomen_save_backups (created_at);

-- ---------------------------------------------------------------- 3. yazma trigger'ı (sunucu alanları + revision)
create or replace function public.fenomen_saves_before_write()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision   := coalesce(new.revision, 1);
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  new.user_id    := old.user_id;
  new.created_at := old.created_at;
  if new.revision is distinct from old.revision + 1 then
    raise exception using errcode = 'PT409', message = 'stale_revision',
      detail = format('sent revision %s, server revision %s', new.revision, old.revision),
      hint = 'Pull the save again, then write with revision = server revision + 1.';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists fenomen_saves_before_write on public.fenomen_saves;
create trigger fenomen_saves_before_write before insert or update on public.fenomen_saves
  for each row execute function public.fenomen_saves_before_write();

-- ---------------------------------------------------------------- 4. RLS + yetkiler
alter table public.fenomen_saves enable row level security;
alter table public.fenomen_saves force row level security;
alter table public.fenomen_save_backups enable row level security;
alter table public.fenomen_save_backups force row level security;

-- Supabase "alter default privileges" yeni tabloları anon/authenticated/service_role'e ALL ile açar: önce hepsini geri al.
revoke all on table public.fenomen_saves        from public, anon, authenticated, service_role;
revoke all on table public.fenomen_save_backups from public, anon, authenticated, service_role;
grant select on table public.fenomen_saves to authenticated;
grant insert (user_id, data, save_version, revision, device) on table public.fenomen_saves to authenticated;
grant update (user_id, data, save_version, revision, device) on table public.fenomen_saves to authenticated;  -- user_id: PostgREST upsert
grant select on table public.fenomen_saves        to service_role;   -- destek/okuma; yazma yalnız fonksiyonlarla
grant select on table public.fenomen_save_backups to service_role;

drop policy if exists "fenomen_saves_select_own" on public.fenomen_saves;
drop policy if exists "fenomen_saves_insert_own" on public.fenomen_saves;
drop policy if exists "fenomen_saves_update_own" on public.fenomen_saves;
drop policy if exists "fenomen_saves_delete_own" on public.fenomen_saves;
create policy "fenomen_saves_select_own" on public.fenomen_saves
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "fenomen_saves_insert_own" on public.fenomen_saves
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "fenomen_saves_update_own" on public.fenomen_saves
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- fenomen_save_backups: bilerek policy yok (istemci rollerinde yetki de yok). postgres BYPASSRLS (koruma bloğu kontrol eder).

-- ---------------------------------------------------------------- 5. iç yardımcılar
create or replace function public._fenomen_inactive_cutoff()
returns timestamptz language sql stable set search_path = ''
as $$ select now() - public.fenomen_cfg_inactive_interval() $$;

-- liste için güvenli özet (yalnız sayısal alanlar; src/logic/save.js alan adları)
create or replace function public._fenomen_save_summary(d jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'followers',   case when jsonb_typeof(d -> 'followers') = 'number' then d -> 'followers' end,
    'money',       case when jsonb_typeof(d -> 'money') = 'number' then d -> 'money' end,
    'fame',        case when jsonb_typeof(d #> '{meta,fame}') = 'number' then d #> '{meta,fame}' end,
    'fameEarned',  case when jsonb_typeof(d #> '{meta,fameEarned}') = 'number' then d #> '{meta,fameEarned}' end,
    'sales',       case when jsonb_typeof(d #> '{meta,sales}') = 'number' then d #> '{meta,sales}' end,
    'playSec',     case when jsonb_typeof(d #> '{meta,playSec}') = 'number' then d #> '{meta,playSec}' end,
    'lastSeen',    case when jsonb_typeof(d -> 'lastSeen') = 'number' then d -> 'lastSeen' end))
$$;

-- süresi dolan + üst sınırı aşan yedekleri siler (tek kullanıcı)
create or replace function public._fenomen_trim_backups(p_uid uuid)
returns void language plpgsql volatile set search_path = ''
as $$
begin
  delete from public.fenomen_save_backups b
   where b.user_id = p_uid and b.created_at <= now() - public.fenomen_cfg_backup_retention();
  delete from public.fenomen_save_backups b
   where b.id in (select x.id from public.fenomen_save_backups x where x.user_id = p_uid
                   order by x.created_at desc, x.id desc offset public.fenomen_cfg_backup_max_per_user());
end $$;

-- ORTAK SİLME YOLU: "Hesabımı sil" (auth.uid()) ve 24 ay temizliği bunu çağırır. Kimseye EXECUTE yok (yalnız sahibi postgres).
-- security definer DEĞİL: yalnız postgres sahipli definer fonksiyonların içinden çalışır.
-- GoTrue denetim kayıtları (auth.audit_log_entries; FK yok, cascade ile gitmez): payload json içinde
--   actor_id = kullanıcı (kendi girişi, yenileme, çıkış…) VEYA traits.user_id = kullanıcı (ör. admin işlemi o kullanıcı hakkında).
--   Yalnız bu iki eşleşme; başka kullanıcıların kayıtlarına dokunulmaz. (GoTrue v2.189.0 internal/models/audit_log_entry.go)
-- Dönüş tipi değişti (audit_entries): create or replace yetmez, önce drop (iç fonksiyon; bağımlılık yok, yetkiler §8'de yeniden).
drop function if exists public._fenomen_delete_user(uuid);
create function public._fenomen_delete_user(p_uid uuid)
returns table (accounts integer, saves integer, backups integer, audit_entries integer)
language plpgsql volatile set search_path = ''
as $$
declare n_u integer; n_s integer; n_b integer; n_a integer;
begin
  if p_uid is null then
    raise exception using errcode = '22004', message = 'user_id_required';
  end if;
  delete from auth.audit_log_entries a
   where lower(a.payload ->> 'actor_id') = p_uid::text
      or lower(a.payload -> 'traits' ->> 'user_id') = p_uid::text;
  get diagnostics n_a = row_count;
  delete from public.fenomen_save_backups b where b.user_id = p_uid;
  get diagnostics n_b = row_count;
  delete from public.fenomen_saves s where s.user_id = p_uid;
  get diagnostics n_s = row_count;
  -- auth.identities, auth.sessions (+ refresh_tokens), mfa_factors, one_time_tokens: FK on delete cascade (GoTrue şeması)
  delete from auth.users u where u.id = p_uid;
  get diagnostics n_u = row_count;
  return query select n_u, n_s, n_b, n_a;
end $$;

-- ---------------------------------------------------------------- 6. istemci RPC'leri (authenticated)
-- "Baştan başla": mevcut kaydı yedekler, p_data (istemcinin yeni oyun durumu) ile değiştirir, revision + 1.
-- p_expected_revision verilirse ve sunucudakiyle eşleşmezse PT409 stale_revision (başka cihaz ilerletmiş).
create or replace function public.fenomen_reset_save(p_data jsonb, p_save_version integer default 1,
                                                     p_expected_revision bigint default null, p_device text default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s record; v_bid uuid := null; v_rev bigint; v_upd timestamptz;
begin
  if uid is null then raise exception using errcode = '42501', message = 'not_authenticated'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_data', hint = 'p_data must be a JSON object (the new game state).';
  end if;
  select x.revision, x.save_version, x.device, x.data, x.updated_at into s
    from public.fenomen_saves x where x.user_id = uid for update;
  if not found then
    if p_expected_revision is not null and p_expected_revision <> 0 then
      raise exception using errcode = 'PT409', message = 'stale_revision',
        detail = format('expected revision %s, no cloud save', p_expected_revision);
    end if;
    insert into public.fenomen_saves (user_id, data, save_version, revision, device)
    values (uid, p_data, coalesce(p_save_version, 1), 1, p_device)
    returning revision, updated_at into v_rev, v_upd;
    return jsonb_build_object('revision', v_rev, 'backup_id', null, 'updated_at', v_upd);
  end if;
  if p_expected_revision is not null and p_expected_revision <> s.revision then
    raise exception using errcode = 'PT409', message = 'stale_revision',
      detail = format('expected revision %s, server revision %s', p_expected_revision, s.revision),
      hint = 'Pull the save; the other device''s progress would be reset.';
  end if;
  insert into public.fenomen_save_backups (user_id, revision, save_version, device, data, reason, save_updated_at)
  values (uid, s.revision, s.save_version, s.device, s.data, 'reset', s.updated_at)
  returning id into v_bid;
  update public.fenomen_saves x
     set data = p_data, save_version = coalesce(p_save_version, 1), device = coalesce(p_device, s.device), revision = s.revision + 1
   where x.user_id = uid
  returning x.revision, x.updated_at into v_rev, v_upd;
  perform public._fenomen_trim_backups(uid);
  return jsonb_build_object('revision', v_rev, 'backup_id', v_bid, 'updated_at', v_upd);
end $$;

-- çağıranın süresi dolmamış yedekleri (yeniden eskiye). data döndürmez; özet döndürür.
drop function if exists public.fenomen_list_save_backups();
create function public.fenomen_list_save_backups()
returns table (id uuid, revision bigint, save_version integer, device text, reason text, created_at timestamptz,
               expires_at timestamptz, size_bytes integer, summary jsonb)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.revision, b.save_version, b.device, b.reason, b.created_at,
         b.created_at + public.fenomen_cfg_backup_retention(), octet_length(b.data::text), public._fenomen_save_summary(b.data)
    from public.fenomen_save_backups b
   where b.user_id = (select auth.uid()) and b.created_at > now() - public.fenomen_cfg_backup_retention()
   order by b.created_at desc, b.id desc
$$;

-- "Hesabımı sil": parametre YOK; yalnız auth.uid(). Kayıt + yedekler + GoTrue denetim kayıtları + auth.users satırı (identities/sessions cascade).
create or replace function public.fenomen_delete_my_account()
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare uid uuid := auth.uid(); r record;
begin
  if uid is null then raise exception using errcode = '42501', message = 'not_authenticated'; end if;
  select * into r from public._fenomen_delete_user(uid);
  return jsonb_build_object('deleted', r.accounts = 1, 'saves', r.saves, 'backups', r.backups, 'audit_entries', r.audit_entries);
end $$;

-- ---------------------------------------------------------------- 7. yönetim fonksiyonları (yalnız service_role / postgres)
-- 30 günden eski yedekleri siler; silinen satır sayısını döndürür.
create or replace function public.fenomen_cleanup_save_backups()
returns integer language plpgsql volatile security definer set search_path = ''
as $$
declare n integer;
begin
  delete from public.fenomen_save_backups b where b.created_at <= now() - public.fenomen_cfg_backup_retention();
  get diagnostics n = row_count;
  return n;
end $$;

-- 24 ay hareketsiz hesap temizliği. Ölçüt: coalesce(last_sign_in_at, created_at) < now() - fenomen_cfg_inactive_interval().
-- Tek çalıştırmada en fazla fenomen_cfg_purge_batch_max() hesap (p_limit daha küçükse o kadar). En eski hareketsizler önce.
-- Döner: silinen hesap / kayıt / yedek / denetim kaydı sayısı + kalan aday sayısı. Silme: _fenomen_delete_user (Hesabımı sil ile aynı yol).
-- Dönüş tipi değişti (audit_entries): önce drop; EXECUTE yetkileri §8'de yeniden verilir.
drop function if exists public.fenomen_purge_inactive_accounts(integer);
create function public.fenomen_purge_inactive_accounts(p_limit integer default null)
returns table (accounts integer, saves integer, backups integer, audit_entries integer, remaining integer)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  lim integer := least(public.fenomen_cfg_purge_batch_max(), greatest(1, coalesce(p_limit, public.fenomen_cfg_purge_batch_max())));
  cutoff timestamptz := public._fenomen_inactive_cutoff();
  r record; d record; a integer := 0; s integer := 0; b integer := 0; au integer := 0; rem integer;
begin
  for r in
    select u.id from auth.users u
     where coalesce(u.last_sign_in_at, u.created_at) < cutoff
     order by coalesce(u.last_sign_in_at, u.created_at), u.id
     limit lim
       for update of u skip locked
  loop
    select * into d from public._fenomen_delete_user(r.id);
    a := a + d.accounts; s := s + d.saves; b := b + d.backups; au := au + d.audit_entries;
  end loop;
  select count(*) into rem from auth.users u where coalesce(u.last_sign_in_at, u.created_at) < cutoff;
  return query select a, s, b, au, rem;
end $$;

-- destek: bir yedeği geri yükler (istemci sözleşmesinde YOK; kapsam "geri alma"yı dışarıda bırakıyor).
-- Mevcut kayıt önce 'restore' nedeniyle yedeklenir; revision + 1 (eski cihazlar 409 alır).
create or replace function public.fenomen_admin_restore_save_backup(p_backup_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare bk record; s record; v_bid uuid := null; v_rev bigint;
begin
  select x.* into bk from public.fenomen_save_backups x
   where x.id = p_backup_id and x.created_at > now() - public.fenomen_cfg_backup_retention();
  if not found then raise exception using errcode = 'PT404', message = 'backup_not_found'; end if;
  select x.revision, x.save_version, x.device, x.data, x.updated_at into s
    from public.fenomen_saves x where x.user_id = bk.user_id for update;
  if found then
    insert into public.fenomen_save_backups (user_id, revision, save_version, device, data, reason, save_updated_at)
    values (bk.user_id, s.revision, s.save_version, s.device, s.data, 'restore', s.updated_at) returning id into v_bid;
    update public.fenomen_saves x set data = bk.data, save_version = bk.save_version, device = bk.device, revision = s.revision + 1
     where x.user_id = bk.user_id returning x.revision into v_rev;
  else
    insert into public.fenomen_saves (user_id, data, save_version, revision, device)
    values (bk.user_id, bk.data, bk.save_version, bk.revision + 1, bk.device) returning revision into v_rev;
  end if;
  perform public._fenomen_trim_backups(bk.user_id);
  return jsonb_build_object('revision', v_rev, 'backup_id', v_bid, 'restored_from', bk.id);
end $$;

-- ---------------------------------------------------------------- 8. fonksiyon yetkileri (default privileges'a karşı açık REVOKE)
do $acl$
declare f text;
begin
  foreach f in array array[
    'public.fenomen_cfg_inactive_interval()', 'public.fenomen_cfg_backup_retention()',
    'public.fenomen_cfg_backup_max_per_user()', 'public.fenomen_cfg_purge_batch_max()',
    'public._fenomen_inactive_cutoff()', 'public._fenomen_save_summary(jsonb)', 'public._fenomen_trim_backups(uuid)',
    'public._fenomen_delete_user(uuid)', 'public.fenomen_saves_before_write()',
    'public.fenomen_reset_save(jsonb,integer,bigint,text)', 'public.fenomen_list_save_backups()',
    'public.fenomen_delete_my_account()', 'public.fenomen_cleanup_save_backups()',
    'public.fenomen_purge_inactive_accounts(integer)', 'public.fenomen_admin_restore_save_backup(uuid)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
  end loop;
end $acl$;
grant execute on function public.fenomen_reset_save(jsonb, integer, bigint, text) to authenticated;
grant execute on function public.fenomen_list_save_backups()                     to authenticated;
grant execute on function public.fenomen_delete_my_account()                     to authenticated;
grant execute on function public.fenomen_cleanup_save_backups()                  to service_role;
grant execute on function public.fenomen_purge_inactive_accounts(integer)        to service_role;
grant execute on function public.fenomen_admin_restore_save_backup(uuid)         to service_role;
-- ayarlar: sayım sorgusu / destek service_role ile de okuyabilsin (salt değer, veri yok)
grant execute on function public.fenomen_cfg_inactive_interval()   to service_role;
grant execute on function public.fenomen_cfg_backup_retention()    to service_role;
grant execute on function public.fenomen_cfg_backup_max_per_user() to service_role;
grant execute on function public.fenomen_cfg_purge_batch_max()     to service_role;
grant execute on function public._fenomen_inactive_cutoff()        to service_role;

-- ---------------------------------------------------------------- 9. zamanlama: BURADA YOK (ayrı onay)
-- Bu dosya pg_cron'a dokunmaz ve hiçbir temizliği çalıştırmaz. Bkz. docs/v2.2-bulut-kayit-runbook.md.

commit;
notify pgrst, 'reload schema';
