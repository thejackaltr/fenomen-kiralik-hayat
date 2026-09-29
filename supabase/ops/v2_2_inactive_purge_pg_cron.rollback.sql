-- Geri alma: fenomen_inactive_accounts_purge pg_cron işini kaldırır (varsa). Silinmiş hesapları GERİ GETİRMEZ. Idempotent.
do $x$
declare j bigint;
begin
  if to_regclass('cron.job') is null then raise notice 'pg_cron not installed: nothing to do'; return; end if;
  for j in execute $q$select jobid from cron.job where jobname = 'fenomen_inactive_accounts_purge'$q$ loop
    execute 'select cron.unschedule($1)' using j;
  end loop;
end $x$;
