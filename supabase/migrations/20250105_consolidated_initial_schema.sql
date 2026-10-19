-- ==============================================================================
-- MCA Memories 2025–2027 Yearbook Database Setup
-- File: supabase/migrations/20250105_consolidated_initial_schema.sql
-- Description: Clean, consolidated, non-destructive initial schema migration.
-- Designed for a brand-new, empty Supabase project (or safe re-run).
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. APPLICATION TABLES
-- ==============================================================================

-- 2.1 PROFILES TABLE
-- Directly mapped to Supabase auth.users(id)
-- Note: Passwords reside securely in auth.users; never in profiles.
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    roll_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'student')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_profiles_roll_number ON profiles (UPPER(roll_number));
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_active ON profiles (is_active);

-- 2.2 QUESTIONS TABLE
-- 72 Yearbook Memory Questions
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_number INT UNIQUE NOT NULL CHECK (question_number BETWEEN 1 AND 72),
    question_text TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_questions_number ON questions (question_number);
CREATE INDEX IF NOT EXISTS idx_questions_active ON questions (is_active);

-- 2.3 STUDENT QUESTION ORDER TABLE
-- Persists randomized question presentation order per student
CREATE TABLE IF NOT EXISTS student_question_order (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    respondent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    question_position INT NOT NULL CHECK (question_position BETWEEN 1 AND 72),
    is_marked_for_review BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_respondent_question UNIQUE (respondent_id, question_id),
    CONSTRAINT uq_respondent_position UNIQUE (respondent_id, question_position)
);

-- Safe partial-run migration helper:
-- If student_question_order was already created in a prior run with column "position", rename it safely
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'student_question_order' 
          AND column_name = 'position'
    ) THEN
        ALTER TABLE student_question_order RENAME COLUMN "position" TO question_position;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_respondent_position'
    ) THEN
        ALTER TABLE student_question_order DROP CONSTRAINT uq_respondent_position;
        ALTER TABLE student_question_order ADD CONSTRAINT uq_respondent_position UNIQUE (respondent_id, question_position);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_student_qorder_respondent ON student_question_order (respondent_id);
DROP INDEX IF EXISTS idx_student_qorder_position;
CREATE INDEX IF NOT EXISTS idx_student_qorder_position ON student_question_order (respondent_id, question_position);


-- 2.4 ANSWERS TABLE
-- Validations:
-- Rule A: One answer per respondent per question (uq_answers_respondent_question)
-- Rule B: A classmate cannot be reused across questions by the same respondent (uq_answers_respondent_classmate)
-- Rule C: No self-selection (chk_no_self_selection)
CREATE TABLE IF NOT EXISTS answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    respondent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    selected_student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_answers_respondent_question UNIQUE (respondent_id, question_id),
    CONSTRAINT uq_answers_respondent_classmate UNIQUE (respondent_id, selected_student_id),
    CONSTRAINT chk_no_self_selection CHECK (selected_student_id <> respondent_id)
);

