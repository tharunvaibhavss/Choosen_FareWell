-- ==============================================================================
-- MCA Memories 2025-2027 Yearbook Database Schema
-- Supabase PostgreSQL Migration
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. DROP TABLES IF NEEDED (Clean slate migration)
DROP TABLE IF EXISTS submissions CASCADE;
DROP TABLE IF EXISTS answers CASCADE;
DROP TABLE IF EXISTS student_question_order CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 3. PROFILES TABLE
-- Linked directly to Supabase auth.users
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    roll_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'student')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for quick lookups by roll number and role
CREATE INDEX idx_profiles_roll_number ON profiles(roll_number);
CREATE INDEX idx_profiles_role ON profiles(role);

-- 4. QUESTIONS TABLE
-- Exactly 72 questions
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_number INT UNIQUE NOT NULL CHECK (question_number BETWEEN 1 AND 72),
    question_text TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_questions_number ON questions(question_number);
CREATE INDEX idx_questions_active ON questions(is_active);

-- 5. STUDENT QUESTION ORDER TABLE
-- Persists randomized question order for each student
-- Ensures refresh / re-login does not reshuffle
CREATE TABLE student_question_order (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    respondent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    position INT NOT NULL CHECK (position BETWEEN 1 AND 72),
    is_marked_for_review BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_respondent_question UNIQUE (respondent_id, question_id),
    CONSTRAINT uq_respondent_position UNIQUE (respondent_id, position)
);

CREATE INDEX idx_student_qorder_respondent ON student_question_order(respondent_id);
CREATE INDEX idx_student_qorder_position ON student_question_order(respondent_id, position);

-- 6. ANSWERS TABLE
-- Validations:
-- Rule A: One answer per question per respondent (uq_answers_respondent_question)
-- Rule B: A classmate cannot be reused within one respondent's questionnaire (uq_answers_respondent_classmate)
-- Rule C: No self-selection (CHECK selected_student_id <> respondent_id)
CREATE TABLE answers (
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

CREATE INDEX idx_answers_respondent ON answers(respondent_id);
CREATE INDEX idx_answers_question ON answers(question_id);
CREATE INDEX idx_answers_selected_student ON answers(selected_student_id);

-- 7. SUBMISSIONS TABLE
-- Final locked submissions
-- Rule D: Exactly 59 answers required (answer_count >= 59)
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    answer_count INT NOT NULL CHECK (answer_count >= 59),
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reopened')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_submissions_student ON submissions(student_id);

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_question_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PROFILES POLICIES
-- Anyone authenticated can view all student profiles (needed for classmate name cards)
CREATE POLICY "Authenticated users can view student profiles"
    ON profiles FOR SELECT
    TO authenticated
    USING (role = 'student' OR id = auth.uid() OR is_admin());

-- Users can update only their non-role fields
CREATE POLICY "Users can update their own profile except role"
    ON profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid() AND role = (SELECT role FROM profiles WHERE id = auth.uid()));

-- QUESTIONS POLICIES
-- Authenticated users can view active questions
CREATE POLICY "Anyone authenticated can view active questions"
    ON questions FOR SELECT
    TO authenticated
    USING (is_active = true OR is_admin());

CREATE POLICY "Admins can manage questions"
    ON questions FOR ALL
    TO authenticated
    USING (is_admin());

-- STUDENT QUESTION ORDER POLICIES
CREATE POLICY "Students can view their own question order"
    ON student_question_order FOR SELECT
    TO authenticated
    USING (respondent_id = auth.uid() OR is_admin());

CREATE POLICY "Students can update review markers on their question order"
    ON student_question_order FOR UPDATE
    TO authenticated
    USING (respondent_id = auth.uid())
    WITH CHECK (respondent_id = auth.uid());

CREATE POLICY "Students can insert their own question order"
    ON student_question_order FOR INSERT
    TO authenticated
    WITH CHECK (respondent_id = auth.uid());

