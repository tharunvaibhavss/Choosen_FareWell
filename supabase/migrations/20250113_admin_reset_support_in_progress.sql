-- ==============================================================================
-- Migration: 20250113_admin_reset_support_in_progress.sql
-- Description: Updates admin_reset_student_submission to seamlessly support
-- resetting both 'submitted' and 'in_progress' students, clearing saved answers,
-- submission records, review markers, and synchronizing first_login_reset_completed
-- so a fresh restart is never re-wiped on future logins.
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

    -- 4. Bypass flag protection trigger during trusted procedure
    PERFORM set_config('mca.in_reset_rpc', 'true', true);

    -- 5. Delete the student's submission record (if exists)
    DELETE FROM submissions WHERE student_id = p_student_id;
    GET DIAGNOSTICS v_submission_deleted = ROW_COUNT;

    -- 6. Delete only the student's own submitted and draft answers
    -- (Do NOT delete rows where selected_student_id = p_student_id; preserve other students' choices)
    DELETE FROM answers WHERE respondent_id = p_student_id;
    GET DIAGNOSTICS v_answers_deleted = ROW_COUNT;

    -- 7. Reset question review markers for this student
    UPDATE student_question_order 
    SET is_marked_for_review = false 
    WHERE respondent_id = p_student_id;

    -- 8. Synchronize first_login_reset_completed flag so that when this student starts
    -- filling the questionnaire afresh, their new answers are preserved on future logins.
    UPDATE profiles 
    SET first_login_reset_completed = true,
        first_login_reset_at = timezone('utc'::text, now())
    WHERE id = p_student_id;

    INSERT INTO student_one_time_resets (student_id, reset_completed, reset_at, updated_at)
    VALUES (p_student_id, true, timezone('utc'::text, now()), timezone('utc'::text, now()))
    ON CONFLICT (student_id) DO UPDATE
    SET reset_completed = true,
        reset_at = EXCLUDED.reset_at,
        updated_at = EXCLUDED.updated_at;

    PERFORM set_config('mca.in_reset_rpc', 'false', true);

    -- 9. Return atomic execution summary
    RETURN jsonb_build_object(
        'success', true,
        'student_id', p_student_id,
        'roll_number', v_student_roll,
        'full_name', v_student_name,
        'submission_deleted', v_submission_deleted,
        'answers_deleted', v_answers_deleted,
        'message', format('Successfully reset submission and saved answers for %s (%s). %s answers cleared.', v_student_name, v_student_roll, v_answers_deleted)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reset_student_submission(UUID) TO authenticated, service_role;
