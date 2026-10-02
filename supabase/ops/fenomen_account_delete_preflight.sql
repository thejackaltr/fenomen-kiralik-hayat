-- Fenomen: account deletion on request (info@), step A: PREFLIGHT (READ ONLY; writes nothing).
-- Finds the account by its registered e-mail (or by uid, for leftovers after a delete), lists every row of the user table
-- by table, what the delete would do with it, and the expect token the delete needs. The token covers id, e-mail and
-- created_at of auth.users + the Fenomen row counts (NOT last_sign_in_at, sessions, refresh tokens, audit rows).
--   PGOPTIONS='-c default_transaction_read_only=on' $PSQL -v email='<registered e-mail>' -f supabase/ops/fenomen_account_delete_preflight.sql
--   PGOPTIONS='-c default_transaction_read_only=on' $PSQL -v uid=<auth user id> -f supabase/ops/fenomen_account_delete_preflight.sql
-- Runbook: docs/fenomen-account-delete-runbook.md. The output shows the e-mail only masked.
\set ON_ERROR_STOP on
\if :{?email}
\else
  \set email ''
\endif
\if :{?uid}
\else
  \set uid ''
\endif
begin transaction read only;
select set_config('fenomen_del.email', lower(btrim(:'email')), true) is not null
   and set_config('fenomen_del.uid_in', btrim(:'uid'), true) is not null as params_set;
do $p$
begin
  if (current_setting('fenomen_del.email') = '') = (current_setting('fenomen_del.uid_in') = '') then
    raise exception 'fenomen account delete preflight: pass exactly one of -v email=<registered e-mail> or -v uid=<auth user id>';
  end if;
  if current_setting('fenomen_del.uid_in') <> '' and current_setting('fenomen_del.uid_in')::uuid = '00000000-0000-0000-0000-000000000000' then
    raise exception 'fenomen account delete preflight: the nil uuid is not a user';
  end if;
end $p$;
-- resolve the uid: by e-mail exactly one auth user (case-insensitive), else the nil uuid (= nothing found, verdict STOP)
select set_config('fenomen_del.matches',
         case when current_setting('fenomen_del.email') = '' then '-'
              else (select count(*)::text from auth.users u where lower(u.email) = current_setting('fenomen_del.email')) end, true) is not null
   and set_config('fenomen_del.uid',
         case when current_setting('fenomen_del.email') = '' then current_setting('fenomen_del.uid_in')::uuid::text
              else coalesce((select case when count(*) = 1 then min(u.id::text) end from auth.users u
                              where lower(u.email) = current_setting('fenomen_del.email')),
                            '00000000-0000-0000-0000-000000000000') end, true) is not null as uid_resolved;

-- 1. target and account (e-mail masked)
select current_database() as db, current_user as db_user, current_setting('transaction_read_only') as read_only,
       case when current_setting('fenomen_del.email') = '' then 'uid' else 'email' end as lookup,
       current_setting('fenomen_del.matches') as email_matches,
       current_setting('fenomen_del.uid') as uid,
       exists (select 1 from auth.users u where u.id = current_setting('fenomen_del.uid')::uuid) as auth_user_exists,
       (select left(u.email, 1) || '***@' || split_part(u.email, '@', 2) from auth.users u where u.id = current_setting('fenomen_del.uid')::uuid) as email_masked,
       (select u.created_at from auth.users u where u.id = current_setting('fenomen_del.uid')::uuid) as auth_created_at,
       (select u.last_sign_in_at from auth.users u where u.id = current_setting('fenomen_del.uid')::uuid) as last_sign_in_at,
       (select string_agg(distinct i.provider, ',') from auth.identities i where i.user_id = current_setting('fenomen_del.uid')::uuid) as providers;

-- 2. rows per table (fenomen | auth | audit | other) and what the delete does with them
select * from (
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

-- 3. Fenomen cloud save and backups (no save content)
select 'save' as kind, s.revision::text as detail, s.save_version, s.device, s.updated_at as at
  from public.fenomen_saves s where s.user_id = current_setting('fenomen_del.uid')::uuid
union all
select 'backup', b.reason || ' x' || count(*), max(b.save_version), null, max(b.created_at)
  from public.fenomen_save_backups b where b.user_id = current_setting('fenomen_del.uid')::uuid group by b.reason
order by 1, 2;

-- 4. verdict + expect token (pass both uid and the token to the delete)
select case when current_setting('fenomen_del.matches') = '0' then 'STOP: no auth user with this e-mail'
            when current_setting('fenomen_del.matches') not in ('-', '1') then 'STOP: ' || current_setting('fenomen_del.matches') || ' auth users with this e-mail; do not delete, ask Aryen'
            when not x.user_exists and x.total = 0 then 'STOP: nothing to delete (no auth user, no rows)'
            when x.blocked is not null then 'BLOCKED: rows outside Fenomen (' || x.blocked || ') would be cascaded or left; do not delete, ask Aryen'
            when not x.user_exists then 'OK (leftovers): auth user already gone; deletes ' || x.total || ' rows (' || x.listed || ')'
            else 'OK: deletes Fenomen ' || x.fen || ' rows + audit ' || x.audit || ' rows + the auth user (cascade ' || x.casc || ', refresh_tokens / flow_state ' || x.rt_fs || ')' end as verdict,
       current_setting('fenomen_del.uid') as uid,
       case when current_setting('fenomen_del.matches') in ('-', '1') and (x.user_exists or x.total > 0) and x.blocked is null then x.token else '-' end as expect
  from (select left(md5(coalesce(string_agg(x.rel || '=' || x.n, ' ' order by x.rel) filter (where x.cat in ('fenomen', 'other')), '')
                  || ' auth=' ||
  -- <fenomen_del_identity>  (identical in preflight / delete; part of the expect token: id, e-mail, created_at of the auth
  -- user; NOT last_sign_in_at, sessions, refresh tokens or audit rows, which change with every login / token refresh)
  coalesce((select u.id::text || '|' || coalesce(u.email, '') || '|' || coalesce(extract(epoch from u.created_at)::text, '')
              from auth.users u where u.id = current_setting('fenomen_del.uid')::uuid), 'no auth user')
  -- </fenomen_del_identity>
                 ), 12) as token,
               string_agg(x.rel || '=' || x.n, ', ' order by x.rel) filter (where x.act = 'block' and x.n > 0) as blocked,
               string_agg(x.rel || '=' || x.n, ', ' order by x.rel) filter (where x.n > 0) as listed,
               coalesce(sum(x.n) filter (where x.cat = 'fenomen'), 0) as fen,
               coalesce(sum(x.n) filter (where x.cat = 'audit'), 0) as audit,
               coalesce(sum(x.n) filter (where x.act = 'cascade'), 0) as casc,
               coalesce(sum(x.n) filter (where x.rel in ('auth.refresh_tokens', 'auth.flow_state')), 0) as rt_fs,
               coalesce(sum(x.n), 0) as total,
               coalesce(sum(x.n) filter (where x.rel = 'auth.users'), 0) = 1 as user_exists
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
          ) x) x;
rollback;
