-- Pause the two GHL-pulling cron jobs for the GHL location cutover
-- (re-pointing from "Odin Digital - Tradies" to the main "Odin Digital" location).
-- These would otherwise pull ~36,000 newly imported contacts back into the dialer
-- as fake inbound ad leads. THEY MUST BE RE-ENABLED MANUALLY AFTER THE CUTOVER:
--   select cron.alter_job(5, active := true); select cron.alter_job(16, active := true);
select cron.alter_job(5, active := false);
select cron.alter_job(16, active := false);