-- Migration: 20250104_randomized_order_and_cleanup.sql
-- Description: Ensures safe, distinct randomized 72-question orders per student with concurrency locking

CREATE OR REPLACE FUNCTION get_or_create_student_question_order(p_student_id UUID DEFAULT NULL)
RETURNS TABLE (
    order_id UUID,
    question_id UUID,
    question_number INT,
    question_text TEXT,
    description TEXT,
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

    -- Concurrency Protection: Acquire transactional advisory lock for this student
    PERFORM pg_advisory_xact_lock(hashtext('qorder_' || v_user_id::text));

    -- Check if student already has exactly 72 ordered questions
    SELECT COUNT(*) INTO v_existing_count
    FROM student_question_order
    WHERE respondent_id = v_user_id;

    IF v_existing_count < 72 THEN
        -- Delete partial order to regenerate cleanly
        DELETE FROM student_question_order WHERE respondent_id = v_user_id;
        
        -- Insert all 72 active questions in a distinct randomized sequence for this student
        INSERT INTO student_question_order (respondent_id, question_id, position, is_marked_for_review)
        SELECT 
            v_user_id,
            q.id,
            row_number() OVER (ORDER BY random()) as position,
            false
        FROM questions q
        WHERE q.is_active = true
        ORDER BY random()
        LIMIT 72;
    END IF;

    -- Return the persistent ordered questions
    RETURN QUERY
    SELECT 
        sqo.id AS order_id,
        q.id AS question_id,
        q.question_number,
        q.question_text,
        q.description,
        sqo.position,
        sqo.is_marked_for_review
    FROM student_question_order sqo
    JOIN questions q ON q.id = sqo.question_id
    WHERE sqo.respondent_id = v_user_id
    ORDER BY sqo.position ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
