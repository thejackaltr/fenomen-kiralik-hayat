-- LOCAL TEST ONLY. Run as the cluster superuser after the migration. Results in t.results.
\set ON_ERROR_STOP 0
\set A '''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'''
\set B '''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'''
\set C '''cccccccc-cccc-4ccc-8ccc-cccccccccccc'''

-- ============================================================ S: saves, RLS, revision
select t.login(:A);
select t.ok(t.upsert(:A, '{"v":2,"followers":10,"money":5,"meta":{"fame":1,"sales":0}}', 1) = 1, 'S01 A inserts own save (upsert, revision 1)');
select t.login(:B);
select t.ok(t.upsert(:B, '{"v":2,"followers":999}', 1) = 1, 'S02 B inserts own save');
select t.login(:A);
select t.ok((select count(*) from public.fenomen_saves) = 1 and (select user_id from public.fenomen_saves) = :A, 'S03 A sees exactly one row: its own');
select t.ok((select count(*) from public.fenomen_saves where user_id = :B) = 0, 'S04 A cannot read B''s save');
do $$ declare n int; begin
  update public.fenomen_saves set data = '{"hacked":true}', revision = 2 where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  get diagnostics n = row_count; perform t.ok(n = 0, 'S05 A update of B''s row affects 0 rows', n::text); end $$;
