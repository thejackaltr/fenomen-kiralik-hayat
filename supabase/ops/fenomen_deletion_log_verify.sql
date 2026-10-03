-- Fenomen: silme listesi VERIFY gövdesi (değişiklik yok; sonunda rollback). Tek başına çalıştırılmaz:
--   ops/fenomen_deletion_log_reapply.sh verify <exports...>
-- Her uid: sayılan her tabloda (info@ verify ile aynı sayım, <fenomen_del_counts>) 0 satır VE fenomen_private.deletion_log'da satır.
do $v$
declare
  v_mode text := 'verify'; v_bad text; n_in bigint; n_uid bigint;
  r record; v_left text; n_listed integer := 0; v_fail text := '';
begin
  if exists (select 1 from pg_catalog.pg_class where relname in ('kodhane_saves', 'acik_ofis_saves')) then
    raise exception 'WRONG TARGET: kodhane_saves/acik_ofis_saves present in database %', current_database();
  end if;
  if to_regprocedure('public._fenomen_delete_user(uuid,text)') is null or to_regclass('fenomen_private.deletion_log') is null then
    raise exception 'apply migration 20260929193000_v2_2_fenomen_cloud_save.sql first (no _fenomen_delete_user(uuid,text) / deletion list)';
  end if;
  select string_agg(distinct x.src, ', ') into v_bad from pg_temp.fenomen_dl_in x
   where x.user_id is null or x.user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or x.deleted_at_utc is null or x.deleted_at_utc !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$'
      or x.approval_ref is null or x.approval_ref !~ '^(self|info|purge):[^@[:cntrl:]]{1,200}$';
  if v_bad is not null then
    raise exception 'fenomen deletion list %: invalid line(s) in % (uid / deleted_at_utc / approval_ref); nothing changed', v_mode, v_bad;
  end if;
  select count(*), count(distinct x.user_id) into n_in, n_uid from pg_temp.fenomen_dl_in x;
  for r in select distinct x.user_id::uuid as uid from pg_temp.fenomen_dl_in x order by 1 loop
    perform set_config('fenomen_del.uid', r.uid::text, true);
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
    if v_left is not null then v_fail := v_fail || r.uid || ': ' || v_left || '; '; end if;
    if exists (select 1 from fenomen_private.deletion_log l where l.user_id = r.uid) then n_listed := n_listed + 1;
    else v_fail := v_fail || r.uid || ': not on the deletion list; '; end if;
  end loop;
  if v_fail <> '' then
    raise exception 'fenomen deletion list verify FAILED (% uid(s)): % run reapply with all exports', n_uid, v_fail;
  end if;
  raise notice 'fenomen deletion list verify OK: % line(s), % uid(s), 0 rows left, % on the deletion list', n_in, n_uid, n_listed;
end $v$;
rollback;
