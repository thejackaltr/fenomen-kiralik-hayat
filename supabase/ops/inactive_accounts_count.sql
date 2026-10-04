-- =====================================================================================================
-- SALT OKUNUR SAYIM — 24 ay hareketsiz hesap temizliği (fenomen_purge_inactive_accounts) ÖNCESİ.
-- Yalnız SELECT. E-posta, id ya da başka kişisel veri GÖSTERMEZ; yalnız sayılar.
-- Ölçüt, temizlikle BİREBİR aynı: coalesce(u.last_sign_in_at, u.created_at) < public._fenomen_inactive_cutoff()
--   (= now() - public.fenomen_cfg_inactive_interval(), yani 24 ay; değer tek yerde).
-- Çalıştırma (postgres):  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/ops/inactive_accounts_count.sql
-- (Salt okunurluk kanıtı için: PGOPTIONS='-c default_transaction_read_only=on' ile çalıştırın.)
-- =====================================================================================================
with cfg as (
  select public.fenomen_cfg_inactive_interval() as inactive_interval,
         public._fenomen_inactive_cutoff()      as cutoff,
         public.fenomen_cfg_purge_batch_max()   as batch_max
), cand as (
  select u.id from auth.users u, cfg
   where coalesce(u.last_sign_in_at, u.created_at) < cfg.cutoff
)
select cfg.inactive_interval                                                         as inactive_interval,
       cfg.cutoff                                                                     as cutoff_utc,
       (select count(*) from auth.users)                                              as accounts_total,
       (select count(*) from cand)                                                    as accounts_to_delete,
       (select count(*) from public.fenomen_saves s where s.user_id in (select id from cand))        as saves_to_delete,
       (select count(*) from public.fenomen_save_backups b where b.user_id in (select id from cand)) as backups_to_delete,
       -- GoTrue denetim kayıtları: _fenomen_delete_user ile aynı eşleşme (payload actor_id VEYA traits.user_id). Yalnız sayı.
       (select count(*) from auth.audit_log_entries a where exists (select 1 from cand c
          where lower(a.payload ->> 'actor_id') = c.id::text or lower(a.payload -> 'traits' ->> 'user_id') = c.id::text)) as audit_entries_to_delete,
       cfg.batch_max                                                                  as batch_max_per_run,
       least((select count(*) from cand), cfg.batch_max)                              as accounts_first_run,
       -- bilgi (silme ölçütünde YOK): adaylardan bu süre içinde oturumu yenilenmiş ya da kaydı güncellenmiş olanlar.
       -- 0 değilse: last_sign_in_at yalnız girişte değişir; oturumu açık kalan aktif oyuncu aday olabilir. Onaydan önce bakın.
       (select count(*) from cand c where exists (select 1 from auth.sessions se where se.user_id = c.id and se.updated_at >= cfg.cutoff))
                                                                                      as candidates_with_recent_session,
       (select count(*) from cand c where exists (select 1 from public.fenomen_saves s where s.user_id = c.id and s.updated_at >= cfg.cutoff))
                                                                                      as candidates_with_recent_save
  from cfg;
