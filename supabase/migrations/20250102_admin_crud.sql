-- ==============================================================================
-- MCA Memories 2025-2027: Admin CRUD & Question Description Migration
-- ==============================================================================

-- 1. ADD COLUMNS IF NOT PRESENT
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- 2. POLICIES: ADMIN CAN MANAGE PROFILES
CREATE POLICY "Admins can insert profiles"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

CREATE POLICY "Admins can update all profiles"
    ON profiles FOR UPDATE
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "Admins can delete profiles"
    ON profiles FOR DELETE
    TO authenticated
    USING (is_admin());

-- 3. POLICIES: ACTIVE STUDENTS ONLY FOR QUESTIONNAIRE
-- Students who are deactivated cannot insert or update answers
DROP POLICY IF EXISTS "Students can insert their own answers before final submission" ON answers;
CREATE POLICY "Students can insert their own answers before final submission"
    ON answers FOR INSERT
    TO authenticated
    WITH CHECK (
        respondent_id = auth.uid()
        AND (SELECT is_active FROM profiles WHERE id = auth.uid()) = true
        AND NOT EXISTS (SELECT 1 FROM submissions WHERE student_id = auth.uid())
    );

-- 4. ADMIN STORED PROCEDURES (Atomic & Protected)

-- 4.1 Admin Create Student Profile
CREATE OR REPLACE FUNCTION admin_create_student(
    p_roll_number TEXT,
    p_full_name TEXT,
    p_user_id UUID,
    p_is_active BOOLEAN DEFAULT true
)
RETURNS JSONB AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator access required.';
    END IF;

    -- Validate roll number uniqueness
    IF EXISTS (SELECT 1 FROM profiles WHERE UPPER(roll_number) = UPPER(p_roll_number)) THEN
        RAISE EXCEPTION 'Roll number % is already registered.', p_roll_number;
    END IF;

    INSERT INTO profiles (id, roll_number, full_name, role, is_active)
    VALUES (p_user_id, UPPER(p_roll_number), p_full_name, 'student', p_is_active);

    RETURN jsonb_build_object('success', true, 'message', 'Student created successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4.2 Admin Update Student Profile
CREATE OR REPLACE FUNCTION admin_update_student(
    p_student_id UUID,
    p_roll_number TEXT,
    p_full_name TEXT,
    p_is_active BOOLEAN
)
RETURNS JSONB AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator access required.';
    END IF;

    -- Validate roll number uniqueness if changed
    IF EXISTS (
        SELECT 1 FROM profiles 
        WHERE UPPER(roll_number) = UPPER(p_roll_number) 
          AND id <> p_student_id
    ) THEN
        RAISE EXCEPTION 'Roll number % is already in use by another student.', p_roll_number;
    END IF;

    UPDATE profiles
    SET 
        roll_number = UPPER(p_roll_number),
        full_name = p_full_name,
        is_active = p_is_active
    WHERE id = p_student_id AND role = 'student';

    RETURN jsonb_build_object('success', true, 'message', 'Student updated successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4.3 Admin Safe Delete Student
CREATE OR REPLACE FUNCTION admin_delete_student(p_student_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_has_submission BOOLEAN;
    v_answer_count INT;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator access required.';
    END IF;

    -- Check if student has locked submission
    SELECT EXISTS (SELECT 1 FROM submissions WHERE student_id = p_student_id) INTO v_has_submission;
    IF v_has_submission THEN
        -- Instead of hard deleting, deactivate for audit preservation
        UPDATE profiles SET is_active = false WHERE id = p_student_id;
        RETURN jsonb_build_object(
            'success', true, 
            'soft_deleted', true, 
            'message', 'Student has an active final submission. Account was safely deactivated to preserve yearbook integrity.'
        );
    END IF;

    -- If no submission, delete answers and profile safely
    DELETE FROM answers WHERE respondent_id = p_student_id OR selected_student_id = p_student_id;
    DELETE FROM student_question_order WHERE respondent_id = p_student_id;
    DELETE FROM profiles WHERE id = p_student_id AND role = 'student';

    RETURN jsonb_build_object('success', true, 'soft_deleted', false, 'message', 'Student account removed.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4.4 Admin Safe Delete / Archive Question
CREATE OR REPLACE FUNCTION admin_delete_question(p_question_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_answer_count INT;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator access required.';
    END IF;

    SELECT COUNT(*) INTO v_answer_count FROM answers WHERE question_id = p_question_id;

    IF v_answer_count > 0 THEN
        -- Deactivate to prevent breaking historical answers
        UPDATE questions SET is_active = false, updated_at = timezone('utc'::text, now()) WHERE id = p_question_id;
        RETURN jsonb_build_object(
            'success', true, 
            'archived', true, 
            'message', format('Question has %s recorded answer(s). It was safely deactivated and archived.', v_answer_count)
        );
    ELSE
        DELETE FROM student_question_order WHERE question_id = p_question_id;
        DELETE FROM questions WHERE id = p_question_id;
        RETURN jsonb_build_object('success', true, 'archived', false, 'message', 'Question deleted.');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
