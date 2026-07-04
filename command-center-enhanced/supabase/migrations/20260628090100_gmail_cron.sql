-- Gmail integration · nightly purge schedule (pg_cron)
-- Separate migration so the core schema lands even if cron needs a retry.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

-- idempotent (re)schedule of the daily purge at 04:00 UTC
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-email-cache') then
    perform cron.unschedule('purge-email-cache');
  end if;
end $$;

select cron.schedule('purge-email-cache', '0 4 * * *', $$ select public.purge_email_cache(); $$);