select t.throws($$insert into public.fenomen_saves (user_id, data) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{}')$$, '42501: new row violates row-level security policy%', 'S06 A cannot insert a row for C');
select t.throws($$select t.upsert('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '{"hacked":true}', 2)$$, '42501: %', 'S07 A upsert onto B''s existing row is rejected');
select t.throws($$delete from public.fenomen_saves where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, '42501: permission denied for table fenomen_saves', 'S08 A cannot DELETE its own row (no DELETE grant)');
select t.throws($$truncate public.fenomen_saves$$, '42501: permission denied%', 'S09 A cannot TRUNCATE');
select t.throws($$update public.fenomen_saves set updated_at = now() - interval '1 year', revision = 2 where user_id = auth.uid()$$, '42501: permission denied%', 'S10 A cannot write updated_at (server-owned)');
select t.throws($$update public.fenomen_saves set created_at = now(), revision = 2 where user_id = auth.uid()$$, '42501: permission denied%', 'S11 A cannot write created_at');
select t.ok(t.upsert(:A, '{"v":2,"followers":20}', 2) = 2, 'S12 write with revision = server + 1 accepted (-> 2)');
select t.throws($$select t.upsert('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"v":2,"followers":1}', 2)$$, 'PT409: stale_revision', 'S13 same revision again -> PT409 stale_revision (409)');
select t.throws($$select t.upsert('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"v":2,"followers":1}', 1)$$, 'PT409: stale_revision', 'S14 lower revision -> PT409');
select t.throws($$select t.upsert('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"v":2,"followers":1}', 9)$$, 'PT409: stale_revision', 'S15 skipped revision -> PT409');
select t.throws($$select t.upsert('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"v":2,"followers":1}', null)$$, 'PT409: stale_revision', 'S16 upsert without revision onto an existing row -> PT409');
select t.throws($$update public.fenomen_saves set data = '{"x":1}' where user_id = auth.uid()$$, 'PT409: stale_revision', 'S17 PATCH without revision -> PT409');
do $$ declare u timestamptz; begin
  select updated_at into u from public.fenomen_saves;
  update public.fenomen_saves set data = '{"v":2,"followers":30}', revision = 3, user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where user_id = auth.uid();
  perform t.ok((select user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and revision = 3 from public.fenomen_saves), 'S18 PATCH cannot move the row to another user_id (server keeps it)');
end $$;
select t.ok((select (data->>'followers')::int = 30 and updated_at <= now() and created_at <= updated_at from public.fenomen_saves), 'S19 server set updated_at; data stored');
-- size limit + shape
select t.throws($$update public.fenomen_saves set data = jsonb_build_object('pad', repeat('x', 262200)), revision = 4 where user_id = auth.uid()$$, '23514: %fenomen_saves_data_size%', 'S20 data > 256 KiB rejected (23514 check)');
select t.ok((select revision = 3 from public.fenomen_saves), 'S21 rejected write changed nothing (revision still 3)');
select t.throws($$update public.fenomen_saves set data = '[1,2]', revision = 4 where user_id = auth.uid()$$, '23514: %fenomen_saves_data_object%', 'S22 non-object data rejected');
select t.ok(t.upsert(:A, jsonb_build_object('v', 2, 'pad', repeat('x', 262000)), 4) = 4, 'S23 data just under 256 KiB accepted');
select t.throws($$update public.fenomen_saves set device = 'tablet', revision = 5 where user_id = auth.uid()$$, '23514: %fenomen_saves_device_chk%', 'S24 device must be mobil|masaustu|null');
select t.ok(t.upsert(:A, '{"v":2,"followers":40,"money":7,"meta":{"fame":3,"sales":1,"playSec":120},"lastSeen":1790000000000}', 5) = 5, 'S25 back to a normal save (revision 5)');

-- ============================================================ N: anon
select t.login(null);
select t.throws($$select * from public.fenomen_saves$$, '42501: permission denied for table fenomen_saves', 'N01 anon cannot select saves');
select t.throws($$insert into public.fenomen_saves (user_id, data) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{}')$$, '42501: permission denied%', 'N02 anon cannot insert');
select t.throws($$update public.fenomen_saves set data = '{}'$$, '42501: permission denied%', 'N03 anon cannot update');
select t.throws($$delete from public.fenomen_saves$$, '42501: permission denied%', 'N04 anon cannot delete');
select t.throws($$select * from public.fenomen_save_backups$$, '42501: permission denied%', 'N05 anon cannot select backups');
select t.throws($$select public.fenomen_reset_save('{}')$$, '42501: permission denied for function fenomen_reset_save', 'N06 anon cannot call fenomen_reset_save');
select t.throws($$select * from public.fenomen_list_save_backups()$$, '42501: permission denied for function fenomen_list_save_backups', 'N07 anon cannot call fenomen_list_save_backups');
select t.throws($$select public.fenomen_delete_my_account()$$, '42501: permission denied for function fenomen_delete_my_account', 'N08 anon cannot call fenomen_delete_my_account');
select t.throws($$select * from public.fenomen_purge_inactive_accounts()$$, '42501: permission denied for function fenomen_purge_inactive_accounts', 'N09 anon cannot call the 24-month purge');
select t.throws($$select public.fenomen_cleanup_save_backups()$$, '42501: permission denied for function fenomen_cleanup_save_backups', 'N10 anon cannot call backup cleanup');
select t.throws($$select * from public._fenomen_delete_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'info:FD-TEST')$$, '42501: permission denied for function _fenomen_delete_user', 'N11 anon cannot call _fenomen_delete_user');
select t.throws($$select public.fenomen_cfg_inactive_interval()$$, '42501: permission denied%', 'N12 anon cannot call config functions');

-- ============================================================ R: "Baştan başla" + backups
select t.login(:A);
select t.throws($$select public.fenomen_reset_save('{"v":2,"followers":0}', 2, 4)$$, 'PT409: stale_revision', 'R01 reset with an old expected revision -> PT409 (other device progressed)');
select t.throws($$select public.fenomen_reset_save('[]')$$, '22023: invalid_data', 'R02 reset with non-object data -> 22023 invalid_data');
do $$ declare r jsonb; begin
  r := public.fenomen_reset_save('{"v":2,"followers":0,"money":0}', 2, 5, 'mobil');
  perform t.ok((r->>'revision')::int = 6 and r->>'backup_id' is not null, 'R03 reset: revision 5 -> 6, backup id returned', r::text);
  perform t.ok((select (data->>'followers')::int = 0 and revision = 6 and device = 'mobil' from public.fenomen_saves), 'R04 save replaced by the new game state');
end $$;
select t.throws($$select t.upsert('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"v":2,"followers":40}', 6)$$, 'PT409: stale_revision', 'R05 old device (knew revision 5, sends 6) cannot overwrite the reset -> PT409');
select t.ok((select count(*) = 1 and bool_and(revision = 5 and reason = 'reset' and (summary->>'followers')::int = 40 and (summary->>'sales')::int = 1
                                              and expires_at = created_at + interval '30 days' and size_bytes > 0)
               from public.fenomen_list_save_backups()), 'R06 A lists exactly 1 backup: the pre-reset save (revision 5, 40 followers, expires in 30 days)');
select t.throws($$select * from public.fenomen_save_backups$$, '42501: permission denied for table fenomen_save_backups', 'R07 A cannot read the backup table directly (RPC only)');
select t.login(:B);
select t.ok(public.fenomen_reset_save('{"v":2}', 2, 1) ->> 'revision' = '2', 'R08 B resets its own save');
select t.ok((select count(*) = 1 and bool_and((summary->>'followers')::int = 999) from public.fenomen_list_save_backups()), 'R09 B lists only its own backup (not A''s)');
select t.login(:A);
select t.ok((select count(*) = 1 from public.fenomen_list_save_backups()), 'R10 A still lists only its own backup');
select t.login(:C);
do $$ declare r jsonb; begin
  r := public.fenomen_reset_save('{"v":2,"fresh":true}');
  perform t.ok((r->>'revision')::int = 1 and r->'backup_id' = 'null'::jsonb, 'R11 reset without a cloud save: creates it (revision 1), no backup', r::text);
end $$;
select t.ok((select count(*) = 0 from public.fenomen_list_save_backups()), 'R12 C has no backups');
select t.login(:A);
do $$ declare i int; rev bigint; begin
  for i in 1..6 loop
    select revision into rev from public.fenomen_saves;
    perform public.fenomen_reset_save(jsonb_build_object('v', 2, 'followers', i), 2, rev);
  end loop;
  perform t.ok((select count(*) = 5 from public.fenomen_list_save_backups()), 'R13 cap: 7 resets keep only the newest 5 backups');
end $$;
select t.logout();
select t.ok((select count(*) = 5 from public.fenomen_save_backups where user_id = :A), 'R14 cap enforced in the table too (5 rows for A)');

-- ============================================================ K: 30-day cleanup
select t.logout();
update public.fenomen_save_backups set created_at = now() - interval '31 days'
 where id = (select id from public.fenomen_save_backups where user_id = :A order by created_at, id limit 1);
update public.fenomen_save_backups set created_at = now() - interval '29 days'
 where id = (select id from public.fenomen_save_backups where user_id = :A and created_at > now() - interval '1 day' order by created_at, id limit 1);
select t.login(:A);
select t.ok((select count(*) = 4 from public.fenomen_list_save_backups()), 'K01 list hides the 31-day-old backup (4 of 5 visible)');
select t.throws($$select public.fenomen_cleanup_save_backups()$$, '42501: permission denied for function fenomen_cleanup_save_backups', 'K02 authenticated cannot call cleanup');
select t.as_service();
select t.ok(public.fenomen_cleanup_save_backups() = 1, 'K03 service_role cleanup deletes exactly 1 (the 31-day-old one)');
select t.logout();
select t.ok((select count(*) = 4 and count(*) filter (where created_at < now() - interval '28 days') = 1 from public.fenomen_save_backups where user_id = :A),
            'K04 the 29-day-old backup is kept; 4 remain');
select t.as_service();
select t.ok(public.fenomen_cleanup_save_backups() = 0, 'K05 cleanup again: nothing to delete');
select t.throws($$delete from public.fenomen_save_backups$$, '42501: permission denied%', 'K06 service_role cannot delete backups directly (only via the function)');

-- ============================================================ X: admin restore (service_role only)
select t.login(:A);
select t.throws($$select public.fenomen_admin_restore_save_backup(gen_random_uuid())$$, '42501: permission denied%', 'X01 authenticated cannot call admin restore');
select t.as_service();
do $$ declare b record; r jsonb; rev bigint; begin
  select id, data into b from public.fenomen_save_backups where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' order by created_at desc, id desc limit 1;
  select revision into rev from public.fenomen_saves where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  r := public.fenomen_admin_restore_save_backup(b.id);
  perform t.ok((r->>'revision')::bigint = rev + 1 and (select data = b.data from public.fenomen_saves where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
               and (select count(*) = 1 from public.fenomen_save_backups where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and reason = 'restore'),
               'X02 service_role restores the newest backup: data back, revision + 1, current save kept as a restore backup', r::text);
end $$;
select t.throws($$select public.fenomen_admin_restore_save_backup(gen_random_uuid())$$, 'PT404: backup_not_found', 'X03 unknown backup -> PT404');

-- ============================================================ D: "Hesabımı sil"
select t.login(:A);
select t.throws($$select * from public._fenomen_delete_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'info:FD-TEST')$$, '42501: permission denied for function _fenomen_delete_user', 'D01 authenticated cannot call _fenomen_delete_user(B)');
select t.as_service();
select t.throws($$select * from public._fenomen_delete_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'info:FD-TEST')$$, '42501: permission denied for function _fenomen_delete_user', 'D02 service_role cannot call _fenomen_delete_user either');
select t.throws($$select public.fenomen_delete_my_account()$$, '42501: permission denied for function fenomen_delete_my_account', 'D03 service_role cannot call fenomen_delete_my_account (authenticated only)');
select t.login('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
select t.ok((select public.fenomen_delete_my_account() = '{"saves": 0, "backups": 0, "deleted": false, "audit_entries": 0}'::jsonb), 'D04 a JWT for a non-existent user deletes nothing');
select set_config('request.jwt.claims', '{"role":"authenticated"}', false);
select t.throws($$select public.fenomen_delete_my_account()$$, '42501: not_authenticated', 'D05 authenticated without sub (auth.uid() null) -> 42501 not_authenticated');
select t.logout();
-- GoTrue audit rows (payload json, as GoTrue writes them): 3 about A (actor_id; admin action with traits.user_id = A; actor_id upper-case),
-- 6 that must survive: B's own rows, C's row that only mentions A's e-mail, odd payloads (array, null, scalar traits).
insert into auth.audit_log_entries (id, payload, created_at) values
  ('a0000000-0000-4000-8000-00000000000a', json_build_object('actor_id', :A, 'action', 'login', 'log_type', 'account'), now()),
  ('a0000000-0000-4000-8000-00000000000b', json_build_object('actor_id', '00000000-0000-0000-0000-000000000000', 'action', 'user_modified',
                                                             'traits', json_build_object('user_id', :A, 'user_email', 'a@v22-test.invalid')), now()),
  ('a0000000-0000-4000-8000-00000000000c', json_build_object('actor_id', upper(:A), 'action', 'token_refreshed'), now()),
  ('b0000000-0000-4000-8000-000000000001', json_build_object('actor_id', :B, 'action', 'login'), now()),
  ('b0000000-0000-4000-8000-000000000002', json_build_object('actor_id', :B, 'action', 'user_modified', 'traits', json_build_object('user_id', :B)), now()),
  ('b0000000-0000-4000-8000-000000000003', json_build_object('actor_id', :C, 'action', 'login', 'traits', json_build_object('user_email', :A || '@v22-test.invalid')), now()),
  ('b0000000-0000-4000-8000-000000000004', '[]'::json, now()),
  ('b0000000-0000-4000-8000-000000000005', null, now()),
  ('b0000000-0000-4000-8000-000000000006', json_build_object('actor_id', :B, 'traits', 'x'), now());
-- FK-less auth rows (GoTrue): a refresh token without session (legacy) and a PKCE flow_state row, for A (must go) and B (must stay)
insert into auth.refresh_tokens (token, user_id, session_id, revoked) values ('fd-nosess-a', :A, null, true), ('fd-nosess-b', :B, null, true);
insert into auth.flow_state (id, user_id, auth_code, code_challenge) values
  ('f0000000-0000-4000-8000-00000000000a', :A, 'code-a', 'ch-a'), ('f0000000-0000-4000-8000-00000000000b', :B, 'code-b', 'ch-b');
create temp table aud_before as
  select (select count(*) from auth.audit_log_entries) n,
         (select md5(string_agg(id::text || coalesce(payload::text, '~'), ',' order by id)) from auth.audit_log_entries where id::text like 'b0000000-%') keep_h;
grant select on aud_before to public;
create temp table b_before as
  select (select count(*) from public.fenomen_saves where user_id = :B) s, (select count(*) from public.fenomen_save_backups where user_id = :B) b,
         (select count(*) from auth.users where id = :B) u, (select count(*) from auth.identities where user_id = :B) i,
         (select count(*) from auth.sessions where user_id = :B) se, (select count(*) from auth.refresh_tokens where user_id = :B) rt,
         (select count(*) from auth.flow_state where user_id = :B) fs,
         (select md5(string_agg(data::text || revision, ',')) from public.fenomen_saves where user_id = :B) h;
grant select on b_before to public;
select t.ok((select s = 1 and b = 1 and u = 1 and i = 1 and se = 1 and rt = 2 and fs = 1 from b_before), 'D06 before: B has save, backup, user, identity, session, 2 refresh tokens (1 without session), flow_state');
select t.ok((select count(*) = 1 from public.fenomen_saves where user_id = :A) and (select count(*) = 5 from public.fenomen_save_backups where user_id = :A), 'D07 before: A has 1 save + 5 backups');
select t.login(:A);
-- like PostgREST: the JWT carries GoTrue's session_id -> deletion list ref self:session:<id>
select set_config('request.jwt.claims', json_build_object('sub', :A, 'role', 'authenticated', 'session_id', '5e550000-0000-4000-8000-00000000000A')::text, false);
do $$ declare r jsonb; begin
  r := public.fenomen_delete_my_account();
  perform t.ok(r = '{"saves": 1, "backups": 5, "deleted": true, "audit_entries": 3}'::jsonb, 'D08 A deletes its account: returns deleted/saves/backups/audit_entries counts', r::text);
end $$;
select t.logout();
select t.ok((select count(*) from auth.users where id = :A) = 0, 'D09 A''s auth.users row is gone');
select t.ok((select count(*) from auth.identities where user_id = :A) + (select count(*) from auth.sessions where user_id = :A)
            + (select count(*) from auth.refresh_tokens where user_id = :A::text) = 0, 'D10 A''s identities, sessions, refresh tokens are gone (cascade)');
select t.ok((select count(*) from public.fenomen_saves where user_id = :A) + (select count(*) from public.fenomen_save_backups where user_id = :A) = 0, 'D11 A''s save and backups are gone');
select t.ok((select count(*) from auth.refresh_tokens where token = 'fd-nosess-a') = 0 and (select count(*) from auth.flow_state where user_id = :A) = 0,
            'D11c A''s FK-less auth rows gone: refresh token without session, flow_state');
select t.ok((select count(*) from auth.refresh_tokens where token = 'fd-nosess-b' and user_id = :B) = 1
            and (select count(*) from auth.flow_state where id = 'f0000000-0000-4000-8000-00000000000b' and user_id = :B) = 1,
            'D11d B''s refresh token without session and flow_state untouched');
select t.ok((select count(*) from auth.audit_log_entries where id::text like 'a0000000-%') = 0, 'D11a A''s audit rows gone: actor_id = A, traits.user_id = A (admin action about A), upper-case actor_id');
select t.ok((select n - 3 = (select count(*) from auth.audit_log_entries)
                    and keep_h = (select md5(string_agg(id::text || coalesce(payload::text, '~'), ',' order by id)) from auth.audit_log_entries where id::text like 'b0000000-%')
               from aud_before), 'D11b other users'' audit rows untouched (B''s, C''s row mentioning A''s e-mail, array/null/scalar payloads): exactly 3 rows removed');
select t.ok((select s = (select count(*) from public.fenomen_saves where user_id = :B) and b = (select count(*) from public.fenomen_save_backups where user_id = :B)
                    and u = (select count(*) from auth.users where id = :B) and i = (select count(*) from auth.identities where user_id = :B)
                    and se = (select count(*) from auth.sessions where user_id = :B) and rt = (select count(*) from auth.refresh_tokens where user_id = :B)
                    and fs = (select count(*) from auth.flow_state where user_id = :B)
                    and h = (select md5(string_agg(data::text || revision, ',')) from public.fenomen_saves where user_id = :B) from b_before), 'D12 B untouched (save byte-identical, backup, user, identity, session, token)');
select t.login(:A);
select t.throws($$select t.upsert('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"v":2}', 1)$$, '23503: %', 'D13 still-valid JWT of the deleted user cannot recreate a save (FK -> 23503)');
select t.ok((select count(*) = 0 from public.fenomen_saves), 'D14 still-valid JWT of the deleted user reads nothing');
select t.ok((select public.fenomen_delete_my_account() = '{"saves": 0, "backups": 0, "deleted": false, "audit_entries": 0}'::jsonb), 'D15 second delete call is a no-op (idempotent)');
select t.throws($$select count(*) from fenomen_private.deletion_log$$, '42501: permission denied for schema fenomen_private', 'L03a authenticated cannot read the deletion list');
select t.throws($$select public.fenomen_cleanup_deletion_log()$$, '42501: permission denied for function fenomen_cleanup_deletion_log', 'L04a authenticated cannot run the deletion list cleanup');
select t.login(null);
select t.throws($$select count(*) from fenomen_private.deletion_log$$, '42501: permission denied for schema fenomen_private', 'L03b anon cannot read the deletion list');
select t.as_service();
select t.throws($$select count(*) from fenomen_private.deletion_log$$, '42501: permission denied for schema fenomen_private', 'L03c service_role cannot read the deletion list either');
select t.ok(public.fenomen_cleanup_deletion_log() = 0, 'L04b service_role runs the deletion list cleanup (nothing older than 45 days)');
select t.logout();

-- ============================================================ L: deletion list (fenomen_private.deletion_log)
select t.ok((select count(*) = 1 and bool_and(approval_ref = 'self:session:5e550000-0000-4000-8000-00000000000a'
                    and deleted_at > now() - interval '1 hour') from fenomen_private.deletion_log where user_id = :A),
            'L01 "Hesabımı sil" wrote A to the deletion list: uid + time + ref self:session:<JWT session_id>',
            (select string_agg(user_id || ' ' || approval_ref, '; ') from fenomen_private.deletion_log));
select t.ok((select count(*) from fenomen_private.deletion_log) = 1
            and (select count(*) from fenomen_private.deletion_log where user_id in (:B, :C, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')) = 0,
            'L02 only A is listed: not B / C, not the JWT of a non-existent user (D04, nothing deleted), second call (D15) adds nothing');
select t.ok((select string_agg(attname, ',' order by attnum) from pg_attribute where attrelid = 'fenomen_private.deletion_log'::regclass and attnum > 0 and not attisdropped)
            = 'user_id,deleted_at,approval_ref', 'L05 deletion list columns: user_id, deleted_at, approval_ref (no e-mail)');
select t.throws($$select * from public._fenomen_delete_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'info:bob@example.com')$$, '22023: invalid_deletion_ref', 'L06a ref with an e-mail address refused');
select t.throws($$select * from public._fenomen_delete_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'FN-SIL-1')$$, '22023: invalid_deletion_ref', 'L06b ref without self:/info:/purge: prefix refused');
select t.throws($$select * from public._fenomen_delete_user('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null)$$, '22023: invalid_deletion_ref', 'L06c null ref refused');
select t.ok((select count(*) from auth.users where id = :B) = 1 and (select count(*) from public.fenomen_saves where user_id = :B) = 1
            and (select count(*) from auth.refresh_tokens where user_id = :B) = 2, 'L06d refused refs deleted nothing (B still has user, save, refresh tokens)');
select t.throws($$insert into fenomen_private.deletion_log (user_id, approval_ref) values (gen_random_uuid(), 'info:x@y.z')$$, '23514: %deletion_log_ref_chk%', 'L06e table CHECK: no e-mail in approval_ref even for direct inserts');
insert into fenomen_private.deletion_log (user_id, deleted_at, approval_ref) values
  ('e1000000-0000-4000-8000-000000000046', now() - interval '45 days' - interval '1 minute', 'info:FD-OLD'),
  ('e1000000-0000-4000-8000-000000000044', now() - interval '44 days', 'info:FD-KEEP');
select t.as_service();
select t.ok(public.fenomen_cleanup_deletion_log() = 1, 'L07a cleanup deletes the row older than 45 days (1)');
select t.logout();
select t.ok((select string_agg(approval_ref, ',' order by approval_ref) from fenomen_private.deletion_log where user_id::text like 'e1000000-%') = 'info:FD-KEEP',
            'L07b 44-day-old row kept');
delete from fenomen_private.deletion_log where user_id::text like 'e1000000-%';

-- ============================================================ P: 24-month inactive purge
-- P1 keep: last sign-in 24 months - 1 day ago; P2 delete: 24 months + 1 day; P3 delete: never signed in, created 24 months + 1 day ago;
-- P4 keep: never signed in, created 1 day ago; P5 keep: created long ago but signed in yesterday.
select t.mkuser('11111111-0000-4000-8000-000000000001', now() - interval '30 months', now() - public.fenomen_cfg_inactive_interval() + interval '1 day');
select t.mkuser('11111111-0000-4000-8000-000000000002', now() - interval '30 months', now() - public.fenomen_cfg_inactive_interval() - interval '1 day');
select t.mkuser('11111111-0000-4000-8000-000000000003', now() - public.fenomen_cfg_inactive_interval() - interval '1 day', null);
select t.mkuser('11111111-0000-4000-8000-000000000004', now() - interval '1 day', null);
select t.mkuser('11111111-0000-4000-8000-000000000005', now() - interval '40 months', now() - interval '1 day');
insert into public.fenomen_saves (user_id, data) select id, '{"v":2}' from auth.users where id::text like '11111111-0000-4000-8000-%';
insert into public.fenomen_save_backups (user_id, revision, save_version, data)
  select u.id, 1, 1, '{"v":2}' from auth.users u, generate_series(1, 2) where u.id::text like '11111111-0000-4000-8000-%';
-- audit rows for the purge: P2 by actor_id, P3 only by traits.user_id, P1 (kept) as actor about P2 (-> deleted via traits = P2);
-- kept: P1's own row, P5 by traits (admin action about P5), and B's rows from the D block.
insert into auth.audit_log_entries (id, payload, created_at) values
  ('c0000000-0000-4000-8000-000000000002', json_build_object('actor_id', '11111111-0000-4000-8000-000000000002', 'action', 'login'), now() - interval '25 months'),
  ('c0000000-0000-4000-8000-000000000003', json_build_object('actor_id', '00000000-0000-0000-0000-000000000000', 'action', 'user_signedup',
                                                              'traits', json_build_object('user_id', '11111111-0000-4000-8000-000000000003')), now() - interval '25 months'),
  ('c0000000-0000-4000-8000-000000000012', json_build_object('actor_id', '11111111-0000-4000-8000-000000000001', 'action', 'user_modified',
                                                              'traits', json_build_object('user_id', '11111111-0000-4000-8000-000000000002')), now()),
  ('d0000000-0000-4000-8000-000000000001', json_build_object('actor_id', '11111111-0000-4000-8000-000000000001', 'action', 'login'), now()),
  ('d0000000-0000-4000-8000-000000000005', json_build_object('actor_id', '00000000-0000-0000-0000-000000000000', 'action', 'user_modified',
                                                              'traits', json_build_object('user_id', '11111111-0000-4000-8000-000000000005')), now());
-- FK-less auth rows: P2 (purged) and P1 (kept) each get a refresh token without session and a flow_state row
insert into auth.refresh_tokens (token, user_id, session_id, revoked) values
  ('fd-nosess-p2', '11111111-0000-4000-8000-000000000002', null, true), ('fd-nosess-p1', '11111111-0000-4000-8000-000000000001', null, true);
insert into auth.flow_state (id, user_id, auth_code, code_challenge) values
  ('f0000000-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000002', 'code-p2', 'ch-p2'),
  ('f0000000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'code-p1', 'ch-p1');
select t.login(:B);
select t.throws($$select * from public.fenomen_purge_inactive_accounts()$$, '42501: permission denied for function fenomen_purge_inactive_accounts', 'P01 authenticated cannot call the purge');
select t.logout();
