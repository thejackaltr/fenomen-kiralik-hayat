-- =====================================================================================================
-- AYRI ONAY ADIMI (Aryen) — 24 AY HAREKETSİZ HESAP TEMİZLİĞİNİ ZAMANLAR. HESAP SİLER (auth kullanıcısı + kayıt + yedekler).
-- Sıra (runbook §7): 1) inactive_accounts_count.sql (sayım)  2) Aryen onayı  3) ilk çalıştırma elle
--                    4) ancak ondan sonra ve ayrı onayla BU dosya (ya da v2_2_schedule_dokploy.md §B).
-- Migration bunu YAPMAZ. Bu dosya ilk çalıştırmayı YAPMAZ; yalnız zamanlar.
-- Zaman: pg_cron UTC. '17 1 * * *' UTC = her gece 04:17 TSİ. Her çalıştırma en fazla fenomen_cfg_purge_batch_max() (100) hesap.
-- İş: select * from public.fenomen_purge_inactive_accounts()
-- Idempotent (aynı ad → güncellenir). Geri alma: v2_2_inactive_purge_pg_cron.rollback.sql
-- =====================================================================================================
do $x$
begin
  if exists (select 1 from pg_catalog.pg_class where relname in ('kodhane_saves', 'acik_ofis_saves')) then
    raise exception 'WRONG TARGET: kodhane_saves/acik_ofis_saves present in database %', current_database();
  end if;
  if to_regprocedure('public.fenomen_purge_inactive_accounts(integer)') is null then
    raise exception 'apply migration 20260929193000_v2_2_fenomen_cloud_save.sql first';
  end if;
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
      raise exception 'pg_cron is not available on this server: use v2_2_schedule_dokploy.md';
    end if;
    create extension pg_cron with schema pg_catalog;
  end if;
end $x$;
select cron.schedule('fenomen_inactive_accounts_purge', '17 1 * * *', 'select * from public.fenomen_purge_inactive_accounts()') as jobid;
select jobid, jobname, schedule, command, username, active from cron.job where jobname = 'fenomen_inactive_accounts_purge';
