-- V2 role foundation. This must be separate because Postgres requires
-- newly added enum values to be committed before use in later statements.

alter type public.user_role add value if not exists 'member';
