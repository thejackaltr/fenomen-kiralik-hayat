-- =====================================================================================================
-- ROLLBACK: Fenomen v2.2 bulut kayıt (20260929193000_v2_2_fenomen_cloud_save.sql)
--
-- !!! BU DOSYA VERİ SİLER !!!  public.fenomen_saves (TÜM oyuncuların bulut kayıtları) ve public.fenomen_save_backups
-- (TÜM "Baştan başla" yedekleri) tablolarını içerikleriyle birlikte DROP eder. Geri dönüşü yoktur; önce yedek alın:
--   pg_dump "$DB_URL" -Fc -t public.fenomen_saves -t public.fenomen_save_backups -f fenomen-v22-saves-$(date +%Y%m%d-%H%M).dump
-- Silme listesini (fenomen_private.deletion_log + şema) da DROP eder: önce DB dışına aktarın
--   (ops/fenomen_deletion_log_export.sh; DB dışı dışa aktarımlar 45 gün kalır, rollback onlara dokunmaz).
-- auth.users'a DOKUNMAZ (hesaplar kalır; "Hesabımı sil"/24 ay temizliğiyle silinmiş hesaplar geri gelmez).
-- Sayaç (anon_stats_*) nesnelerine dokunmaz. pg_cron varsa bu özelliğin üç işini (yalnız onları) kaldırır.
--
-- Koruma: yanlışlıkla çalışmasın diye oturumda şu ayar yoksa HİÇBİR ŞEY yapmadan hata verir:
--   PGOPTIONS='-c fenomen.v22_allow_data_loss=on' psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f <bu dosya>
-- Idempotent: ikinci çalıştırma bir şey bulamaz ve hatasız biter. Tek transaction.
-- =====================================================================================================
begin;
set local role postgres;

do $guard$
begin
  if coalesce(current_setting('fenomen.v22_allow_data_loss', true), '') <> 'on' then
    raise exception 'refusing: this rollback DROPS fenomen_saves + fenomen_save_backups (all player cloud saves) and fenomen_private.deletion_log (the deletion list; export it first). Re-run with set fenomen.v22_allow_data_loss = ''on'' (PGOPTIONS=''-c fenomen.v22_allow_data_loss=on'').';
  end if;
  if exists (select 1 from pg_catalog.pg_class where relname in ('kodhane_saves', 'acik_ofis_saves')) then
    raise exception 'WRONG TARGET: kodhane_saves/acik_ofis_saves present in database %', current_database();
  end if;
end $guard$;

-- pg_cron işleri (varsa; yalnız bu özelliğin üç işi)
do $cron$
declare j bigint;
begin
  if to_regclass('cron.job') is null then return; end if;
  for j in execute $q$select jobid from cron.job where jobname in ('fenomen_save_backups_cleanup', 'fenomen_inactive_accounts_purge', 'fenomen_deletion_log_cleanup')$q$ loop
    execute 'select cron.unschedule($1)' using j;
  end loop;
end $cron$;

drop function if exists public.fenomen_reset_save(jsonb, integer, bigint, text);
drop function if exists public.fenomen_list_save_backups();
drop function if exists public.fenomen_delete_my_account();
drop function if exists public.fenomen_cleanup_save_backups();
drop function if exists public.fenomen_purge_inactive_accounts(integer);
drop function if exists public.fenomen_admin_restore_save_backup(uuid);
drop function if exists public.fenomen_cleanup_deletion_log();
drop function if exists public._fenomen_delete_user(uuid, text);
drop function if exists public._fenomen_delete_user(uuid);   -- eski taslak imzası (varsa)
drop function if exists public._fenomen_trim_backups(uuid);
drop function if exists public._fenomen_save_summary(jsonb);

drop table if exists public.fenomen_save_backups;   -- VERİ SİLER
drop table if exists public.fenomen_saves;          -- VERİ SİLER (policy'ler + trigger tabloyla gider)
drop function if exists public.fenomen_saves_before_write();
drop table if exists fenomen_private.deletion_log;   -- SİLME LİSTESİ (önce dışa aktarın)
drop schema if exists fenomen_private;               -- cascade YOK: şemada başka nesne varsa hata verir, hiçbir şey silinmez

drop function if exists public._fenomen_inactive_cutoff();
drop function if exists public.fenomen_cfg_inactive_interval();
drop function if exists public.fenomen_cfg_backup_retention();
drop function if exists public.fenomen_cfg_backup_max_per_user();
drop function if exists public.fenomen_cfg_purge_batch_max();
drop function if exists public.fenomen_cfg_deletion_log_retention();

commit;
notify pgrst, 'reload schema';
