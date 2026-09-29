-- LOCAL TEST ONLY. Test helpers in schema t (never part of the migration).
\set ON_ERROR_STOP 1
create schema if not exists t;
create table if not exists t.results (n serial primary key, name text not null, pass boolean not null, info text);
grant usage on schema t to public; grant all on table t.results to public; grant all on sequence t.results_n_seq to public;
create or replace function t.ok(p_pass boolean, p_name text, p_info text default null) returns void language plpgsql as $$
begin
  insert into t.results (name, pass, info) values (p_name, coalesce(p_pass, false), p_info);
  raise notice '% % %', case when coalesce(p_pass, false) then 'PASS' else 'FAIL' end, p_name, coalesce(' -- ' || p_info, '');
end $$;
-- p_sql must fail; "SQLSTATE: message" must match p_like
create or replace function t.throws(p_sql text, p_like text, p_name text) returns void language plpgsql as $$
declare st text; msg text;
begin
  begin execute p_sql;
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    perform t.ok((st || ': ' || msg) like p_like, p_name, st || ': ' || msg); return;
  end;
  perform t.ok(false, p_name, 'no error raised');
end $$;
-- like PostgREST: role + request.jwt.claims; null = anon
create or replace function t.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{"role":"anon"}' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, false);
  perform set_config('role', case when p_uid is null then 'anon' else 'authenticated' end, false);
end $$;
create or replace function t.as_service() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '{"role":"service_role"}', false); perform set_config('role', 'service_role', false); end $$;
create or replace function t.logout() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '', false); perform set_config('role', 'none', false); end $$;
-- the statement PostgREST runs for POST /rest/v1/fenomen_saves?on_conflict=user_id (Prefer: resolution=merge-duplicates)
create or replace function t.upsert(p_uid uuid, p_data jsonb, p_rev bigint) returns bigint language plpgsql as $$
declare r bigint;
begin
  if p_rev is null then
    insert into public.fenomen_saves (user_id, data, save_version) values (p_uid, p_data, 2)
    on conflict (user_id) do update set user_id = excluded.user_id, data = excluded.data, save_version = excluded.save_version
    returning revision into r;
  else
    insert into public.fenomen_saves (user_id, data, save_version, revision) values (p_uid, p_data, 2, p_rev)
    on conflict (user_id) do update set user_id = excluded.user_id, data = excluded.data, save_version = excluded.save_version, revision = excluded.revision
    returning revision into r;
  end if;
  return r;
end $$;
grant execute on all functions in schema t to public;
-- fake GoTrue users (A, B, C) with identities + sessions + refresh tokens
create or replace function t.mkuser(p_id uuid, p_created timestamptz default now(), p_last timestamptz default now()) returns void language plpgsql as $$
declare s uuid;
begin
  insert into auth.users (id, email, created_at, last_sign_in_at) values (p_id, p_id || '@v22-test.invalid', p_created, p_last);
  insert into auth.identities (user_id, provider_id) values (p_id, p_id::text);
  insert into auth.sessions (user_id) values (p_id) returning id into s;
  insert into auth.refresh_tokens (token, user_id, session_id) values (md5(random()::text), p_id::text, s);
end $$;
select t.mkuser('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), t.mkuser('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), t.mkuser('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