-- ANSWERS POLICIES
CREATE POLICY "Students can view their own answers"
    ON answers FOR SELECT
    TO authenticated
    USING (respondent_id = auth.uid() OR is_admin());

CREATE POLICY "Students can insert their own answers before final submission"
    ON answers FOR INSERT
    TO authenticated
    WITH CHECK (
        respondent_id = auth.uid()
        AND NOT EXISTS (SELECT 1 FROM submissions WHERE student_id = auth.uid())
    );

CREATE POLICY "Students can update their own answers before final submission"
    ON answers FOR UPDATE
    TO authenticated
    USING (
        respondent_id = auth.uid()
        AND NOT EXISTS (SELECT 1 FROM submissions WHERE student_id = auth.uid())
    )
    WITH CHECK (
        respondent_id = auth.uid()
        AND NOT EXISTS (SELECT 1 FROM submissions WHERE student_id = auth.uid())
    );

CREATE POLICY "Students can delete their own answers before final submission"
    ON answers FOR DELETE
    TO authenticated
    USING (
        respondent_id = auth.uid()
        AND NOT EXISTS (SELECT 1 FROM submissions WHERE student_id = auth.uid())
    );

-- SUBMISSIONS POLICIES
CREATE POLICY "Students can view their own submission"
    ON submissions FOR SELECT
    TO authenticated
    USING (student_id = auth.uid() OR is_admin());

CREATE POLICY "Students can insert their own submission once"
    ON submissions FOR INSERT
    TO authenticated
    WITH CHECK (student_id = auth.uid());

-- ==============================================================================
-- 9. ATOMIC DATABASE FUNCTIONS
-- ==============================================================================

-- 9.1 Initialize or retrieve persistent randomized question order for student
CREATE OR REPLACE FUNCTION get_or_create_student_question_order(p_student_id UUID DEFAULT NULL)
RETURNS TABLE (
    order_id UUID,
    question_id UUID,
    question_number INT,
    question_text TEXT,
    position INT,
    is_marked_for_review BOOLEAN
) AS $$
DECLARE
    v_user_id UUID;
    v_existing_count INT;
BEGIN
    v_user_id := COALESCE(p_student_id, auth.uid());
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to initialize question order';
    END IF;

    -- Check if student already has 72 ordered questions
    SELECT COUNT(*) INTO v_existing_count
    FROM student_question_order
    WHERE respondent_id = v_user_id;

    IF v_existing_count < 72 THEN
        -- Delete any partial order to regenerate cleanly
        DELETE FROM student_question_order WHERE respondent_id = v_user_id;
        
        -- Insert all 72 active questions in a distinct randomized sequence
        INSERT INTO student_question_order (respondent_id, question_id, position, is_marked_for_review)
        SELECT 
            v_user_id,
            q.id,
            row_number() OVER (ORDER BY md5(v_user_id::text || q.id::text || random()::text)) as position,
            false
        FROM questions q
        WHERE q.is_active = true
        ORDER BY random()
        LIMIT 72;
    END IF;

    -- Return the ordered questions
    RETURN QUERY
    SELECT 
        sqo.id AS order_id,
        q.id AS question_id,
        q.question_number,
        q.question_text,
        sqo.position,
        sqo.is_marked_for_review
    FROM student_question_order sqo
    JOIN questions q ON q.id = sqo.question_id
    WHERE sqo.respondent_id = v_user_id
    ORDER BY sqo.position ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9.2 Save Answer with atomic validations
