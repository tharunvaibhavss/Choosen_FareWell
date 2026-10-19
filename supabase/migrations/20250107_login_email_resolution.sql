-- ==============================================================================
-- Migration: 20250107_login_email_resolution.sql
-- Description: Adds secure canonical email lookup function for student login.
-- Allows unauthenticated (anon) and authenticated users to resolve their
-- canonical profile email by roll number securely without exposing the profiles table.
-- ==============================================================================

CREATE OR REPLACE FUNCTION get_login_email_for_roll(p_roll_number TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
BEGIN
    IF p_roll_number IS NULL OR TRIM(p_roll_number) = '' THEN
        RETURN NULL;
    END IF;

    SELECT email INTO v_email
    FROM profiles
    WHERE UPPER(TRIM(roll_number)) = UPPER(TRIM(p_roll_number))
      AND is_active = true
    LIMIT 1;

    RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION get_login_email_for_roll(TEXT) TO anon, authenticated, service_role;
