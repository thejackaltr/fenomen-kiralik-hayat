-- Geri alma: fenomen_deletion_log_cleanup pg_cron işini kaldırır (varsa). Veri silmez. Idempotent. pg_cron eklentisini kaldırmaz.
do $x$
declare j bigint;
begin
  if to_regclass('cron.job') is null then raise notice 'pg_cron not installed: nothing to do'; return; end if;
  for j in execute $q$select jobid from cron.job where jobname = 'fenomen_deletion_log_cleanup'$q$ loop
    execute 'select cron.unschedule($1)' using j;
  end loop;
end $x$;
