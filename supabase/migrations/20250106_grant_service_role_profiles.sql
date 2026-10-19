-- Migration: 20250106_grant_service_role_profiles.sql
-- Grant minimal necessary privileges for trusted server-side / service_role scripts
-- to manage profiles table without modifying RLS or public/anon roles.

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;
