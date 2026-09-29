-- =====================================================================================================
-- AYRI ONAY ADIMI (Aryen): "Baştan başla" yedeklerinin 30 gün temizliğini pg_cron ile zamanlar.
-- Migration (20260929193000) bunu YAPMAZ. Alternatif (pg_cron yoksa/istenmezse): v2_2_schedule_dokploy.md §A.
-- Zaman: pg_cron UTC çalışır (cron.timezone varsayılanı GMT). '47 0 * * *' UTC = her gece 03:47 TSİ (UTC+3, yaz saati yok).
--        (Sayaç işi fenomen_anon_stats_cleanup 03:17 TSİ'de; çakışmasın diye 30 dk sonra.)
-- İş: select public.fenomen_cleanup_save_backups()  -> 30 günden eski yedekleri siler.
-- Idempotent: aynı adla tekrar çalıştırılırsa iş güncellenir, ikinci iş oluşmaz.
-- Çalıştırma (postgres): psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/ops/v2_2_backup_cleanup_pg_cron.sql
-- Geri alma: v2_2_backup_cleanup_pg_cron.rollback.sql
-- =====================================================================================================
do $x$
begin
  if exists (select 1 from pg_catalog.pg_class where relname in ('kodhane_saves', 'acik_ofis_saves')) then
    raise exception 'WRONG TARGET: kodhane_saves/acik_ofis_saves present in database %', current_database();
  end if;
  if to_regprocedure('public.fenomen_cleanup_save_backups()') is null then
    raise exception 'apply migration 20260929193000_v2_2_fenomen_cloud_save.sql first';
  end if;
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
      raise exception 'pg_cron is not available on this server: use v2_2_schedule_dokploy.md';
    end if;
    create extension pg_cron with schema pg_catalog;   -- Supabase: postgres kurabilir (supautils)
  end if;
end $x$;
select cron.schedule('fenomen_save_backups_cleanup', '47 0 * * *', 'select public.fenomen_cleanup_save_backups()') as jobid;
select jobid, jobname, schedule, command, username, active from cron.job where jobname = 'fenomen_save_backups_cleanup';
