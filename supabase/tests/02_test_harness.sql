-- LOCAL TEST ONLY. Superuser. Tiny assertion helpers; results go to test_harness.results.
\set ON_ERROR_STOP 1
create schema test_harness;
create table test_harness.results (n serial, label text, ok boolean, detail text);
grant usage on schema test_harness to public;
grant insert, select on test_harness.results to public;
grant usage on sequence test_harness.results_n_seq to public;

-- run SQL as the CURRENT role, expect success
create function test_harness.expect_ok(label text, sql text) returns void language plpgsql as $f$
begin
  execute sql;
  insert into test_harness.results(label, ok, detail) values (label, true, 'ok as ' || current_user);
  raise notice 'PASS  % (as %)', label, current_user;
exception when others then
  insert into test_harness.results(label, ok, detail) values (label, false, sqlstate || ' ' || sqlerrm);
  raise notice 'FAIL  % (as %): % %', label, current_user, sqlstate, sqlerrm;
end $f$;

-- run SQL as the CURRENT role, expect an error with the given SQLSTATE
create function test_harness.expect_error(label text, sql text, state text) returns void language plpgsql as $f$
begin
  execute sql;
  insert into test_harness.results(label, ok, detail) values (label, false, 'no error, expected ' || state);
  raise notice 'FAIL  % (as %): no error, expected %', label, current_user, state;
exception when others then
  if sqlstate = state then
    insert into test_harness.results(label, ok, detail) values (label, true, sqlstate || ' ' || sqlerrm);
    raise notice 'PASS  % (as %): % %', label, current_user, sqlstate, sqlerrm;
  else
    insert into test_harness.results(label, ok, detail) values (label, false, 'got ' || sqlstate || ' ' || sqlerrm || ', expected ' || state);
    raise notice 'FAIL  % (as %): got % %, expected %', label, current_user, sqlstate, sqlerrm, state;
  end if;
end $f$;

create function test_harness.check(label text, cond boolean, detail text default '') returns void language plpgsql as $f$
begin
  insert into test_harness.results(label, ok, detail) values (label, coalesce(cond, false), detail);
  if coalesce(cond, false) then raise notice 'PASS  % %', label, detail;
  else raise notice 'FAIL  % %', label, detail; end if;
end $f$;
grant execute on all functions in schema test_harness to public;
