-- Fenomen: account deletion on request (info@), step C: VERIFY (READ ONLY). Run right after the delete and again
-- GOTRUE_JWT_EXP (runbook v2.2 §5.4) + 5 minutes later. Every counted table (auth.users, identities, sessions,
-- refresh_tokens, flow_state, mfa_*, one_time_tokens, audit_log_entries, fenomen_saves, fenomen_save_backups, any other
-- table that references auth.users) must show 0 rows of the uid. Exits non-zero when not.
--   PGOPTIONS='-c default_transaction_read_only=on' $PSQL -v uid=<auth user id> -f supabase/ops/fenomen_account_delete_verify.sql
\set ON_ERROR_STOP on
\if :{?uid}
\else
  \echo 'fenomen account delete verify: pass -v uid=<auth user id>'
  do $$ begin raise exception 'uid missing'; end $$;
\endif
begin transaction read only;
select set_config('fenomen_del.uid', (:'uid')::uuid::text, true) is not null as params_ok;
select x.cat, x.rel, x.n, x.act
  from (
  -- <fenomen_del_counts>  (identical in preflight / delete / verify; the tests check it byte-for-byte)
  -- One row per table that can hold a row of the user (uid = setting fenomen_del.uid). act = what the delete does:
  --   function = public._fenomen_delete_user deletes them itself (fenomen_saves, fenomen_save_backups, audit, auth.users and
  --              the FK-less auth.refresh_tokens.user_id / auth.flow_state.user_id rows),
  --   cascade  = goes with auth.users (FK ON DELETE CASCADE: identities, sessions, mfa_*, one_time_tokens, oauth_*, webauthn_*),
  --   block    = anything else (other schemas / tables, no cascade): the delete refuses while n > 0.
  select t.cat, t.rel, t.col,
         (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %s where %s', t.rel, t.cond), false, true, '')))[1]::text::bigint as n,
         t.act
    from (
      select distinct
             case when n.nspname = 'public' and c.relname like 'fenomen\_%' then 'fenomen'
                  when n.nspname = 'auth' then 'auth'
                  else 'other' end as cat,
             format('%I.%I', n.nspname, c.relname) as rel, a.attname::text as col,
             format('%I = %L', a.attname, current_setting('fenomen_del.uid')) as cond,
             case when n.nspname = 'public' and c.relname in ('fenomen_saves', 'fenomen_save_backups') and a.attname = 'user_id' then 'function'
                  when n.nspname = 'auth' and c.relname = 'users' and a.attname = 'id' then 'function'
                  when n.nspname = 'auth' and c.relname in ('refresh_tokens', 'flow_state') and a.attname = 'user_id' then 'function'
                  when n.nspname in ('public', 'auth') and (n.nspname = 'auth' or c.relname like 'fenomen\_%')
                       and exists (select 1 from pg_catalog.pg_constraint k
                                    where k.contype = 'f' and k.conrelid = c.oid and k.confrelid = 'auth.users'::regclass
                                      and k.confdeltype = 'c' and a.attnum = any (k.conkey)) then 'cascade'
                  else 'block' end as act
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
       where c.relkind in ('r', 'p')
         and ((n.nspname = 'public' and c.relname like 'fenomen\_%' and a.attname = 'user_id')
           or (n.nspname = 'auth' and c.relname = 'users' and a.attname = 'id')
           or (n.nspname = 'auth' and a.attname = 'user_id')
           or (n.nspname = 'storage' and c.relname = 'objects' and a.attname in ('owner', 'owner_id'))
           or exists (select 1 from pg_catalog.pg_constraint k
                       where k.contype = 'f' and k.conrelid = c.oid and k.confrelid = 'auth.users'::regclass and a.attnum = any (k.conkey)))
      union all   -- GoTrue audit log: no user column; the user is payload.actor_id (own actions) or payload.traits.user_id
                  -- (admin actions on the user). Same match as public._fenomen_delete_user (lower-case compare).
      select 'audit', 'auth.audit_log_entries', 'payload.actor_id / traits.user_id',
             format('(lower(payload ->> %L) = %L or lower(payload -> %L ->> %L) = %L)', 'actor_id', current_setting('fenomen_del.uid'),
                    'traits', 'user_id', current_setting('fenomen_del.uid')),
             'function'
       where to_regclass('auth.audit_log_entries') is not null
    ) t
  -- </fenomen_del_counts>
) x order by case x.cat when 'fenomen' then 1 when 'auth' then 2 when 'audit' then 3 else 4 end, x.rel;
do $v$
declare v_left text;
begin
  select string_agg(x.rel || '=' || x.n, ', ' order by x.rel) filter (where x.n > 0)
    into v_left
    from (
  -- <fenomen_del_counts>  (identical in preflight / delete / verify; the tests check it byte-for-byte)
  -- One row per table that can hold a row of the user (uid = setting fenomen_del.uid). act = what the delete does:
  --   function = public._fenomen_delete_user deletes them itself (fenomen_saves, fenomen_save_backups, audit, auth.users and
  --              the FK-less auth.refresh_tokens.user_id / auth.flow_state.user_id rows),
  --   cascade  = goes with auth.users (FK ON DELETE CASCADE: identities, sessions, mfa_*, one_time_tokens, oauth_*, webauthn_*),
  --   block    = anything else (other schemas / tables, no cascade): the delete refuses while n > 0.
  select t.cat, t.rel, t.col,
         (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %s where %s', t.rel, t.cond), false, true, '')))[1]::text::bigint as n,
         t.act
    from (
      select distinct
             case when n.nspname = 'public' and c.relname like 'fenomen\_%' then 'fenomen'
                  when n.nspname = 'auth' then 'auth'
                  else 'other' end as cat,
             format('%I.%I', n.nspname, c.relname) as rel, a.attname::text as col,
             format('%I = %L', a.attname, current_setting('fenomen_del.uid')) as cond,
             case when n.nspname = 'public' and c.relname in ('fenomen_saves', 'fenomen_save_backups') and a.attname = 'user_id' then 'function'
                  when n.nspname = 'auth' and c.relname = 'users' and a.attname = 'id' then 'function'
                  when n.nspname = 'auth' and c.relname in ('refresh_tokens', 'flow_state') and a.attname = 'user_id' then 'function'
                  when n.nspname in ('public', 'auth') and (n.nspname = 'auth' or c.relname like 'fenomen\_%')
                       and exists (select 1 from pg_catalog.pg_constraint k
                                    where k.contype = 'f' and k.conrelid = c.oid and k.confrelid = 'auth.users'::regclass
                                      and k.confdeltype = 'c' and a.attnum = any (k.conkey)) then 'cascade'
                  else 'block' end as act
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
       where c.relkind in ('r', 'p')
         and ((n.nspname = 'public' and c.relname like 'fenomen\_%' and a.attname = 'user_id')
           or (n.nspname = 'auth' and c.relname = 'users' and a.attname = 'id')
           or (n.nspname = 'auth' and a.attname = 'user_id')
           or (n.nspname = 'storage' and c.relname = 'objects' and a.attname in ('owner', 'owner_id'))
           or exists (select 1 from pg_catalog.pg_constraint k
                       where k.contype = 'f' and k.conrelid = c.oid and k.confrelid = 'auth.users'::regclass and a.attnum = any (k.conkey)))
      union all   -- GoTrue audit log: no user column; the user is payload.actor_id (own actions) or payload.traits.user_id
                  -- (admin actions on the user). Same match as public._fenomen_delete_user (lower-case compare).
      select 'audit', 'auth.audit_log_entries', 'payload.actor_id / traits.user_id',
             format('(lower(payload ->> %L) = %L or lower(payload -> %L ->> %L) = %L)', 'actor_id', current_setting('fenomen_del.uid'),
                    'traits', 'user_id', current_setting('fenomen_del.uid')),
             'function'
       where to_regclass('auth.audit_log_entries') is not null
    ) t
  -- </fenomen_del_counts>
    ) x;
  if v_left is not null then
    raise exception 'fenomen account delete verify: rows left for %: % (new preflight with -v uid, new expect, new approval)', current_setting('fenomen_del.uid'), v_left;
  end if;
  raise notice 'fenomen account delete verify OK: 0 rows left for %', current_setting('fenomen_del.uid');
end $v$;
rollback;
