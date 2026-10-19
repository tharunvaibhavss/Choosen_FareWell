-- ==============================================================================
-- Migration: 20250112_protect_reset_flag_service_role.sql
-- Description: Allows service_role and admins to update first_login_reset_completed
-- while continuing to strictly block regular students from modifying it directly.
-- ==============================================================================

CREATE OR REPLACE FUNCTION protect_profile_reset_flag()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.first_login_reset_completed <> OLD.first_login_reset_completed 
        OR NEW.first_login_reset_at IS DISTINCT FROM OLD.first_login_reset_at) 
       AND NOT is_admin() 
       AND (auth.jwt()->>'role') IS DISTINCT FROM 'service_role'
       AND current_user NOT IN ('postgres', 'supabase_admin')
       AND current_setting('mca.in_reset_rpc', true) IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Unauthorized: Reset status modification is restricted to system procedures.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
