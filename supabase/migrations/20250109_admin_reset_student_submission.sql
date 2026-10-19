-- ==============================================================================
-- Migration: 20250109_admin_reset_student_submission.sql
-- Description: Adds atomic server-side function to reset an individual student's
-- submission while strictly preserving their account, credentials, question bank,
-- and other students' submissions.
-- ==============================================================================

CREATE OR REPLACE FUNCTION admin_reset_student_submission(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_role TEXT;
    v_student_roll TEXT;
    v_student_name TEXT;
    v_answers_deleted INT := 0;
    v_submission_deleted INT := 0;
BEGIN
    -- 1. Security Check: Only active administrators can invoke this function
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Active administrator privileges required.';
    END IF;

    -- 2. Validate target student existence and role
    SELECT role, roll_number, full_name 
    INTO v_student_role, v_student_roll, v_student_name
    FROM profiles 
    WHERE id = p_student_id;

    IF v_student_role IS NULL THEN
        RAISE EXCEPTION 'Target student profile not found.';
    END IF;

    IF v_student_role <> 'student' THEN
        RAISE EXCEPTION 'Forbidden: Cannot reset non-student accounts.';
    END IF;

    -- 3. Concurrency Lock on this student's submissions and answers
    PERFORM pg_advisory_xact_lock(hashtext('sub_reset_' || p_student_id::text));

    -- 4. Delete the student's submission record (if exists)
    DELETE FROM submissions WHERE student_id = p_student_id;
    GET DIAGNOSTICS v_submission_deleted = ROW_COUNT;

    -- 5. Delete only the student's own submitted and draft answers
    -- (Do NOT delete rows where selected_student_id = p_student_id, as those belong to other classmates)
    DELETE FROM answers WHERE respondent_id = p_student_id;
    GET DIAGNOSTICS v_answers_deleted = ROW_COUNT;

    -- 6. Reset question review markers for this student
    UPDATE student_question_order 
    SET is_marked_for_review = false 
    WHERE respondent_id = p_student_id;

    -- 7. Return atomic execution summary
    RETURN jsonb_build_object(
        'success', true,
        'student_id', p_student_id,
        'roll_number', v_student_roll,
        'full_name', v_student_name,
        'submission_deleted', v_submission_deleted,
        'answers_deleted', v_answers_deleted,
        'message', format('Successfully reset submission for %s (%s). %s answers deleted.', v_student_name, v_student_roll, v_answers_deleted)
    );
END;
$$;

-- Allow authenticated users (checked internally via is_admin) and service_role to execute
GRANT EXECUTE ON FUNCTION admin_reset_student_submission(UUID) TO authenticated, service_role;

-- Add RLS policy allowing authenticated admins to manage answers table if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'answers' 
          AND policyname = 'Admins can delete student answers'
    ) THEN
        CREATE POLICY "Admins can delete student answers"
            ON answers FOR DELETE
            TO authenticated
            USING (is_admin());
    END IF;
END $$;
