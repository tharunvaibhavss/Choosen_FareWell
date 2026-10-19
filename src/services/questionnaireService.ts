import { supabase, isSupabaseConfigured } from './supabase';
import type { 
  Profile, 
  StudentQuestionOrder, 
  Answer, 
  Submission 
} from '../types/database';

export class QuestionnaireService {
  /**
   * Fetches all registered student profiles for the classmate selection grid.
   * Names only, no photos as specified in requirements.
   */
  static async getEligibleClassmates(): Promise<Profile[]> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase database connection is not configured.');
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, roll_number, full_name, role')
      .eq('role', 'student')
      .order('roll_number', { ascending: true });

    if (error) {
      throw new Error(`Failed to load classmates: ${error.message}`);
    }

    return (data as Profile[]) || [];
  }

  /**
   * Loads the student's persistent 72-question order from Supabase.
   * Atomic RPC get_or_create_student_question_order shuffles and persists questions in the database.
   */
  static async getStudentQuestionOrder(studentId: string): Promise<StudentQuestionOrder[]> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase database connection is not configured.');
    }

    const { data, error } = await supabase.rpc('get_or_create_student_question_order', {
      p_student_id: studentId,
    });

    if (error) {
      throw new Error(`Failed to load questions: ${error.message}`);
    }

    return (data || []).map((item: {
      order_id: string;
      question_id: string;
      question_number: number;
      question_text: string;
      description?: string;
      question_position?: number;
      position?: number;
      is_marked_for_review: boolean;
    }) => {
      const pos = item.question_position ?? item.position ?? 1;
      return {
        id: item.order_id,
        respondent_id: studentId,
        question_id: item.question_id,
        question_position: pos,
        position: pos,
        is_marked_for_review: item.is_marked_for_review,
        question_number: item.question_number,
        question_text: item.question_text,
        description: item.description,
      };
    });
  }


  /**
   * Fetches existing saved answers for this respondent directly from Supabase
   */
  static async getStudentAnswers(studentId: string): Promise<Answer[]> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase database connection is not configured.');
    }

    const { data, error } = await supabase
      .from('answers')
      .select('*')
      .eq('respondent_id', studentId);

    if (error) {
      throw new Error(`Failed to load answers: ${error.message}`);
    }

    return (data as Answer[]) || [];
  }

  /**
   * Atomically saves or updates an answer via save_student_answer RPC
   */
  static async saveAnswer(
    respondentId: string,
    questionId: string,
    selectedStudentId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (respondentId === selectedStudentId) {
      return { success: false, error: 'Rule C: A student cannot select themselves.' };
    }

    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.' };
    }

    try {
      const { data, error } = await supabase.rpc('save_student_answer', {
        p_question_id: questionId,
        p_selected_student_id: selectedStudentId,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data && !data.success) {
        return { success: false, error: data.message || 'Failed to save answer' };
      }

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save answer';
      return { success: false, error: message };
    }
  }

  /**
   * Removes an answer for a question atomically via unselect_student_answer RPC
   */
  static async removeAnswer(
    _respondentId: string,
    questionId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.' };
    }

    try {
      const { data, error } = await supabase.rpc('unselect_student_answer', {
        p_question_id: questionId,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data && !data.success) {
        return { success: false, error: data.message || 'Failed to delete answer' };
      }

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete answer';
      return { success: false, error: message };
    }
  }

  /**
   * Toggles the marked for review state on a question in Supabase
   */
  static async toggleMarkForReview(
    _respondentId: string,
    questionId: string,
    isMarked: boolean
  ): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.' };
    }

    try {
      const { error } = await supabase.rpc('toggle_student_question_review', {
        p_question_id: questionId,
        p_is_marked: isMarked,
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to toggle review marker';
      return { success: false, error: message };
    }
  }

  /**
   * Checks if respondent has already submitted
   */
  static async getSubmission(studentId: string): Promise<Submission | null> {
    if (!isSupabaseConfigured || !supabase) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .eq('student_id', studentId)
        .maybeSingle();

      if (error) {
        console.error('Supabase fetch submission error:', error.message);
        return null;
      }

      return (data as Submission) || null;
    } catch {
      return null;
    }
  }

  /**
   * Performs atomic final questionnaire submission via submit_questionnaire RPC
   */
  static async submitQuestionnaire(
    studentId: string
  ): Promise<{ success: boolean; error?: string; submission?: Submission }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.' };
    }

    try {
      const { data, error } = await supabase.rpc('submit_questionnaire');

      if (error) {
        return { success: false, error: error.message };
      }

      if (data && data.success) {
        return {
          success: true,
          submission: {
            id: data.id || `sub-${studentId}`,
            student_id: studentId,
            answer_count: data.answer_count || 59,
            status: 'submitted',
            submitted_at: data.submitted_at || new Date().toISOString(),
          },
        };
      }

      return { success: false, error: data?.error || 'Submission failed' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Submission failed';
      return { success: false, error: message };
    }
  }

  /**
   * Ensures the student's one-time reset is completed before questionnaire initialization.
   * Safe, idempotent, and backed by PostgreSQL advisory transaction lock.
   */
  static async ensureFirstLoginReset(): Promise<{ success: boolean; status?: string; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.' };
    }

    try {
      const { data, error } = await supabase.rpc('execute_student_first_login_reset');

      if (error) {
        return { success: false, error: error.message };
      }

      if (data && !data.success) {
        return { success: false, error: data.message || 'One-time reset failed' };
      }

      return { success: true, status: data?.status };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'One-time reset failed';
      return { success: false, error: message };
    }
  }
}

