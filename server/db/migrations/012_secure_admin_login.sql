-- Removes the weak, guessable admin credential entirely. Two things relied
-- on the literal password '1996': the admin@taskora.com account's real
-- password, and auth.routes.js's separate hardcoded "admin"/"1996" bypass
-- (removed in this same change, in code). This migration replaces the
-- account's password hash with a strong, randomly-generated one -- login
-- now goes through the normal email+password flow only, same as any other
-- account, with no shortcut. The Admin link in the nav menu is unaffected;
-- it only ever checked users.role = 'admin', which this does not touch.
--
-- Matches by role = 'admin' (whatever its email), following migration
-- 010's approach, rather than hardcoding a specific address.
UPDATE users
   SET password_hash = '$2a$12$cGh20ebh4AgZQKz4FisgAeAQV3dqxx2V4sZBQyQ4PHlAZJtr/IXpW'
 WHERE role = 'admin';
