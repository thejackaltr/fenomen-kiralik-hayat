-- Fenomen: account deletion on request (info@), step B: DELETE (one transaction; any error = nothing deleted).
-- ONLY after Aryen's written approval for THIS uid (runbook step 4). Run as postgres (the owner of _fenomen_delete_user)
-- or supabase_admin, never with -1:
--   $PSQL -v uid=<auth user id> -v confirm_uid=<same id again> -v approval_ref=<reference, no personal data, no '@'> \
--         -v expect=<token from the preflight> -f supabase/ops/fenomen_account_delete.sql
-- Order: lock auth.users row -> recompute the token (expect) -> public._fenomen_delete_user(uid), the same path as
-- "Hesabımı sil" and the 24-month purge: auth.refresh_tokens + auth.flow_state of the user (no FK), audit_log_entries
-- (actor_id OR traits.user_id), fenomen_save_backups, fenomen_saves, auth.users (identities, sessions, mfa_*,
-- one_time_tokens ... cascade) + deletion list row (fenomen_private.deletion_log: uid, now(), 'info:<approval_ref>'; no e-mail)
-- -> check: 0 rows left anywhere.
-- Refuses (nothing deleted) when: a parameter is missing, uid is the nil uuid, confirm_uid differs, approval_ref empty,
-- approval_ref contains '@' / a control character / more than 195 characters (it goes to the deletion list),
-- nothing to delete, rows outside Fenomen (block), or the token differs (e-mail / created_at / id of the account or the
-- Fenomen rows changed since the preflight, or the token belongs to another user).
\set ON_ERROR_STOP on
\if :{?uid}
\else
  \echo 'fenomen account delete: pass -v uid=<auth user id>'
  do $$ begin raise exception 'uid missing'; end $$;
\endif
\if :{?confirm_uid}
\else
  \echo 'fenomen account delete: pass -v confirm_uid=<the same auth user id>'
  do $$ begin raise exception 'confirm_uid missing'; end $$;
\endif
\if :{?approval_ref}
\else
  \echo 'fenomen account delete: pass -v approval_ref=<approval reference>'
  do $$ begin raise exception 'approval_ref missing'; end $$;
\endif
\if :{?expect}
\else
  \echo 'fenomen account delete: pass -v expect=<token printed by the preflight>'
  do $$ begin raise exception 'expect missing'; end $$;
\endif
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
select set_config('fenomen_del.uid', (:'uid')::uuid::text, true) is not null
   and set_config('fenomen_del.confirm_uid', :'confirm_uid', true) is not null
   and set_config('fenomen_del.approval_ref', :'approval_ref', true) is not null
   and set_config('fenomen_del.expect', :'expect', true) is not null as params_ok;
do $del$
declare
  v_uid uuid := current_setting('fenomen_del.uid')::uuid;
  v_ref text := btrim(current_setting('fenomen_del.approval_ref'));
  v_expect text := btrim(current_setting('fenomen_del.expect'));
  v_token text; v_blocked text; v_casc text; v_left text; v_total bigint; v_user boolean;
  n_rt bigint; n_fs bigint; r record;
begin
  if v_uid = '00000000-0000-0000-0000-000000000000' then
    raise exception 'fenomen account delete: the nil uuid is not a user; nothing deleted';
  end if;
  if btrim(current_setting('fenomen_del.confirm_uid')) is distinct from v_uid::text then
    raise exception 'fenomen account delete: confirm_uid does not match uid; nothing deleted';
  end if;
  if length(v_ref) < 4 then
    raise exception 'fenomen account delete: approval_ref (Aryen''s approval reference) is required; nothing deleted';
  end if;
  if v_ref ~ '[@[:cntrl:]]' or length(v_ref) > 195 then
    raise exception 'fenomen account delete: approval_ref goes to the deletion list: no e-mail address (@), no control characters, at most 195 characters; nothing deleted';
  end if;
  perform 1 from auth.users u where u.id = v_uid for update;          -- blocks concurrent writes that reference the user
  v_user := found;
  perform 1 from public.fenomen_saves s where s.user_id = v_uid for update;

  select left(md5(coalesce(string_agg(x.rel || '=' || x.n, ' ' order by x.rel) filter (where x.cat in ('fenomen', 'other')), '')
                  || ' auth=' ||
  -- <fenomen_del_identity>  (identical in preflight / delete; part of the expect token: id, e-mail, created_at of the auth
  -- user; NOT last_sign_in_at, sessions, refresh tokens or audit rows, which change with every login / token refresh)
  coalesce((select u.id::text || '|' || coalesce(u.email, '') || '|' || coalesce(extract(epoch from u.created_at)::text, '')
              from auth.users u where u.id = current_setting('fenomen_del.uid')::uuid), 'no auth user')
  -- </fenomen_del_identity>
                 ), 12),
         string_agg(x.rel || '=' || x.n, ', ' order by x.rel) filter (where x.act = 'block' and x.n > 0),
         string_agg(x.rel || ' ' || x.n, ', ' order by x.rel) filter (where x.act = 'cascade' and x.n > 0),
         coalesce(sum(x.n), 0),
         coalesce(sum(x.n) filter (where x.rel = 'auth.refresh_tokens'), 0),
         coalesce(sum(x.n) filter (where x.rel = 'auth.flow_state'), 0)
    into v_token, v_blocked, v_casc, v_total, n_rt, n_fs
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
  if not v_user and v_total = 0 then
    raise exception 'fenomen account delete: nothing to delete for % (no auth user, no rows); run the verify', v_uid;
  end if;
  if v_blocked is not null then
    raise exception 'fenomen account delete BLOCKED: rows outside Fenomen (%) would be cascaded or left. Nothing deleted', v_blocked;
  end if;
  if v_token is distinct from v_expect then
    raise exception 'fenomen account delete: account (id / e-mail / created_at) or Fenomen rows changed since the preflight, or the token is for another user (expect %, now %); run the preflight again. Nothing deleted', v_expect, v_token;
  end if;

  -- the same path as "Hesabımı sil" and the 24-month purge: refresh tokens + flow state (no FK), audit rows, backups, save,
  -- auth.users (+ cascades), deletion list row 'info:<approval_ref>' when the auth user is deleted. This file deletes nothing itself.
  select * into r from public._fenomen_delete_user(v_uid, 'info:' || v_ref);
  if r.accounts <> (case when v_user then 1 else 0 end) then
    raise exception 'fenomen account delete: _fenomen_delete_user deleted % auth users, expected %; rolled back', r.accounts, case when v_user then 1 else 0 end;
  end if;

  -- check: no row of the user left in any counted table
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
    raise exception 'fenomen account delete: rows left after the delete (%); rolled back, run the preflight again', v_left;
  end if;
  raise notice 'fenomen account delete OK (approval %): auth.users %, fenomen_saves %, fenomen_save_backups %, audit_log_entries %, auth.refresh_tokens %, auth.flow_state % (counted before), cascaded: %; rows left: 0; deletion list: %',
    v_ref, r.accounts, r.saves, r.backups, r.audit_entries, n_rt, n_fs, coalesce(v_casc, 'none'),
    coalesce((select d.approval_ref || ' ' || to_char(d.deleted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from fenomen_private.deletion_log d where d.user_id = v_uid), 'NOT LISTED');
end $del$;
commit;
