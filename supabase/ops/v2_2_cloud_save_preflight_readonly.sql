-- =====================================================================================================
-- PREFLIGHT (SALT OKUMA) — Fenomen v2.2 bulut kayıt migration'ından ÖNCE. Yalnız SELECT (DDL/DML/SET yok).
-- Uygulamayı yapacak rolle (postgres), Fenomen'in kendi DB'sinde:
--   PGOPTIONS='-c default_transaction_read_only=on' psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/ops/v2_2_cloud_save_preflight_readonly.sql
-- Yanlış hedefte (kodhane_saves / acik_ofis_saves varsa) sorgu 2 bilerek HATA verir:
--   ERROR: invalid input syntax for type integer: "WRONG TARGET: ..."  -> DURUN, hiçbir şey uygulamayın.
-- Dinamik sayımlar query_to_xml ile (yine yalnız SELECT); nesne yoksa NULL döner, hata vermez.
-- SQL ile GÖRÜLEMEYEN GoTrue/SMTP ayarları: supabase/ops/auth-settings.md (Dokploy env'de kontrol edilir).
-- =====================================================================================================

-- 1. Kimlik: neredeyim?
select current_database() as database, current_user as current_user, session_user as session_user,
       inet_server_port() as server_port, split_part(version(), ' on ', 1) as server_version,
       current_setting('transaction_read_only') as read_only_session;

-- 2. WRONG TARGET: Kodhane / Açık Ofis tabloları BU DB'de OLMAMALI (hangi şemada olursa olsun)
select case when k.n > 0
            then cast('WRONG TARGET: Kodhane/Açık Ofis tables present in this database: ' || k.list as integer)::text
            else 'OK: no kodhane_saves / acik_ofis_saves in ' || current_database() end as target_check
  from (select count(*) as n, string_agg(n.nspname || '.' || c.relname, ', ') as list
          from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where c.relname in ('kodhane_saves', 'acik_ofis_saves')) k;

-- 3. Mevcut public şeması: tablolar/görünümler ve fonksiyonlar (taze Fenomen DB'sinde yalnız sayaç nesneleri beklenir)
select 'relation' as kind, c.relname as name, c.relkind::text as detail, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls
  from pg_catalog.pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
union all
select 'function', p.oid::regprocedure::text, case when p.prosecdef then 'security definer' else 'invoker' end, null, null
  from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace
   and not exists (select 1 from pg_catalog.pg_depend d where d.classid = 'pg_catalog.pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
 order by 1, 2;

-- 4. Çakışan adlar (migration ÖNCESİ beklenen: 0 satır; sonrası: bu özelliğin kendi nesneleri)
select 'relation' as kind, n.nspname || '.' || c.relname as name
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
 where c.relname like 'fenomen\_%' and n.nspname not in ('pg_catalog', 'information_schema')
union all
select 'function', p.oid::regprocedure::text from pg_catalog.pg_proc p
 where (p.proname like 'fenomen\_%' or p.proname like '\_fenomen\_%') and p.pronamespace <> 'pg_catalog'::regnamespace
union all
select 'schema', n.nspname from pg_catalog.pg_namespace n where n.nspname = 'fenomen_private'
union all
select 'policy', schemaname || '.' || tablename || ': ' || policyname from pg_catalog.pg_policies where policyname like 'fenomen\_%'
union all
select 'trigger', t.tgrelid::regclass::text || ': ' || t.tgname from pg_catalog.pg_trigger t where t.tgname like 'fenomen\_%' and not t.tgisinternal
union all
select 'cron job', x.jobname from (
  select unnest(xpath('/row/j/text()', query_to_xml(
           'select jobname as j from cron.job where jobname in (''fenomen_save_backups_cleanup'', ''fenomen_inactive_accounts_purge'', ''fenomen_deletion_log_cleanup'')', false, false, '')))::text as jobname
   where to_regclass('cron.job') is not null) x
 order by 1, 2;

-- 5. auth şeması (GoTrue) — varlık, kullanıcı sayısı, cascade FK'ler, postgres'in auth.users üzerindeki yetkisi
select to_regnamespace('auth') is not null                                          as auth_schema_exists,
       to_regclass('auth.users') is not null                                        as auth_users_exists,
       pg_catalog.pg_get_userbyid((select relowner from pg_catalog.pg_class where oid = to_regclass('auth.users'))) as auth_users_owner,
       case when to_regclass('auth.users') is not null and has_table_privilege(to_regclass('auth.users'), 'SELECT')
            then (xpath('/row/n/text()', query_to_xml('select count(*) as n from auth.users', false, false, '')))[1]::text::bigint end as auth_users_count,
       case when to_regclass('auth.users') is not null then has_table_privilege('postgres', to_regclass('auth.users'), 'DELETE') end as postgres_can_delete_auth_users,
       case when to_regclass('auth.audit_log_entries') is not null then has_table_privilege('postgres', to_regclass('auth.audit_log_entries'), 'DELETE') end
                                                                                  as postgres_can_delete_audit_log,   -- t gerekli (migration kontrol eder)
       case when to_regclass('auth.refresh_tokens') is not null and to_regclass('auth.flow_state') is not null
            then has_table_privilege('postgres', to_regclass('auth.refresh_tokens'), 'DELETE') and has_table_privilege('postgres', to_regclass('auth.flow_state'), 'DELETE') end
                                                                                  as postgres_can_delete_rt_flow,     -- t gerekli (migration kontrol eder)
       (select rolbypassrls from pg_catalog.pg_roles where rolname = 'postgres')    as postgres_bypassrls,      -- t gerekli (migration kontrol eder)
       has_database_privilege('postgres', current_database(), 'CREATE')            as postgres_can_create_schema,  -- t gerekli (silme listesi şeması fenomen_private)
       (select string_agg(tablename, ',' order by tablename) from pg_catalog.pg_tables where schemaname = 'auth') as auth_tables;
select c.conrelid::regclass as referencing_table, c.conname, c.confdeltype = 'c' as on_delete_cascade
  from pg_catalog.pg_constraint c
 where c.contype = 'f' and c.confrelid = to_regclass('auth.users')
 order by 1::text;

-- 6. Auth ayar tabloları (erişilebiliyorsa). GoTrue ayarları env'dedir; burada yalnız şema sürümü görünür.
select case when to_regclass('auth.schema_migrations') is not null
            then (xpath('/row/v/text()', query_to_xml('select max(version) as v from auth.schema_migrations', false, false, '')))[1]::text end as gotrue_schema_version,
       case when to_regclass('auth.instances') is not null
            then (xpath('/row/n/text()', query_to_xml('select count(*) as n from auth.instances', false, false, '')))[1]::text::int end as auth_instances_rows;

-- 7. pg_cron: kurulabilir mi / kurulu mu / ayarlar (UTC: '47 0 * * *' = 03:47 TSİ)
select (select default_version   from pg_catalog.pg_available_extensions where name = 'pg_cron') as pg_cron_available_version,
       (select installed_version from pg_catalog.pg_available_extensions where name = 'pg_cron') as pg_cron_installed_version,
       (select setting from pg_catalog.pg_settings where name = 'shared_preload_libraries')        as shared_preload_libraries,
       (select setting from pg_catalog.pg_settings where name = 'cron.database_name')             as cron_database_name,
       (select setting from pg_catalog.pg_settings where name = 'cron.timezone')                  as cron_timezone;

-- 8. Sayaç (anon_stats_*) — bilgi: var mı, satır sayısı. Migration bunlara dokunmaz (verify 12 bağımsızlığı kontrol eder).
select to_regclass('public.anon_stats_events') is not null as anon_stats_events_exists,
       case when to_regclass('public.anon_stats_events') is not null and has_table_privilege(to_regclass('public.anon_stats_events'), 'SELECT')
            then (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.anon_stats_events', false, false, '')))[1]::text::bigint end as anon_stats_rows;

-- 9. Durum özeti
select case when to_regclass('public.fenomen_saves') is null and to_regclass('public.fenomen_save_backups') is null
            then 'v2.2 cloud save: not applied (expected before the migration)'
            else 'v2.2 cloud save: ALREADY PRESENT (re-run is idempotent; check section 4)' end as v22_state;
