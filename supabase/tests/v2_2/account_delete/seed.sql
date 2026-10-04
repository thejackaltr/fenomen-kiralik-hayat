-- LOCAL TEST ONLY: test users for run_account_delete_tests.sh (run as superuser). Never run against the live DB.
-- A = the account to delete (every kind of row), B and C = other users that must stay untouched.
-- Idempotent: removes the test users' rows first (uids below and the fd-test.invalid domain only).
\set ON_ERROR_STOP 1
\set A 'aaaaaaaa-0000-4000-8000-00000000000a'
\set B 'bbbbbbbb-0000-4000-8000-00000000000b'
\set C 'cccccccc-0000-4000-8000-00000000000c'
\set ADMIN 'dddddddd-0000-4000-8000-00000000000d'
delete from auth.audit_log_entries where payload::text like '%fd-test.invalid%' or payload ->> 'fd_test' = 'yes'
   or id::text like any (array['aaaaaaaa-a0d1-%', 'bbbbbbbb-a0d1-%', 'dddddddd-a0d1-%']);
delete from auth.refresh_tokens where user_id in (:'A', :'B', :'C');
delete from auth.flow_state where user_id in (:'A'::uuid, :'B'::uuid, :'C'::uuid);
delete from public.fenomen_save_backups where user_id in (:'A', :'B', :'C');
delete from fenomen_private.deletion_log where user_id in (:'A', :'B', :'C');
delete from public.fenomen_saves where user_id in (:'A', :'B', :'C');
delete from auth.users where id in (:'A', :'B', :'C') or email like '%@fd-test.invalid';

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000000', :'A', 'authenticated', 'authenticated', 'alice@fd-test.invalid', '2026-09-30 10:00:00+00', '2026-09-30 10:00:00+00', now(), '2026-10-01 08:00:00+00', '{"provider":"email","providers":["email"]}', '{}'),
 ('00000000-0000-0000-0000-000000000000', :'B', 'authenticated', 'authenticated', 'bob@fd-test.invalid',   '2026-09-30 11:00:00+00', '2026-09-30 11:00:00+00', now(), '2026-10-01 09:00:00+00', '{"provider":"email","providers":["email"]}', '{}'),
 ('00000000-0000-0000-0000-000000000000', :'C', 'authenticated', 'authenticated', 'carol@fd-test.invalid', '2026-09-30 12:00:00+00', '2026-09-30 12:00:00+00', now(), null, '{"provider":"email","providers":["email"]}', '{}');
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at) values
 (:'A', :'A', json_build_object('sub', :'A', 'email', 'alice@fd-test.invalid')::jsonb, 'email', now(), now()),
 (:'B', :'B', json_build_object('sub', :'B', 'email', 'bob@fd-test.invalid')::jsonb, 'email', now(), now()),
 (:'C', :'C', json_build_object('sub', :'C', 'email', 'carol@fd-test.invalid')::jsonb, 'email', now(), now());
insert into auth.sessions (id, user_id, created_at, updated_at) values
 ('aaaaaaaa-5e55-4000-8000-000000000001', :'A', now(), now()),
 ('aaaaaaaa-5e55-4000-8000-000000000002', :'A', now(), now()),
 ('bbbbbbbb-5e55-4000-8000-000000000001', :'B', now(), now());
insert into auth.refresh_tokens (instance_id, token, user_id, revoked, created_at, updated_at, session_id) values
 ('00000000-0000-0000-0000-000000000000', 'fdtA1', :'A', false, now(), now(), 'aaaaaaaa-5e55-4000-8000-000000000001'),
 ('00000000-0000-0000-0000-000000000000', 'fdtA2', :'A', false, now(), now(), 'aaaaaaaa-5e55-4000-8000-000000000002'),
 ('00000000-0000-0000-0000-000000000000', 'fdtA3', :'A', true,  now(), now(), null),   -- legacy, no session: no FK, only the delete file removes it
 ('00000000-0000-0000-0000-000000000000', 'fdtB1', :'B', false, now(), now(), 'bbbbbbbb-5e55-4000-8000-000000000001'),
 ('00000000-0000-0000-0000-000000000000', 'fdtB2', :'B', true,  now(), now(), null);   -- B's legacy token without session: must stay
