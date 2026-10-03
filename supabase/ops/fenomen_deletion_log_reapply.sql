-- Fenomen: silme listesi REAPPLY gövdesi. Tek başına çalıştırılmaz: ops/fenomen_deletion_log_reapply.sh reapply <exports...>
-- (sarmalayıcı transaction'ı açar, md5'i doğrulanmış dışa aktarımları pg_temp.fenomen_dl_in'e yükler; bu dosya commit eder).
-- Her uid: deletion_log'a özgün satırı geri yaz (varsa dokunma) -> sayılan tablolarda satırı varsa
-- public._fenomen_delete_user(uid, özgün ref) ile yeniden sil, yoksa atla -> 0 satır kalmalı. Fenomen dışı satır (block) = dur.
-- Hata = hiçbir şey değişmez (tek transaction). İkinci çalıştırma no-op.
do $re$
declare
  v_mode text := 'reapply'; v_bad text; n_in bigint; n_uid bigint;
  r record; d record; k integer; v_total bigint; v_blocked text; v_left text;
  n_log integer := 0; n_del integer := 0; n_skip integer := 0; a integer := 0; s integer := 0; b integer := 0; au integer := 0;
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
  for r in
    select x.user_id::uuid as uid, min(x.deleted_at_utc::timestamptz) as deleted_at,
           (array_agg(x.approval_ref order by x.deleted_at_utc::timestamptz, x.approval_ref))[1] as ref
      from pg_temp.fenomen_dl_in x group by x.user_id order by 2, 1
  loop
    insert into fenomen_private.deletion_log (user_id, deleted_at, approval_ref) values (r.uid, r.deleted_at, r.ref)
    on conflict (user_id) do nothing;
    get diagnostics k = row_count; n_log := n_log + k;
    perform set_config('fenomen_del.uid', r.uid::text, true);
    perform 1 from auth.users u where u.id = r.uid for update;
    select coalesce(sum(x.n), 0), string_agg(x.rel || '=' || x.n, ', ' order by x.rel) filter (where x.act = 'block' and x.n > 0)
      into v_total, v_blocked
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
    if v_blocked is not null then
      raise exception 'fenomen deletion list reapply BLOCKED for %: rows outside Fenomen (%); nothing changed, ask Aryen', r.uid, v_blocked;
    end if;
    if v_total = 0 then n_skip := n_skip + 1; continue; end if;   -- silinecek şey yok
    select * into d from public._fenomen_delete_user(r.uid, r.ref);
    n_del := n_del + 1; a := a + d.accounts; s := s + d.saves; b := b + d.backups; au := au + d.audit_entries;
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
      raise exception 'fenomen deletion list reapply: rows left for % after the re-delete (%); rolled back, nothing changed', r.uid, v_left;
    end if;
  end loop;
  raise notice 'fenomen deletion list reapply OK: % line(s), % uid(s); deletion list rows restored %; re-deleted % (auth.users %, fenomen_saves %, fenomen_save_backups %, audit_log_entries %); skipped (nothing to delete) %',
    n_in, n_uid, n_log, n_del, a, s, b, au, n_skip;
end $re$;
commit;
