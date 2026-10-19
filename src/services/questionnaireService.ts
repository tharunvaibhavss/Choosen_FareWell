import { supabase, isSupabaseConfigured } from './supabase';
import { MockStorageService } from './mockStorage';
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
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, roll_number, full_name, role')
          .eq('role', 'student')
          .order('roll_number', { ascending: true });

        if (!error && data && data.length > 0) {
          return data as Profile[];
        }
      } catch (err) {
        console.warn('Falling back to local classmate pool:', err);
      }
    }

    return MockStorageService.getAllProfiles().filter((p) => p.role === 'student');
  }

  /**
   * Loads the student's persistent 72-question order.
   * If not yet created in the DB, it creates a persistent randomized order of 72 questions.
   */
  static async getStudentQuestionOrder(studentId: string): Promise<StudentQuestionOrder[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        // Try calling the database function get_or_create_student_question_order
        const { data, error } = await supabase.rpc('get_or_create_student_question_order', {
          p_student_id: studentId,
        });

        if (!error && data && data.length === 72) {
          return data.map((item: {
            order_id: string;
            question_id: string;
            question_number: number;
            question_text: string;
            description?: string;
            position: number;
            is_marked_for_review: boolean;
          }) => ({
            id: item.order_id,
            respondent_id: studentId,
            question_id: item.question_id,
            position: item.position,
            is_marked_for_review: item.is_marked_for_review,
            question_number: item.question_number,
            question_text: item.question_text,
            description: item.description,
          }));
        }
      } catch (err) {
        console.warn('Supabase get_or_create_student_question_order failed, using local adapter:', err);
      }
    }

    return MockStorageService.getOrCreateStudentQuestionOrder(studentId);
  }

  /**
   * Fetches existing saved answers for this respondent
   */
  static async getStudentAnswers(studentId: string): Promise<Answer[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('answers')
          .select('*')
          .eq('respondent_id', studentId);

        if (!error && data) {
          return data as Answer[];
        }
      } catch (err) {
        console.warn('Supabase fetch answers error:', err);
      }
    }

    return MockStorageService.getStudentAnswers(studentId);
  }

  /**
   * Atomically saves or updates an answer
   */
  static async saveAnswer(
    respondentId: string,
    questionId: string,
    selectedStudentId: string
  ): Promise<{ success: boolean; error?: string }> {
    // Client-side quick check
    if (respondentId === selectedStudentId) {
      return { success: false, error: 'Rule C: A student cannot select themselves.' };
    }

    if (isSupabaseConfigured && supabase) {
      try {
        // Call the database function save_student_answer
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

    return MockStorageService.saveAnswer(respondentId, questionId, selectedStudentId);
  }

  /**
   * Removes an answer for a question
   */
  static async removeAnswer(
    respondentId: string,
    questionId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('answers')
          .delete()
          .match({ respondent_id: respondentId, question_id: questionId });

        if (error) {
          return { success: false, error: error.message };
        }
        return { success: true };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to delete answer';
        return { success: false, error: message };
      }
    }

    return MockStorageService.removeAnswer(respondentId, questionId);
  }

  /**
   * Toggles the marked for review state on a question
   */
  static async toggleMarkForReview(
    respondentId: string,
    questionId: string,
    isMarked: boolean
  ): Promise<{ success: boolean; error?: string }> {
    if (isSupabaseConfigured && supabase) {
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

    MockStorageService.toggleMarkForReview(respondentId, questionId, isMarked);
    return { success: true };
  }

  /**
   * Checks if respondent has already submitted
   */
  static async getSubmission(studentId: string): Promise<Submission | null> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('submissions')
          .select('*')
          .eq('student_id', studentId)
          .maybeSingle();

        if (!error && data) {
          return data as Submission;
        }
      } catch (err) {
        console.warn('Supabase fetch submission error:', err);
      }
    }

    return MockStorageService.getSubmission(studentId);
  }

  /**
   * Performs atomic final questionnaire submission
   */
  static async submitQuestionnaire(
    studentId: string
  ): Promise<{ success: boolean; error?: string; submission?: Submission }> {
    if (isSupabaseConfigured && supabase) {
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

    return MockStorageService.submitQuestionnaire(studentId);
  }
}
