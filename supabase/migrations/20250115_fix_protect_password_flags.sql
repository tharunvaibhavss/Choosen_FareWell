-- ==============================================================================
-- Migration: 20250115_fix_protect_password_flags.sql
-- Description: Enforces strict check in protect_profile_password_flags to prevent
-- student client-side tampering with must_change_password and password_changed_at.
-- ==============================================================================

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
