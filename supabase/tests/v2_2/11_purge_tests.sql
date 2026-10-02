-- run after 10_tests.sql AND after the runner saved the read-only count (ops/inactive_accounts_count.sql) into t.count_before
\set ON_ERROR_STOP 0
select t.as_service();
create temp table purge_out as select * from public.fenomen_purge_inactive_accounts();
select t.logout();
select t.ok((select accounts = 2 and saves = 2 and backups = 4 and audit_entries = 3 and remaining = 0 from purge_out), 'P02 purge deletes 2 accounts, 2 saves, 4 backups, 3 audit rows; 0 remaining',
            (select row_to_json(p)::text from purge_out p));
select t.ok((select c.accounts_to_delete = p.accounts and c.saves_to_delete = p.saves and c.backups_to_delete = p.backups and c.audit_entries_to_delete = p.audit_entries and c.accounts_first_run = p.accounts
               from t.count_before c, purge_out p), 'P03 read-only count query == what the purge actually deleted',
            (select row_to_json(c)::text from t.count_before c));
select t.ok((select count(*) from auth.users where id in ('11111111-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003')) = 0,
            'P04 last_sign_in 24 months + 1 day ago and never-signed-in created 24 months + 1 day ago: deleted');
select t.ok((select count(*) from auth.users where id in ('11111111-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000005')) = 3,
            'P05 last_sign_in 24 months - 1 day ago, never-signed-in created yesterday, old account signed in yesterday: kept');
select t.ok((select count(*) from public.fenomen_saves where user_id in ('11111111-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003'))
          + (select count(*) from public.fenomen_save_backups where user_id in ('11111111-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003'))
          + (select count(*) from auth.identities where user_id in ('11111111-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003'))
          + (select count(*) from auth.sessions where user_id in ('11111111-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003')) = 0,
            'P06 deleted accounts'' saves, backups, identities, sessions are gone');
select t.ok((select count(*) from public.fenomen_saves where user_id in ('11111111-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000005')) = 3
        and (select count(*) from public.fenomen_save_backups where user_id in ('11111111-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000004', '11111111-0000-4000-8000-000000000005')) = 6
        and (select count(*) from public.fenomen_saves where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 1,
            'P07 other accounts untouched (3 saves + 6 backups of the kept ones, B''s save)');
select t.ok((select count(*) from auth.audit_log_entries where id::text like 'c0000000-%') = 0,
            'P07a purged users'' audit rows gone: P2 by actor_id, P3 by traits.user_id, P1''s row about P2 by traits.user_id');
select t.ok((select count(*) from auth.audit_log_entries where id::text like 'd0000000-%') = 2 and (select count(*) from auth.audit_log_entries where id::text like 'b0000000-%') = 6,
            'P07b kept users'' audit rows untouched (P1 own row, admin row about P5, B/C/odd rows from the D block)');
select t.ok((select count(*) from auth.refresh_tokens where token = 'fd-nosess-p2') = 0 and (select count(*) from auth.flow_state where id = 'f0000000-0000-4000-8000-000000000002') = 0,
            'P07c purged user''s FK-less auth rows gone: refresh token without session, flow_state');
select t.ok((select count(*) from auth.refresh_tokens where token = 'fd-nosess-p1') = 1 and (select count(*) from auth.flow_state where id = 'f0000000-0000-4000-8000-000000000001') = 1
            and (select count(*) from auth.refresh_tokens where token = 'fd-nosess-b') = 1,
            'P07d kept users'' refresh tokens without session and flow_state untouched (P1, B)');
select t.as_service();
select t.ok((select accounts = 0 and audit_entries = 0 and remaining = 0 from public.fenomen_purge_inactive_accounts()), 'P08 second purge run: nothing to delete');
select t.logout();
-- batch cap: 105 inactive accounts -> one run deletes 100 (fenomen_cfg_purge_batch_max), p_limit 1000 is capped too
insert into auth.users (id, email, created_at, last_sign_in_at)
  select gen_random_uuid(), 'bulk' || g || '@v22-test.invalid', now() - interval '5 years', now() - interval '3 years' from generate_series(1, 105) g;
select t.as_service();
select t.ok((select accounts = 100 and remaining = 5 from public.fenomen_purge_inactive_accounts(1000)), 'P09 batch cap: 105 candidates, p_limit 1000 -> 100 deleted, 5 remaining');
select t.ok((select accounts = 2 and remaining = 3 from public.fenomen_purge_inactive_accounts(2)), 'P10 p_limit 2 -> 2 deleted, 3 remaining');
select t.ok((select accounts = 3 and remaining = 0 from public.fenomen_purge_inactive_accounts()), 'P11 default run finishes the rest');
select t.logout();
select t.ok((select count(*) from auth.users where email like 'bulk%') = 0 and (select count(*) from auth.users where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 1,
            'P12 all bulk accounts gone, B still there');
