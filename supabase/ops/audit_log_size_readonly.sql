-- =====================================================================================================
-- SALT OKUMA: auth.audit_log_entries boyutu ve tek kullanıcı silme süresi tahmini (Fenomen v2.2 push öncesi).
-- Yazma yok: tüm sorgular "begin transaction read only" içinde çalışır ve sonda rollback yapılır. DDL, DML ve SET yok.
-- Fenomen DB'sinde, postgres rolüyle (runbook §5.5):
--   PGOPTIONS='-c default_transaction_read_only=on' $PSQL -X -v ON_ERROR_STOP=1 -f supabase/ops/audit_log_size_readonly.sql
-- Kişisel veri dönmez: yalnız sayı, boyut, tarih ve rol ayarı.
-- Tahmin: _fenomen_delete_user, payload üzerinde tabloyu baştan sona tarar (indeks yok, eklenemez: tablo sahibi
-- supabase_auth_admin). Bu yüzden §4'teki taramanın süresi, tek kullanıcı silmenin denetim kaydı kısmının süresine yakındır.
-- 24 ay temizliğinin bir çalıştırması (en fazla 100 hesap) ≈ 100 × bu süre.
-- =====================================================================================================
begin transaction read only;

-- 1. Hedef ve oturum
select current_database() as database, current_user as current_user, inet_server_port() as server_port,
       split_part(version(), ' on ', 1) as server_version, current_setting('transaction_read_only') as read_only;

-- 2. Satır sayısı ve boyut
select count(*)                                                        as audit_rows,
       pg_total_relation_size('auth.audit_log_entries')                as total_bytes,
       pg_size_pretty(pg_total_relation_size('auth.audit_log_entries')) as total_pretty,
       pg_size_pretty(pg_relation_size('auth.audit_log_entries'))       as heap_pretty,
       min(created_at)                                                 as oldest_utc,
       max(created_at)                                                 as newest_utc,
       (select reltuples::bigint from pg_class where oid = 'auth.audit_log_entries'::regclass) as planner_estimate
  from auth.audit_log_entries;

-- 3. Zaman aşımı sınırları: "Hesabımı sil" authenticated rolüyle PostgREST üzerinden çalışır. Rol ayarı varsa (statement_timeout)
-- silme süresi bu sınırın altında kalmalı.
select rolname, coalesce(array_to_string(rolconfig, ', '), '(rol ayarı yok)') as role_settings
  from pg_roles where rolname in ('authenticated', 'anon', 'service_role', 'authenticator', 'postgres') order by rolname;
select current_setting('statement_timeout') as session_statement_timeout;

-- 4. Tarama süresi: silmeyle aynı koşul, var olmayan bir kullanıcı (0 satır eşleşir). İkinci çalıştırma önbellekten okur.
\timing on
select count(*) as matched_rows_nil_user
  from auth.audit_log_entries a
 where lower(a.payload ->> 'actor_id') = '00000000-0000-0000-0000-000000000000'
    or lower(a.payload -> 'traits' ->> 'user_id') = '00000000-0000-0000-0000-000000000000';
select count(*) as matched_rows_nil_user_2nd_run
  from auth.audit_log_entries a
 where lower(a.payload ->> 'actor_id') = '00000000-0000-0000-0000-000000000000'
    or lower(a.payload -> 'traits' ->> 'user_id') = '00000000-0000-0000-0000-000000000000';
\timing off

rollback;
