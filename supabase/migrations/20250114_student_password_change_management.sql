-- ==============================================================================
-- Migration: 20250114_student_password_change_management.sql
-- Description: Adds must_change_password flag, password_changed_at timestamp,
-- initialization for all 60 students, protective triggers, and secure functions
-- for student password change completion and admin password reset requirement.
-- ==============================================================================

-- 1. Add password change tracking columns to public.profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_must_change_password 
ON profiles (must_change_password) 
WHERE role = 'student';

-- 2. Initialization:
-- All 60 existing students start with must_change_password = true
UPDATE profiles 
SET must_change_password = true,
    password_changed_at = NULL 
WHERE role = 'student';

-- The administrator account does NOT require a first-login password change
UPDATE profiles 
SET must_change_password = false,
    password_changed_at = timezone('utc'::text, now())
WHERE role = 'admin';

-- 3. Protective Trigger: Prevent students from tampering with must_change_password directly
CREATE OR REPLACE FUNCTION protect_profile_password_flags()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.must_change_password <> OLD.must_change_password 
        OR NEW.password_changed_at IS DISTINCT FROM OLD.password_changed_at) 
       AND NOT is_admin() 
       AND COALESCE((auth.jwt()->>'role'), '') <> 'service_role'
       AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
       AND current_setting('mca.in_password_rpc', true) IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Unauthorized: Password status modification is restricted to system procedures.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_profile_password_flags ON profiles;
CREATE TRIGGER trg_protect_profile_password_flags
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION protect_profile_password_flags();

-- 4. Atomic Function: Complete Student Password Change
-- Called after the student successfully updates their password via Supabase Auth
CREATE OR REPLACE FUNCTION complete_student_password_change()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role TEXT;
    v_roll TEXT;
    v_name TEXT;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- Verification: Caller must be authenticated
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Authentication required.';
    END IF;

    SELECT role, roll_number, full_name
    INTO v_role, v_roll, v_name
    FROM profiles
    WHERE id = v_uid;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Profile not found.';
    END IF;

    IF v_role <> 'student' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'skipped_admin',
            'message', 'Admin accounts do not require password change tracking.'
        );
    END IF;

    PERFORM set_config('mca.in_password_rpc', 'true', true);

    UPDATE profiles
    SET must_change_password = false,
        password_changed_at = v_now,
        updated_at = v_now
    WHERE id = v_uid;

    PERFORM set_config('mca.in_password_rpc', 'false', true);

    RETURN jsonb_build_object(
        'success', true,
        'student_id', v_uid,
        'roll_number', v_roll,
        'full_name', v_name,
        'password_changed_at', v_now,
        'message', 'Password change completed successfully.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION complete_student_password_change() TO authenticated, service_role;

-- 5. Atomic Function: Admin Require Password Change on a Student
CREATE OR REPLACE FUNCTION admin_require_password_change(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_roll TEXT;
    v_name TEXT;
BEGIN
    -- Security Check: Caller must be an active administrator
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Active administrator privileges required.';
    END IF;

    SELECT role, roll_number, full_name
    INTO v_role, v_roll, v_name
    FROM profiles
    WHERE id = p_student_id;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Target student profile not found.';
    END IF;

    IF v_role <> 'student' THEN
        RAISE EXCEPTION 'Forbidden: Cannot require password reset on administrator accounts.';
    END IF;

    PERFORM set_config('mca.in_password_rpc', 'true', true);

    UPDATE profiles
    SET must_change_password = true,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_student_id;

    PERFORM set_config('mca.in_password_rpc', 'false', true);

    RETURN jsonb_build_object(
        'success', true,
        'student_id', p_student_id,
        'roll_number', v_roll,
        'full_name', v_name,
        'message', format('Successfully required password reset for %s (%s).', v_name, v_roll)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_require_password_change(UUID) TO authenticated, service_role;
