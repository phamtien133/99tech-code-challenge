-- Runs once, on an empty data volume, via the postgres image initdb hook.
-- Without it `npm test` fails on a clean clone with:
--   database "challenge_test" does not exist
CREATE DATABASE challenge_test;
