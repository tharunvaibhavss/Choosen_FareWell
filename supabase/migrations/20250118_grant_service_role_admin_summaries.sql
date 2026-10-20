-- ==============================================================================
-- Migration: 20250118_grant_service_role_admin_summaries.sql
-- Description: Updates admin_get_student_summaries() authorization to allow
-- both authenticated administrators and service_role callers.
-- ==============================================================================

CREATE OR REPLACE FUNCTION admin_get_student_summaries()
RETURNS TABLE (
    id UUID,
    roll_number TEXT,
    full_name TEXT,
    email TEXT,
    is_active BOOLEAN,
    answered_count BIGINT,
    distinct_choices_count BIGINT,
    submission_status TEXT,
    submitted_at TIMESTAMPTZ,
    must_change_password BOOLEAN,
    password_changed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Security Check: Only active administrators and service_role can invoke this function
    IF NOT is_admin() 
       AND COALESCE((auth.jwt()->>'role'), '') <> 'service_role' 
       AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: Administrator access required.';
    END IF;

    RETURN QUERY
    SELECT 
        p.id,
        p.roll_number,
        p.full_name,
        p.email,
        COALESCE(p.is_active, true) AS is_active,
        COALESCE(ans.ans_count, 0::BIGINT) AS answered_count,
        COALESCE(ans.distinct_count, 0::BIGINT) AS distinct_choices_count,
        s.status AS submission_status,
        s.submitted_at,
        COALESCE(p.must_change_password, true) AS must_change_password,
        p.password_changed_at
    FROM profiles p
    LEFT JOIN (
        SELECT 
            respondent_id,
            COUNT(*)::BIGINT AS ans_count,
            COUNT(DISTINCT selected_student_id)::BIGINT AS distinct_count
        FROM answers
        GROUP BY respondent_id
    ) ans ON ans.respondent_id = p.id
    LEFT JOIN submissions s ON s.student_id = p.id
    WHERE p.role = 'student'
    ORDER BY p.roll_number ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_student_summaries() TO authenticated, service_role;
