-- =====================================================================================================
-- VERIFY (SALT OKUMA) — Fenomen v2.2 bulut kayıt migration'ından SONRA. Yalnız SELECT.
--   PGOPTIONS='-c default_transaction_read_only=on' psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/ops/v2_2_cloud_save_verify.sql
-- Her satır ok = t olmalı; 'result' satırı "VERIFY OK: N/N". Bir kontrol başarısızsa sorgu bilerek hata verir:
--   ERROR: invalid input syntax for type integer: "VERIFY FAILED: <no> <ad> [bilgi]; ..."
-- =====================================================================================================
with fn(sig, who_exec, definer) as (values
  -- sig, EXECUTE yetkisi olması gereken istemci/servis rolleri (virgüllü), security definer olmalı mı
  ('public.fenomen_reset_save(jsonb,integer,bigint,text)', 'authenticated', true),
  ('public.fenomen_list_save_backups()',                   'authenticated', true),
  ('public.fenomen_delete_my_account()',                   'authenticated', true),
  ('public.fenomen_cleanup_save_backups()',                'service_role',  true),
  ('public.fenomen_purge_inactive_accounts(integer)',      'service_role',  true),
  ('public.fenomen_admin_restore_save_backup(uuid)',       'service_role',  true),
  ('public._fenomen_delete_user(uuid)',                    '',              false),
  ('public._fenomen_trim_backups(uuid)',                   '',              false),
  ('public._fenomen_save_summary(jsonb)',                  '',              false),
  ('public.fenomen_saves_before_write()',                  '',              false),
  ('public._fenomen_inactive_cutoff()',                    'service_role',  false),
  ('public.fenomen_cfg_inactive_interval()',               'service_role',  false),
  ('public.fenomen_cfg_backup_retention()',                'service_role',  false),
  ('public.fenomen_cfg_backup_max_per_user()',             'service_role',  false),
  ('public.fenomen_cfg_purge_batch_max()',                 'service_role',  false)
), roles(r) as (values ('anon'), ('authenticated'), ('service_role')),
checks(n, name, ok, info) as (
  select 1, 'tables exist, owner postgres, RLS enabled + FORCE',
         bool_and(c.relrowsecurity and c.relforcerowsecurity and pg_catalog.pg_get_userbyid(c.relowner) = 'postgres') and count(*) = 2,
         string_agg(c.relname || ':' || c.relrowsecurity || '/' || c.relforcerowsecurity || '/' || pg_catalog.pg_get_userbyid(c.relowner), ' ')
    from pg_catalog.pg_class c where c.oid in (to_regclass('public.fenomen_saves'), to_regclass('public.fenomen_save_backups'))
  union all
  select 2, 'fenomen_saves: exactly 3 policies (select/insert/update own, authenticated), none for delete',
         count(*) = 3 and bool_and(p.roles = '{authenticated}' and p.cmd in ('SELECT', 'INSERT', 'UPDATE')
                                   and coalesce(p.qual, p.with_check) like '%auth.uid()%user_id%'),
         string_agg(p.policyname || ':' || p.cmd, ' ')
    from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = 'fenomen_saves'
  union all
  select 3, 'fenomen_save_backups: no policy', count(*) = 0, string_agg(p.policyname, ' ')
    from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = 'fenomen_save_backups'
  union all
  select 4, 'anon: no table or column privilege on either table',
         not bool_or(has_table_privilege('anon', t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                     or has_any_column_privilege('anon', t.oid, 'SELECT,INSERT,UPDATE,REFERENCES')), null
    from (values (to_regclass('public.fenomen_saves')), (to_regclass('public.fenomen_save_backups'))) t(oid)
  union all
  select 5, 'authenticated on fenomen_saves: SELECT; INSERT/UPDATE only (user_id,data,save_version,revision,device); no DELETE/TRUNCATE',
         has_table_privilege('authenticated', 'public.fenomen_saves', 'SELECT')
         and not has_table_privilege('authenticated', 'public.fenomen_saves', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         and (select string_agg(a.attname, ',' order by a.attname) from pg_catalog.pg_attribute a
               where a.attrelid = 'public.fenomen_saves'::regclass and a.attnum > 0 and not a.attisdropped
                 and has_column_privilege('authenticated', 'public.fenomen_saves', a.attname, 'INSERT')) = 'data,device,revision,save_version,user_id'
         and (select string_agg(a.attname, ',' order by a.attname) from pg_catalog.pg_attribute a
               where a.attrelid = 'public.fenomen_saves'::regclass and a.attnum > 0 and not a.attisdropped
                 and has_column_privilege('authenticated', 'public.fenomen_saves', a.attname, 'UPDATE')) = 'data,device,revision,save_version,user_id', null
  union all
  select 6, 'authenticated: no privilege on fenomen_save_backups',
         not (has_table_privilege('authenticated', 'public.fenomen_save_backups', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
              or has_any_column_privilege('authenticated', 'public.fenomen_save_backups', 'SELECT,INSERT,UPDATE')), null
  union all
  select 7, 'service_role: SELECT only on both tables',
         has_table_privilege('service_role', 'public.fenomen_saves', 'SELECT') and has_table_privilege('service_role', 'public.fenomen_save_backups', 'SELECT')
         and not has_table_privilege('service_role', 'public.fenomen_saves', 'INSERT,UPDATE,DELETE,TRUNCATE')
         and not has_table_privilege('service_role', 'public.fenomen_save_backups', 'INSERT,UPDATE,DELETE,TRUNCATE'), null
  union all
  select 8, 'function EXECUTE matrix (anon never; client RPCs authenticated; admin service_role; _fenomen_delete_user nobody)',
         bool_and(to_regprocedure(fn.sig) is not null and has_function_privilege(roles.r, to_regprocedure(fn.sig), 'EXECUTE') = (roles.r = any (string_to_array(fn.who_exec, ',')))),
         string_agg(case when to_regprocedure(fn.sig) is null then fn.sig || ' missing'
                         when has_function_privilege(roles.r, to_regprocedure(fn.sig), 'EXECUTE') <> (roles.r = any (string_to_array(fn.who_exec, ',')))
                         then fn.sig || ' ' || roles.r end, '; ')
    from fn cross join roles
  union all
  select 9, 'no PUBLIC EXECUTE on any fenomen function; all owned by postgres, search_path = ''''',
         bool_and(p.proacl is not null and not exists (select 1 from pg_catalog.aclexplode(p.proacl) a where a.grantee = 0)
                  and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres' and p.proconfig @> array['search_path=""']) and count(*) = 15,
         count(*)::text || ' functions'
    from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'fenomen\_%' or p.proname like '\_fenomen\_%')
  union all
  select 10, 'security definer exactly where expected',
         bool_and(p.prosecdef = fn.definer), string_agg(case when p.prosecdef <> fn.definer then fn.sig end, ' ')
    from fn join pg_catalog.pg_proc p on p.oid = to_regprocedure(fn.sig)
  union all
  select 11, 'both tables: FK user_id -> auth.users ON DELETE CASCADE; trigger fenomen_saves_before_write present',
         (select count(*) from pg_catalog.pg_constraint c where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'c'
            and c.conrelid in ('public.fenomen_saves'::regclass, 'public.fenomen_save_backups'::regclass)) = 2
         and exists (select 1 from pg_catalog.pg_trigger t where t.tgrelid = 'public.fenomen_saves'::regclass and t.tgname = 'fenomen_saves_before_write' and t.tgenabled = 'O'), null
  union all
  select 12, 'no link to the counter (anon_stats_*): no dependency, no FK, no trigger, not mentioned in any fenomen function',
         not exists (select 1 from pg_catalog.pg_depend d join pg_catalog.pg_class c on c.oid = d.refobjid and d.refclassid = 'pg_catalog.pg_class'::regclass
                      where c.relname like 'anon\_stats%' and d.classid = 'pg_catalog.pg_proc'::regclass
                        and d.objid in (select oid from pg_catalog.pg_proc where proname like 'fenomen\_%' or proname like '\_fenomen\_%'))
         and not exists (select 1 from pg_catalog.pg_constraint c where c.contype = 'f'
                          and c.conrelid in ('public.fenomen_saves'::regclass, 'public.fenomen_save_backups'::regclass)
                          and c.confrelid <> 'auth.users'::regclass)
         and not exists (select 1 from pg_catalog.pg_proc p where (p.proname like 'fenomen\_%' or p.proname like '\_fenomen\_%') and p.prosrc like '%anon\_stats%')
         and not exists (select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid = t.tgfoid
                          where t.tgrelid::regclass::text like '%anon\_stats%' and (p.proname like 'fenomen\_%' or p.proname like '\_fenomen\_%')), null
  union all
  select 13, 'settings: inactive 24 months, backups 30 days, max 5/user, purge batch <= 100',
         public.fenomen_cfg_inactive_interval() = interval '24 months' and public.fenomen_cfg_backup_retention() = interval '30 days'
         and public.fenomen_cfg_backup_max_per_user() = 5 and public.fenomen_cfg_purge_batch_max() between 1 and 100,
         public.fenomen_cfg_inactive_interval()::text || ' / ' || public.fenomen_cfg_backup_retention()::text
  union all
  select 14, 'postgres BYPASSRLS (definer functions see rows under FORCE RLS) and can DELETE auth.users',
         (select rolbypassrls from pg_catalog.pg_roles where rolname = 'postgres') and has_table_privilege('postgres', 'auth.users', 'DELETE'), null
  union all
  select 15, 'size limit CHECK present on both tables (262144 bytes)',
         (select count(*) from pg_catalog.pg_constraint c where c.contype = 'c' and pg_catalog.pg_get_constraintdef(c.oid) like '%262144%'
            and c.conrelid in ('public.fenomen_saves'::regclass, 'public.fenomen_save_backups'::regclass)) = 2, null
  union all
  select 16, 'account deletion also removes GoTrue audit rows: postgres can DELETE auth.audit_log_entries; _fenomen_delete_user matches actor_id OR traits.user_id; delete_my_account + purge use it',
         to_regclass('auth.audit_log_entries') is not null and has_table_privilege('postgres', 'auth.audit_log_entries', 'DELETE')
         and (select p.prosrc like '%auth.audit_log_entries%' and p.prosrc like '%''actor_id''%' and p.prosrc like '%''traits''%''user_id''%'
                from pg_catalog.pg_proc p where p.oid = to_regprocedure('public._fenomen_delete_user(uuid)'))
         and (select bool_and(p.prosrc like '%public._fenomen_delete_user(%') from pg_catalog.pg_proc p
               where p.oid in (to_regprocedure('public.fenomen_delete_my_account()'), to_regprocedure('public.fenomen_purge_inactive_accounts(integer)'))),
         null
)
select * from (
select n::text as n, name, coalesce(ok, false) as ok, info, n as k from checks
union all
select 'result', case when bool_and(coalesce(ok, false)) then 'VERIFY OK: ' || count(*) || '/' || count(*)
                      else cast('VERIFY FAILED: ' || string_agg(case when not coalesce(ok, false) then n || ' ' || name || coalesce(' [' || info || ']', '') end, '; ') as integer)::text end,
       bool_and(coalesce(ok, false)), null, 1000
  from checks
) v order by k;
