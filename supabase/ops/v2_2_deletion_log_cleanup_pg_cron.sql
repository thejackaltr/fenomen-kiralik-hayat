-- =====================================================================================================
-- AYRI ONAY ADIMI (Aryen, O5 — runbook §13): silme listesinin (fenomen_private.deletion_log) saklama temizliğini
-- pg_cron ile zamanlar. Migration (20260929193000) bunu YAPMAZ. Alternatif: v2_2_schedule_dokploy.md §C.
-- Zaman: pg_cron UTC çalışır. '47 1 * * *' UTC = her gece 04:47 TSİ (GM'nin günlük DB yedeği, 03:47 yedek saklama görevi ve
--        fenomen_save_backups_cleanup 03:47, fenomen_inactive_accounts_purge 04:17 ile çakışmaz).
-- İş: select public.fenomen_cleanup_deletion_log()  -> fenomen_cfg_deletion_log_retention() (45 gün) eski satırları siler.
-- Idempotent: aynı adla tekrar çalıştırılırsa iş güncellenir, ikinci iş oluşmaz.
-- Çalıştırma (postgres): $PSQL -f supabase/ops/v2_2_deletion_log_cleanup_pg_cron.sql
-- Geri alma: v2_2_deletion_log_cleanup_pg_cron.rollback.sql
-- =====================================================================================================
do $x$
begin
  if exists (select 1 from pg_catalog.pg_class where relname in ('kodhane_saves', 'acik_ofis_saves')) then
    raise exception 'WRONG TARGET: kodhane_saves/acik_ofis_saves present in database %', current_database();
  end if;
  if to_regprocedure('public.fenomen_cleanup_deletion_log()') is null then
    raise exception 'apply migration 20260929193000_v2_2_fenomen_cloud_save.sql first';
  end if;
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
      raise exception 'pg_cron is not available on this server: use v2_2_schedule_dokploy.md';
    end if;
    create extension pg_cron with schema pg_catalog;   -- Supabase: postgres kurabilir (supautils)
  end if;
end $x$;
select cron.schedule('fenomen_deletion_log_cleanup', '47 1 * * *', 'select public.fenomen_cleanup_deletion_log()') as jobid;
select jobid, jobname, schedule, command, username, active from cron.job where jobname = 'fenomen_deletion_log_cleanup';
