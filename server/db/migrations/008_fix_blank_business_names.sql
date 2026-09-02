-- A provider whose "Business info" onboarding step was left blank ended up
-- with business_name = '' (empty string) rather than NULL, because the old
-- PATCH /providers/me handler used `COALESCE($1, business_name)` -- which
-- only treats an actual NULL parameter as "leave this field alone", not an
-- empty string. Every downstream `COALESCE(business_name, display_name)`
-- read then saw a non-NULL (but blank) business_name and never fell back to
-- display_name, so the provider's name rendered blank in the messages list,
-- jobs list, and admin views. The route itself is now fixed to normalize
-- blank strings to NULL before writing; this is the one-time data cleanup
-- for rows already affected in production.
UPDATE providers SET business_name = NULL WHERE business_name = '';
UPDATE providers SET display_name = NULL WHERE display_name = '';
UPDATE providers SET description = NULL WHERE description = '';
UPDATE providers SET business_phone = NULL WHERE business_phone = '';
UPDATE providers SET auto_reply_message = NULL WHERE auto_reply_message = '';
