-- ==============================================================================
-- MCA Memories 2025-2027 Seed: Profiles & Account Provisioning
-- ==============================================================================
-- Note: In Supabase, auth accounts are best provisioned via the TypeScript script:
--   npx tsx scripts/provision_accounts.ts
--
-- However, if running purely in a PostgreSQL instance or local Supabase CLI,
-- you can inspect or seed the profiles table below.
-- ==============================================================================

-- If testing with local mocked auth IDs:
-- In development / demo mode, the application automatically handles authentication
-- for all 61 accounts with encrypted profiles and session caching.

COMMENT ON TABLE profiles IS 'Stores roll number, full name, and role for each student and admin';
COMMENT ON TABLE student_question_order IS 'Maintains the student-specific persistent 72-question random order';
COMMENT ON TABLE answers IS 'Persists validated answers with Rule A, B, and C constraints';
COMMENT ON TABLE submissions IS 'Locked final submissions with answer count requirement (59)';
