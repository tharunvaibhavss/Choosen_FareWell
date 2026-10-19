-- ==============================================================================
-- Migration: 20250110_student_first_login_reset.sql
-- Description: Adds database-backed one-time reset flag for all 60 students and
-- an atomic server-side function to reset questionnaire submissions on first login
-- after deployment.
-- ==============================================================================

-- 1. Add reset tracking columns to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS first_login_reset_completed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS first_login_reset_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_first_login_reset 
ON profiles (first_login_reset_completed) 
WHERE role = 'student';

-- 2. Create dedicated student_one_time_resets table for audit & strict RLS protection
CREATE TABLE IF NOT EXISTS student_one_time_resets (
    student_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    reset_completed BOOLEAN NOT NULL DEFAULT false,
    reset_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE student_one_time_resets ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.student_one_time_resets TO authenticated;
GRANT ALL ON public.student_one_time_resets TO service_role;

-- Students can view only their own reset status; admins can view all
DROP POLICY IF EXISTS "Users can view own reset status" ON student_one_time_resets;
CREATE POLICY "Users can view own reset status"
    ON student_one_time_resets FOR SELECT
    TO authenticated
    USING (student_id = auth.uid() OR is_admin());

-- No direct INSERT/UPDATE/DELETE policies for authenticated users on student_one_time_resets.
-- All state mutations are performed exclusively through the SECURITY DEFINER function.

-- 3. INITIALIZATION: Explicitly initialize all existing students as pending reset (false)
UPDATE profiles 
SET first_login_reset_completed = false,
    first_login_reset_at = NULL 
WHERE role = 'student';

INSERT INTO student_one_time_resets (student_id, reset_completed, reset_at)
SELECT id, false, NULL
FROM profiles
WHERE role = 'student'
ON CONFLICT (student_id) 
DO UPDATE SET 
    reset_completed = false,
    reset_at = NULL,
    updated_at = timezone('utc'::text, now());

-- 4. Safeguard: Prevent non-admin students from directly altering their own reset flag
CREATE OR REPLACE FUNCTION protect_profile_reset_flag()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.first_login_reset_completed <> OLD.first_login_reset_completed 
        OR NEW.first_login_reset_at IS DISTINCT FROM OLD.first_login_reset_at) 
       AND NOT is_admin() 
       AND current_setting('mca.in_reset_rpc', true) IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Unauthorized: Reset status modification is restricted to system procedures.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_profile_reset_flag ON profiles;
CREATE TRIGGER trg_protect_profile_reset_flag
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION protect_profile_reset_flag();

-- 5. ATOMIC ONE-TIME RESET FUNCTION
-- Executed on student login / questionnaire initialization.
-- Safe against concurrent login requests (advisory transaction locks).
CREATE OR REPLACE FUNCTION execute_student_first_login_reset(p_student_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_target_id UUID;
    v_role TEXT;
    v_roll TEXT;
    v_name TEXT;
    v_is_completed BOOLEAN;
    v_answers_deleted INT := 0;
    v_submissions_deleted INT := 0;
BEGIN
    -- 1. Security Check: Caller must be authenticated
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Authentication required.';
    END IF;

    -- 2. Determine target student
    IF p_student_id IS NOT NULL THEN
        IF p_student_id <> v_caller_id AND NOT is_admin() THEN
            RAISE EXCEPTION 'Forbidden: You may only execute a reset for your own student account.';
        END IF;
        v_target_id := p_student_id;
    ELSE
        v_target_id := v_caller_id;
    END IF;

    -- 3. Concurrency Protection: Transaction-scoped advisory lock for this student
    PERFORM pg_advisory_xact_lock(hashtext('first_login_reset_' || v_target_id::text));

    -- 4. Row-level lock and check existing status
    SELECT role, roll_number, full_name, first_login_reset_completed
    INTO v_role, v_roll, v_name, v_is_completed
    FROM profiles
    WHERE id = v_target_id
    FOR UPDATE;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Target student profile not found.';
    END IF;

    -- Admin accounts do not participate in questionnaire resets
    IF v_role <> 'student' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'skipped_admin',
            'message', 'Admin accounts do not require questionnaire submission reset.'
        );
    END IF;

    -- 5. Idempotency Check: If already completed, return immediately without deleting
    IF v_is_completed IS TRUE THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_completed',
            'student_id', v_target_id,
            'roll_number', v_roll,
            'full_name', v_name,
            'message', 'One-time reset has already been completed for this student.'
        );
    END IF;

    -- 6. Perform Deletions atomically within this transaction
    PERFORM set_config('mca.in_reset_rpc', 'true', true);

    -- Delete student's submission record (if exists)
    DELETE FROM submissions WHERE student_id = v_target_id;
    GET DIAGNOSTICS v_submissions_deleted = ROW_COUNT;

    -- Delete only this student's recorded answers
    -- (Never delete answers where selected_student_id = v_target_id; preserve other students' choices)
    DELETE FROM answers WHERE respondent_id = v_target_id;
    GET DIAGNOSTICS v_answers_deleted = ROW_COUNT;

    -- Reset question review markers for this student's 72-question sequence
    UPDATE student_question_order 
    SET is_marked_for_review = false 
    WHERE respondent_id = v_target_id;

    -- 7. Mark reset as completed in both tables
    UPDATE profiles
    SET first_login_reset_completed = true,
        first_login_reset_at = timezone('utc'::text, now())
    WHERE id = v_target_id;

    INSERT INTO student_one_time_resets (student_id, reset_completed, reset_at, updated_at)
    VALUES (v_target_id, true, timezone('utc'::text, now()), timezone('utc'::text, now()))
    ON CONFLICT (student_id) DO UPDATE
    SET reset_completed = true,
        reset_at = EXCLUDED.reset_at,
        updated_at = EXCLUDED.updated_at;

    PERFORM set_config('mca.in_reset_rpc', 'false', true);

    RETURN jsonb_build_object(
        'success', true,
        'status', 'reset_performed',
        'student_id', v_target_id,
        'roll_number', v_roll,
        'full_name', v_name,
        'answers_deleted', v_answers_deleted,
        'submissions_deleted', v_submissions_deleted,
        'message', format('Successfully completed one-time reset for %s (%s).', v_name, v_roll)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION execute_student_first_login_reset(UUID) TO authenticated, service_role;

-- 6. READ-ONLY STATUS CHECK HELPER
CREATE OR REPLACE FUNCTION check_student_first_login_reset(p_student_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_target_id UUID := COALESCE(p_student_id, v_caller_id);
    v_completed BOOLEAN;
    v_at TIMESTAMPTZ;
    v_role TEXT;
BEGIN
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('authenticated', false, 'completed', false);
    END IF;

    IF v_target_id <> v_caller_id AND NOT is_admin() THEN
        RAISE EXCEPTION 'Forbidden: You may only view your own reset status.';
    END IF;

    SELECT role, first_login_reset_completed, first_login_reset_at
    INTO v_role, v_completed, v_at
    FROM profiles
    WHERE id = v_target_id;

    RETURN jsonb_build_object(
        'authenticated', true,
        'student_id', v_target_id,
        'role', v_role,
        'completed', COALESCE(v_completed, false),
        'reset_at', v_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION check_student_first_login_reset(UUID) TO authenticated, service_role;
