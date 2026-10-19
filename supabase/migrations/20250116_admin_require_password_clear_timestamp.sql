-- ==============================================================================
-- Migration: 20250116_admin_require_password_clear_timestamp.sql
-- Description: Ensures admin_require_password_change sets must_change_password = true
-- and clears password_changed_at to NULL when requiring a new password change.
-- ==============================================================================

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
    IF NOT is_admin() AND (auth.jwt()->>'role') IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Forbidden: Only administrators can require password reset.';
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
        password_changed_at = NULL,
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
