-- ==============================================================================
-- MCA Memories 2025-2027: Unselect Support & Email CRUD Migration
-- ==============================================================================

-- 1. ENSURE EMAIL COLUMN AND UNIQUE CONSTRAINT ON PROFILES
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON profiles (LOWER(email)) WHERE email IS NOT NULL;

-- 2. UNSELECT STUDENT ANSWER PROCEDURE (Atomic & Protected)
CREATE OR REPLACE FUNCTION unselect_student_answer(p_question_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_has_submission BOOLEAN;
BEGIN
    -- Check final submission status
    SELECT EXISTS (SELECT 1 FROM submissions WHERE student_id = auth.uid()) INTO v_has_submission;
    IF v_has_submission THEN
        RAISE EXCEPTION 'Questionnaire is locked after final submission.';
    END IF;

    -- Delete respondent's answer for this question
    DELETE FROM answers 
    WHERE respondent_id = auth.uid() AND question_id = p_question_id;

    RETURN jsonb_build_object('success', true, 'message', 'Answer unselected successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. UPDATED ADMIN CREATE STUDENT PROCEDURE (with Unique Email Validation)
CREATE OR REPLACE FUNCTION admin_create_student(
    p_roll_number TEXT,
    p_full_name TEXT,
    p_email TEXT,
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

    -- Validate email uniqueness
    IF p_email IS NOT NULL AND EXISTS (SELECT 1 FROM profiles WHERE LOWER(email) = LOWER(p_email)) THEN
        RAISE EXCEPTION 'Email address % is already registered.', p_email;
    END IF;

    INSERT INTO profiles (id, roll_number, full_name, email, role, is_active)
    VALUES (p_user_id, UPPER(p_roll_number), p_full_name, LOWER(p_email), 'student', p_is_active);

    RETURN jsonb_build_object('success', true, 'message', 'Student created successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. UPDATED ADMIN UPDATE STUDENT PROCEDURE (with Unique Email Validation)
CREATE OR REPLACE FUNCTION admin_update_student(
    p_student_id UUID,
    p_roll_number TEXT,
    p_full_name TEXT,
    p_email TEXT,
    p_is_active BOOLEAN
)
RETURNS JSONB AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator access required.';
    END IF;

    -- Validate roll number uniqueness if changed
    IF p_roll_number IS NOT NULL AND p_roll_number <> '' AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE UPPER(roll_number) = UPPER(p_roll_number) 
          AND id <> p_student_id
    ) THEN
        RAISE EXCEPTION 'Roll number % is already in use by another student.', p_roll_number;
    END IF;

    -- Validate email uniqueness if changed
    IF p_email IS NOT NULL AND p_email <> '' AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE LOWER(email) = LOWER(p_email) 
          AND id <> p_student_id
    ) THEN
        RAISE EXCEPTION 'Email address % is already in use by another student.', p_email;
    END IF;

    UPDATE profiles
    SET 
        roll_number = CASE WHEN p_roll_number <> '' THEN UPPER(p_roll_number) ELSE roll_number END,
        full_name = CASE WHEN p_full_name <> '' THEN p_full_name ELSE full_name END,
        email = CASE WHEN p_email <> '' THEN LOWER(p_email) ELSE email END,
        is_active = p_is_active
    WHERE id = p_student_id AND role = 'student';

    RETURN jsonb_build_object('success', true, 'message', 'Student updated successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