CREATE OR REPLACE FUNCTION save_student_answer(
    p_question_id UUID,
    p_selected_student_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_target_role TEXT;
    v_submitted BOOLEAN;
    v_existing_question_for_classmate UUID;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Rule C: No self-selection
    IF p_selected_student_id = v_user_id THEN
        RAISE EXCEPTION 'Rule C: A student cannot select themselves.';
    END IF;

    -- Check if respondent has already submitted
    SELECT EXISTS (SELECT 1 FROM submissions WHERE student_id = v_user_id) INTO v_submitted;
    IF v_submitted THEN
        RAISE EXCEPTION 'Questionnaire is locked after final submission.';
    END IF;

    -- Verify selected student is a valid student profile
    SELECT role INTO v_target_role FROM profiles WHERE id = p_selected_student_id;
    IF v_target_role IS NULL OR v_target_role <> 'student' THEN
        RAISE EXCEPTION 'Selected classmate must be a valid registered student.';
    END IF;

    -- Rule B: Check if classmate is already chosen for a DIFFERENT question
    SELECT question_id INTO v_existing_question_for_classmate
    FROM answers
    WHERE respondent_id = v_user_id 
      AND selected_student_id = p_selected_student_id
      AND question_id <> p_question_id;

    IF v_existing_question_for_classmate IS NOT NULL THEN
        RAISE EXCEPTION 'Rule B: Classmate is already selected for another question.';
    END IF;

    -- Rule A: One answer per question. Upsert answer for (respondent_id, question_id)
    INSERT INTO answers (respondent_id, question_id, selected_student_id, updated_at)
    VALUES (v_user_id, p_question_id, p_selected_student_id, timezone('utc'::text, now()))
    ON CONFLICT (respondent_id, question_id)
    DO UPDATE SET 
        selected_student_id = EXCLUDED.selected_student_id,
        updated_at = timezone('utc'::text, now());

    RETURN jsonb_build_object('success', true, 'message', 'Answer saved successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9.3 Toggle Mark for Review
CREATE OR REPLACE FUNCTION toggle_student_question_review(
    p_question_id UUID,
    p_is_marked BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    UPDATE student_question_order
    SET is_marked_for_review = p_is_marked
    WHERE respondent_id = v_user_id AND question_id = p_question_id;

    RETURN jsonb_build_object('success', true, 'is_marked_for_review', p_is_marked);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9.4 Final Atomic Questionnaire Submission
CREATE OR REPLACE FUNCTION submit_questionnaire()
RETURNS JSONB AS $$
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

    -- Idempotency check: if already submitted, return existing record
    SELECT * INTO v_submission_record FROM submissions WHERE student_id = v_user_id;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_submitted',
            'submitted_at', v_submission_record.submitted_at,
            'answer_count', v_submission_record.answer_count
        );
    END IF;

    -- Count total answers
    SELECT COUNT(*) INTO v_answer_count
    FROM answers
    WHERE respondent_id = v_user_id;

    -- Rule D: Exactly 59 answers required
    IF v_answer_count < 59 THEN
        RAISE EXCEPTION 'Rule D: Exactly 59 answers required to submit. You have % answers.', v_answer_count;
    END IF;

    -- Rule B: All selected classmates must be distinct
    SELECT COUNT(DISTINCT selected_student_id) INTO v_distinct_classmates
    FROM answers
    WHERE respondent_id = v_user_id;

    IF v_distinct_classmates <> v_answer_count THEN
        RAISE EXCEPTION 'Rule B: Duplicate classmate selections detected. Each classmate can be chosen only once.';
    END IF;

    -- Rule C: No self-selection
    SELECT COUNT(*) INTO v_self_select_count
    FROM answers
    WHERE respondent_id = v_user_id AND selected_student_id = v_user_id;

    IF v_self_select_count > 0 THEN
        RAISE EXCEPTION 'Rule C: Self-selection is prohibited.';
    END IF;

    -- Atomic insertion into submissions table
    INSERT INTO submissions (student_id, answer_count, status, submitted_at)
    VALUES (v_user_id, v_answer_count, 'submitted', timezone('utc'::text, now()))
    RETURNING * INTO v_submission_record;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'submitted',
        'submitted_at', v_submission_record.submitted_at,
        'answer_count', v_submission_record.answer_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