CREATE INDEX IF NOT EXISTS idx_answers_respondent ON answers (respondent_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers (question_id);
CREATE INDEX IF NOT EXISTS idx_answers_selected_student ON answers (selected_student_id);

-- 2.5 SUBMISSIONS TABLE
-- Final locked questionnaire submissions (Rule D: minimum 59 answers required)
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    answer_count INT NOT NULL CHECK (answer_count >= 59),
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reopened')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions (student_id);

-- ==============================================================================
-- 3. TRIGGERS & INTEGRITY HELPERS
-- ==============================================================================

-- 3.1 Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_questions_updated_at ON questions;
CREATE TRIGGER trg_questions_updated_at
    BEFORE UPDATE ON questions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_answers_updated_at ON answers;
CREATE TRIGGER trg_answers_updated_at
    BEFORE UPDATE ON answers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 3.2 Validate that both respondent and selected classmate are registered student profiles
CREATE OR REPLACE FUNCTION check_answer_students()
RETURNS TRIGGER AS $$
DECLARE
    v_resp_role TEXT;
    v_selected_role TEXT;
BEGIN
    SELECT role INTO v_resp_role FROM profiles WHERE id = NEW.respondent_id;
    SELECT role INTO v_selected_role FROM profiles WHERE id = NEW.selected_student_id;

    IF v_resp_role IS NULL OR v_resp_role <> 'student' THEN
        RAISE EXCEPTION 'Respondent must be a registered student profile.';
    END IF;

    IF v_selected_role IS NULL OR v_selected_role <> 'student' THEN
        RAISE EXCEPTION 'Selected classmate must be a registered student profile.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_answer_students ON answers;
CREATE TRIGGER trg_validate_answer_students
    BEFORE INSERT OR UPDATE ON answers
    FOR EACH ROW
    EXECUTE FUNCTION check_answer_students();

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_question_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- 4.1 Trusted Admin Role Check (Security Definer with controlled search_path prevents RLS recursion)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

-- 4.2 Role Escalation Database Safeguard
-- Prevents any non-admin from modifying the 'role' column on profiles
CREATE OR REPLACE FUNCTION check_profile_role_update()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role <> OLD.role AND NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: User role modification is restricted to administrators.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON profiles;
CREATE TRIGGER trg_protect_profile_role
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION check_profile_role_update();

-- 4.3 PROFILES POLICIES
DROP POLICY IF EXISTS "View student profiles or self" ON profiles;
CREATE POLICY "View student profiles or self"
    ON profiles FOR SELECT
    TO authenticated
    USING (role = 'student' OR id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Users can update own profile non-role fields" ON profiles;
CREATE POLICY "Users can update own profile non-role fields"
    ON profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid() OR is_admin())
    WITH CHECK (
        (is_admin()) 
        OR (id = auth.uid() AND role = 'student')
    );

DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
CREATE POLICY "Admins can insert profiles"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
CREATE POLICY "Admins can delete profiles"
    ON profiles FOR DELETE
    TO authenticated
    USING (is_admin());

-- 4.3 QUESTIONS POLICIES
DROP POLICY IF EXISTS "View active questions or admin view all" ON questions;
CREATE POLICY "View active questions or admin view all"
    ON questions FOR SELECT
    TO authenticated
    USING (is_active = true OR is_admin());

DROP POLICY IF EXISTS "Admins can manage questions" ON questions;
CREATE POLICY "Admins can manage questions"
    ON questions FOR ALL
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- 4.4 STUDENT QUESTION ORDER POLICIES
DROP POLICY IF EXISTS "Students can view their own question order" ON student_question_order;
CREATE POLICY "Students can view their own question order"
    ON student_question_order FOR SELECT
    TO authenticated
    USING (respondent_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Students can insert their own question order" ON student_question_order;
CREATE POLICY "Students can insert their own question order"
    ON student_question_order FOR INSERT
    TO authenticated
    WITH CHECK (respondent_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Students can update their review markers" ON student_question_order;
CREATE POLICY "Students can update their review markers"
    ON student_question_order FOR UPDATE
    TO authenticated
    USING (respondent_id = auth.uid() OR is_admin())
    WITH CHECK (respondent_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Admins or students can reset question order" ON student_question_order;
CREATE POLICY "Admins or students can reset question order"
    ON student_question_order FOR DELETE
    TO authenticated
    USING (respondent_id = auth.uid() OR is_admin());

-- 4.5 ANSWERS POLICIES
-- Critical Security: A student can only view their own answers; never other students' answers
DROP POLICY IF EXISTS "Students can view their own answers" ON answers;
CREATE POLICY "Students can view their own answers"
    ON answers FOR SELECT
    TO authenticated
    USING (respondent_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Students can insert draft answers before submission" ON answers;
CREATE POLICY "Students can insert draft answers before submission"
    ON answers FOR INSERT
    TO authenticated
    WITH CHECK (
        respondent_id = auth.uid()
        AND (SELECT is_active FROM profiles WHERE id = auth.uid()) = true
        AND NOT EXISTS (SELECT 1 FROM submissions WHERE student_id = auth.uid())
    );

DROP POLICY IF EXISTS "Students can update draft answers before submission" ON answers;
CREATE POLICY "Students can update draft answers before submission"
    ON answers FOR UPDATE
    TO authenticated
    USING (
        respondent_id = auth.uid()
        AND (SELECT is_active FROM profiles WHERE id = auth.uid()) = true
        AND NOT EXISTS (SELECT 1 FROM submissions WHERE student_id = auth.uid())
    )
    WITH CHECK (
        respondent_id = auth.uid()
        AND NOT EXISTS (SELECT 1 FROM submissions WHERE student_id = auth.uid())
    );

DROP POLICY IF EXISTS "Students can delete draft answers before submission" ON answers;
CREATE POLICY "Students can delete draft answers before submission"
    ON answers FOR DELETE
    TO authenticated
    USING (
        respondent_id = auth.uid()
        AND NOT EXISTS (SELECT 1 FROM submissions WHERE student_id = auth.uid())
    );

-- 4.6 SUBMISSIONS POLICIES
DROP POLICY IF EXISTS "Students can view own submission and admins view all" ON submissions;
CREATE POLICY "Students can view own submission and admins view all"
    ON submissions FOR SELECT
    TO authenticated
    USING (student_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Students can create own submission" ON submissions;
CREATE POLICY "Students can create own submission"
    ON submissions FOR INSERT
    TO authenticated
    WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Admins can update submissions" ON submissions;
CREATE POLICY "Admins can update submissions"
    ON submissions FOR UPDATE
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can delete submissions" ON submissions;
CREATE POLICY "Admins can delete submissions"
    ON submissions FOR DELETE
    TO authenticated
    USING (is_admin());

-- ==============================================================================
-- 5. ATOMIC SECURE DATABASE FUNCTIONS (RPCs)
-- ==============================================================================

-- 5.1 Initialize or retrieve persistent randomized question order exactly once
CREATE OR REPLACE FUNCTION get_or_create_student_question_order(p_student_id UUID DEFAULT NULL)
RETURNS TABLE (
    order_id UUID,
    question_id UUID,
    question_number INT,
    question_text TEXT,
    description TEXT,
    question_position INT,
    is_marked_for_review BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_existing_count INT;
    v_is_active BOOLEAN;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Only admins may view other student orders; students always access their own
    IF p_student_id IS NOT NULL AND p_student_id <> v_user_id THEN
        IF NOT is_admin() THEN
            v_user_id := auth.uid();
        ELSE
            v_user_id := p_student_id;
        END IF;
    END IF;

    -- Verify active student profile
    SELECT is_active INTO v_is_active FROM profiles WHERE id = v_user_id;
    IF v_is_active IS NULL OR NOT v_is_active THEN
        RAISE EXCEPTION 'Student account is disabled or does not exist.';
    END IF;

    -- Concurrency Protection: Acquire transactional advisory lock per student
    PERFORM pg_advisory_xact_lock(hashtext('qorder_' || v_user_id::text));

    -- Check if student already has exactly 72 ordered questions
    SELECT COUNT(*) INTO v_existing_count
    FROM student_question_order
    WHERE respondent_id = v_user_id;

    IF v_existing_count < 72 THEN
        DELETE FROM student_question_order WHERE respondent_id = v_user_id;

        -- Insert all 72 active questions in a distinct randomized sequence
        INSERT INTO student_question_order (respondent_id, question_id, question_position, is_marked_for_review)
        SELECT 
            v_user_id,
            q.id,
            row_number() OVER (ORDER BY random())::INT as question_position,
            false
        FROM questions q
        WHERE q.is_active = true
        ORDER BY random()
        LIMIT 72;
    END IF;

    RETURN QUERY
    SELECT 
        sqo.id AS order_id,
        q.id AS question_id,
        q.question_number,
        q.question_text,
        q.description,
        sqo.question_position,
        sqo.is_marked_for_review
    FROM student_question_order sqo
    JOIN questions q ON q.id = sqo.question_id
    WHERE sqo.respondent_id = v_user_id
    ORDER BY sqo.question_position ASC;
END;
$$;


-- 5.2 Save or change an answer atomically
CREATE OR REPLACE FUNCTION save_student_answer(
    p_question_id UUID,
    p_selected_student_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_is_active BOOLEAN;
    v_resp_role TEXT;
    v_target_role TEXT;
    v_target_active BOOLEAN;
    v_submitted BOOLEAN;
    v_existing_question_for_classmate UUID;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Concurrency lock on student answers to prevent race conditions
    PERFORM pg_advisory_xact_lock(hashtext('ans_' || v_user_id::text));

    -- Rule C: Rejects self-selection
    IF p_selected_student_id = v_user_id THEN
        RAISE EXCEPTION 'Rule C: A student cannot select themselves.';
    END IF;

    -- Prevent changes after final submission
    SELECT EXISTS (SELECT 1 FROM submissions WHERE student_id = v_user_id) INTO v_submitted;
    IF v_submitted THEN
        RAISE EXCEPTION 'Questionnaire is locked after final submission.';
    END IF;

    -- Check respondent account status
    SELECT is_active, role INTO v_is_active, v_resp_role FROM profiles WHERE id = v_user_id;
    IF NOT v_is_active OR v_resp_role <> 'student' THEN
        RAISE EXCEPTION 'Only active students can submit answers.';
    END IF;

    -- Check selected classmate account status
    SELECT is_active, role INTO v_target_active, v_target_role FROM profiles WHERE id = p_selected_student_id;
    IF v_target_role IS NULL OR v_target_role <> 'student' THEN
        RAISE EXCEPTION 'Selected classmate must be a valid registered student profile.';
    END IF;

    -- Rule B: Classmate cannot be selected for a different question
    SELECT question_id INTO v_existing_question_for_classmate
    FROM answers
    WHERE respondent_id = v_user_id 
      AND selected_student_id = p_selected_student_id
      AND question_id <> p_question_id;

    IF v_existing_question_for_classmate IS NOT NULL THEN
        RAISE EXCEPTION 'Rule B: Classmate is already selected for another question.';
    END IF;

    -- Rule A: One answer per question. Upsert answer atomically
    INSERT INTO answers (respondent_id, question_id, selected_student_id, updated_at)
    VALUES (v_user_id, p_question_id, p_selected_student_id, timezone('utc'::text, now()))
    ON CONFLICT (respondent_id, question_id)
    DO UPDATE SET 
        selected_student_id = EXCLUDED.selected_student_id,
        updated_at = timezone('utc'::text, now());

    RETURN jsonb_build_object('success', true, 'message', 'Answer saved successfully');
END;
$$;

-- 5.3 Unselect an answer atomically
CREATE OR REPLACE FUNCTION unselect_student_answer(p_question_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_has_submission BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('ans_' || v_user_id::text));

    -- Check final submission status
    SELECT EXISTS (SELECT 1 FROM submissions WHERE student_id = v_user_id) INTO v_has_submission;
    IF v_has_submission THEN
        RAISE EXCEPTION 'Questionnaire is locked after final submission.';
    END IF;

    DELETE FROM answers 
    WHERE respondent_id = v_user_id AND question_id = p_question_id;

    RETURN jsonb_build_object('success', true, 'message', 'Answer unselected successfully');
END;
$$;

-- 5.4 Mark or unmark a question for review
CREATE OR REPLACE FUNCTION toggle_student_question_review(
    p_question_id UUID,
    p_is_marked BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    UPDATE student_question_order
    SET is_marked_for_review = p_is_marked
    WHERE respondent_id = v_user_id AND question_id = p_question_id;

    RETURN jsonb_build_object('success', true, 'is_marked_for_review', p_is_marked);
END;
$$;

-- 5.5 Final submission with atomic validation (enforces minimum 59 valid answers)
CREATE OR REPLACE FUNCTION submit_questionnaire()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_answer_count INT;
    v_distinct_classmates INT;
    v_self_select_count INT;
    v_submission_record submissions%ROWTYPE;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required for submission.';
    END IF;

    -- Concurrency lock
    PERFORM pg_advisory_xact_lock(hashtext('sub_' || v_user_id::text));

    -- Idempotency check: if already submitted, return existing record
    SELECT * INTO v_submission_record FROM submissions WHERE student_id = v_user_id;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'id', v_submission_record.id,
            'status', 'already_submitted',
            'submitted_at', v_submission_record.submitted_at,
            'answer_count', v_submission_record.answer_count
        );
    END IF;

    -- Count total answers
    SELECT COUNT(*) INTO v_answer_count
    FROM answers
    WHERE respondent_id = v_user_id;

    -- Enforce minimum of 59 valid answers
    IF v_answer_count < 59 THEN
        RAISE EXCEPTION 'A minimum of 59 valid answers is required to submit. You currently have % answers.', v_answer_count;
    END IF;

    -- Rule B: All selected classmates must be distinct
    SELECT COUNT(DISTINCT selected_student_id) INTO v_distinct_classmates
    FROM answers
    WHERE respondent_id = v_user_id;

    IF v_distinct_classmates <> v_answer_count THEN
        RAISE EXCEPTION 'Duplicate classmate selections detected. Each classmate may only be chosen once.';
    END IF;

    -- Rule C: No self-selection
    SELECT COUNT(*) INTO v_self_select_count
    FROM answers
    WHERE respondent_id = v_user_id AND selected_student_id = v_user_id;

    IF v_self_select_count > 0 THEN
        RAISE EXCEPTION 'Self-selection is prohibited.';
    END IF;

    -- Atomic insertion into submissions
    INSERT INTO submissions (student_id, answer_count, status, submitted_at)
    VALUES (v_user_id, v_answer_count, 'submitted', timezone('utc'::text, now()))
    RETURNING * INTO v_submission_record;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_submission_record.id,
        'status', 'submitted',
        'submitted_at', v_submission_record.submitted_at,
        'answer_count', v_submission_record.answer_count
    );
END;
$$;

-- ==============================================================================
-- 6. ADMIN MANAGEMENT PROCEDURES
-- ==============================================================================

-- 6.1 Admin Create Student
CREATE OR REPLACE FUNCTION admin_create_student(
    p_roll_number TEXT,
    p_full_name TEXT,
    p_email TEXT,
    p_user_id UUID,
    p_is_active BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator access required.';
    END IF;

    -- Validate roll number uniqueness
    IF EXISTS (SELECT 1 FROM profiles WHERE UPPER(roll_number) = UPPER(TRIM(p_roll_number))) THEN
        RAISE EXCEPTION 'Roll number % is already registered.', p_roll_number;
    END IF;

    -- Validate email uniqueness
    IF EXISTS (SELECT 1 FROM profiles WHERE LOWER(email) = LOWER(TRIM(p_email))) THEN
        RAISE EXCEPTION 'Email address % is already registered.', p_email;
    END IF;

    INSERT INTO profiles (id, roll_number, full_name, email, role, is_active)
    VALUES (p_user_id, UPPER(TRIM(p_roll_number)), TRIM(p_full_name), LOWER(TRIM(p_email)), 'student', p_is_active);

    RETURN jsonb_build_object('success', true, 'message', 'Student created successfully');
END;
$$;

-- 6.2 Admin Update Student
CREATE OR REPLACE FUNCTION admin_update_student(
    p_student_id UUID,
    p_roll_number TEXT,
    p_full_name TEXT,
    p_email TEXT,
    p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator access required.';
    END IF;

    -- Validate roll number uniqueness if changed
    IF p_roll_number IS NOT NULL AND TRIM(p_roll_number) <> '' AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE UPPER(roll_number) = UPPER(TRIM(p_roll_number)) 
          AND id <> p_student_id
    ) THEN
        RAISE EXCEPTION 'Roll number % is already in use by another student.', p_roll_number;
    END IF;

    -- Validate email uniqueness if changed
    IF p_email IS NOT NULL AND TRIM(p_email) <> '' AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE LOWER(email) = LOWER(TRIM(p_email)) 
          AND id <> p_student_id
    ) THEN
        RAISE EXCEPTION 'Email address % is already in use by another student.', p_email;
    END IF;

    UPDATE profiles
    SET 
        roll_number = CASE WHEN p_roll_number IS NOT NULL AND TRIM(p_roll_number) <> '' THEN UPPER(TRIM(p_roll_number)) ELSE roll_number END,
        full_name = CASE WHEN p_full_name IS NOT NULL AND TRIM(p_full_name) <> '' THEN TRIM(p_full_name) ELSE full_name END,
        email = CASE WHEN p_email IS NOT NULL AND TRIM(p_email) <> '' THEN LOWER(TRIM(p_email)) ELSE email END,
        is_active = p_is_active,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_student_id AND role = 'student';

    RETURN jsonb_build_object('success', true, 'message', 'Student updated successfully');
END;
$$;

-- 6.3 Admin Safe Delete Student
CREATE OR REPLACE FUNCTION admin_delete_student(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_submission BOOLEAN;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator access required.';
    END IF;

    SELECT EXISTS (SELECT 1 FROM submissions WHERE student_id = p_student_id) INTO v_has_submission;
    IF v_has_submission THEN
        UPDATE profiles SET is_active = false, updated_at = timezone('utc'::text, now()) WHERE id = p_student_id;
        RETURN jsonb_build_object(
            'success', true, 
            'soft_deleted', true, 
            'message', 'Student has an active final submission. Account was safely deactivated to preserve yearbook records.'
        );
    END IF;

    DELETE FROM answers WHERE respondent_id = p_student_id OR selected_student_id = p_student_id;
    DELETE FROM student_question_order WHERE respondent_id = p_student_id;
    DELETE FROM profiles WHERE id = p_student_id AND role = 'student';

    RETURN jsonb_build_object('success', true, 'soft_deleted', false, 'message', 'Student account removed.');
END;
$$;

-- 6.4 Admin Safe Delete Question
CREATE OR REPLACE FUNCTION admin_delete_question(p_question_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_answer_count INT;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator access required.';
    END IF;

    SELECT COUNT(*) INTO v_answer_count FROM answers WHERE question_id = p_question_id;

    IF v_answer_count > 0 THEN
        UPDATE questions SET is_active = false, updated_at = timezone('utc'::text, now()) WHERE id = p_question_id;
        RETURN jsonb_build_object(
            'success', true, 
            'archived', true, 
            'message', 'Question has saved responses in submissions. It was deactivated to preserve student selections.'
        );
    END IF;

    DELETE FROM student_question_order WHERE question_id = p_question_id;
    DELETE FROM questions WHERE id = p_question_id;

    RETURN jsonb_build_object('success', true, 'archived', false, 'message', 'Question deleted successfully.');
END;
$$;

-- ==============================================================================
-- 7. PERMISSIONS & GRANTS
-- ==============================================================================

GRANT USAGE ON SCHEMA public TO authenticated, anon;

-- Specific DML permissions:
-- RLS policies control row-level visibility and write operations
GRANT SELECT, UPDATE ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON student_question_order, answers, submissions TO authenticated;

GRANT EXECUTE ON FUNCTION is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_student_question_order TO authenticated;
GRANT EXECUTE ON FUNCTION save_student_answer TO authenticated;
GRANT EXECUTE ON FUNCTION unselect_student_answer TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_student_question_review TO authenticated;
GRANT EXECUTE ON FUNCTION submit_questionnaire TO authenticated;
GRANT EXECUTE ON FUNCTION admin_create_student TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_student TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_student TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_question TO authenticated;