insert into auth.flow_state (id, user_id, auth_code, code_challenge_method, code_challenge, provider_type, created_at, updated_at, authentication_method) values
 ('aaaaaaaa-f10e-4000-8000-000000000001', :'A', 'fd-code', 's256', 'fd-challenge', 'email', now(), now(), 'otp'),
 ('bbbbbbbb-f10e-4000-8000-000000000001', :'B', 'fd-code-b', 's256', 'fd-challenge-b', 'email', now(), now(), 'otp');   -- must stay
insert into auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to) values
 ('aaaaaaaa-0770-4000-8000-000000000001', :'A', 'confirmation_token', 'fd-hash-a', 'alice@fd-test.invalid');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
 ('aaaaaaaa-3fa0-4000-8000-000000000001', :'A', 'fd', 'totp', 'unverified', now(), now());
insert into public.fenomen_saves (user_id, data) values (:'A', '{"v":2,"fd":"a"}'), (:'B', '{"v":2,"fd":"b"}');
insert into public.fenomen_save_backups (user_id, revision, save_version, data, reason) values
 (:'A', 1, 1, '{"fd":"a1"}', 'reset'), (:'A', 2, 1, '{"fd":"a2"}', 'restore'), (:'B', 1, 1, '{"fd":"b1"}', 'reset');
insert into auth.audit_log_entries (instance_id, id, payload, created_at) values
 -- A's rows (3): own login (actor_id), admin action about A (traits.user_id), upper-case actor_id
 ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-a0d1-4000-8000-000000000001', json_build_object('fd_test','yes','action','login','actor_id',:'A','log_type','account','traits',json_build_object('provider','email')), now()),
 ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-a0d1-4000-8000-000000000002', json_build_object('fd_test','yes','action','user_signedup','actor_id',:'ADMIN','log_type','team','traits',json_build_object('user_id',:'A','user_email','alice@fd-test.invalid')), now()),
 ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-a0d1-4000-8000-000000000003', json_build_object('fd_test','yes','action','token_refreshed','actor_id',upper(:'A'),'log_type','token'), now()),
 -- other rows (4) that must stay: B's own, admin about B mentioning A's e-mail, admin row without traits, null payload
 ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-a0d1-4000-8000-000000000001', json_build_object('fd_test','yes','action','login','actor_id',:'B','log_type','account'), now()),
 ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-a0d1-4000-8000-000000000002', json_build_object('fd_test','yes','action','user_modified','actor_id',:'ADMIN','log_type','user','traits',json_build_object('user_id',:'B','user_email','alice@fd-test.invalid')), now()),
 ('00000000-0000-0000-0000-000000000000', 'dddddddd-a0d1-4000-8000-000000000001', json_build_object('fd_test','yes','action','token_revoked','actor_id',:'ADMIN','log_type','token'), now()),
 ('00000000-0000-0000-0000-000000000000', 'dddddddd-a0d1-4000-8000-000000000002', null, now());

-- helpers (schema fdtest, dropped by the runner at the end)
create schema if not exists fdtest;
-- snapshot of every row of every auth.* / public.fenomen_* table, one md5 per table; except_uid leaves that user's rows out
create or replace function fdtest.snap(except_uid text default null) returns table (rel text, md5 text) language plpgsql as $f$
declare r record; v text; cond text;
begin
  for r in select format('%I.%I', n.nspname, c.relname) as rel, n.nspname, c.relname,
                  exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped) as has_uid
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where c.relkind in ('r', 'p') and (n.nspname = 'auth' or (n.nspname = 'public' and c.relname like 'fenomen\_%'))
            order by 1 loop
    cond := 'true';
    if except_uid is not null then
      if r.rel = 'auth.users' then cond := format('id::text <> %L', except_uid);
      elsif r.rel = 'auth.audit_log_entries' then
        cond := format('not coalesce(lower(payload ->> %L) = %L or lower(payload -> %L ->> %L) = %L, false)', 'actor_id', except_uid, 'traits', 'user_id', except_uid);
      elsif r.has_uid then cond := format('user_id::text is distinct from %L', except_uid);
      end if;
    end if;
    execute format('select count(*) || '':'' || coalesce(md5(string_agg(t::text, '','' order by t::text)), ''-'') from %s t where %s', r.rel, cond) into v;
    rel := r.rel; md5 := v; return next;
  end loop;
end $f$;
