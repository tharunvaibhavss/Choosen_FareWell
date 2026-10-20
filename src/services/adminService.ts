import ExcelJS from 'exceljs';
import { supabase, isSupabaseConfigured } from './supabase';
import { AuthService } from './authService';
import type { 
  StudentSummaryItem, 
  DetailedAnswerExportRow, 
  StudentQuestionAnalysisRow,
  StudentSelectionSummaryRow,
  StudentDetailExportRow,
  QuestionBankExportRow,
  AnswerMemoryExportRow,
  SubmissionSummaryExportRow,
  Submission,
  Profile, 
  Question, 
  CreateStudentInput, 
  UpdateStudentInput,
  CreateQuestionInput,
  UpdateQuestionInput 
} from '../types/database';

export function parseRollNumber(roll: string | number | undefined | null): number {
  if (typeof roll === 'number') return roll;
  const str = String(roll || '').trim();
  const trailing = str.match(/(\d+)$/);
  if (trailing) return parseInt(trailing[1], 10);
  const match = str.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

export function formatExportDateTime(dateVal: string | Date | null | undefined): string {
  if (!dateVal) return '—';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '—';
    const pad = (n: number) => n.toString().padStart(2, '0');
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const mins = pad(d.getMinutes());
    const secs = pad(d.getSeconds());
    return `${y}-${m}-${day} ${hours}:${mins}:${secs}`;
  } catch {
    return '—';
  }
}

export function formatRollValue(roll: string | number | undefined | null): number | string {
  if (roll === undefined || roll === null) return '';
  if (typeof roll === 'number') return roll;
  const trimmed = String(roll).trim();
  const num = Number(trimmed);
  if (!isNaN(num) && String(num) === trimmed) {
    return num;
  }
  return trimmed;
}

export class AdminService {
  // ============================================================================
  // 1. STUDENT MANAGEMENT CRUD
  // ============================================================================

  static async getAllStudents(): Promise<Profile[]> {
    if (!isSupabaseConfigured || !supabase) {
      return [];
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'student')
        .order('roll_number', { ascending: true });

      if (error) {
        console.error('Supabase getAllStudents error:', error.message);
        return [];
      }
      return (data as Profile[]) || [];
    } catch (err) {
      console.error('Supabase getAllStudents exception:', err);
      return [];
    }
  }

  private static async parseEdgeFunctionError(error: any, data: any): Promise<string> {
    if (data?.error && typeof data.error === 'string') {
      return data.error;
    }
    if (error && typeof error === 'object' && 'context' in error) {
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          const parsed = ctx.clone ? await ctx.clone().json() : await ctx.json();
          if (parsed?.error && typeof parsed.error === 'string') {
            return parsed.error;
          }
          if (parsed?.message && typeof parsed.message === 'string') {
            return parsed.message;
          }
        }
      } catch {
        try {
          const ctx = (error as { context?: Response }).context;
          const text = ctx?.clone ? await ctx.clone().text() : await ctx?.text();
          if (text && typeof text === 'string' && text.length < 200) {
            return text;
          }
        } catch {
          // Ignore parse failure
        }
      }
    }
    return error?.message || 'Edge function request failed';
  }

  static async createStudent(input: CreateStudentInput): Promise<{ success: boolean; error?: string; student?: Profile }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.' };
    }
    try {
      const cleanRoll = input.rollNumber.trim().toUpperCase();
      const cleanEmail = input.email.trim().toLowerCase();
      const cleanName = input.fullName.trim();
      const studentPassword = input.password || `mca2527@${cleanRoll.toLowerCase()}`;

      // Invoke trusted admin server-side Edge Function
      const { data, error } = await supabase.functions.invoke('admin-manage-user', {
        body: {
          action: 'create_student',
          rollNumber: cleanRoll,
          fullName: cleanName,
          email: cleanEmail,
          password: studentPassword,
          isActive: input.isActive ?? true,
        },
      });

      if (error) {
        const detailedError = await AdminService.parseEdgeFunctionError(error, data);
        return {
          success: false,
          error: detailedError,
        };
      }

      if (data && data.success && data.student) {
        return { success: true, student: data.student as Profile };
      }

      return { success: false, error: data?.error || 'Failed to create student account.' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create student';
      return { success: false, error: msg };
    }
  }

  static async updateStudent(id: string, input: UpdateStudentInput): Promise<{ success: boolean; error?: string; student?: Profile }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.' };
    }
    try {
      const cleanRoll = input.rollNumber ? input.rollNumber.trim().toUpperCase() : undefined;
      const cleanEmail = input.email ? input.email.trim().toLowerCase() : undefined;
      const cleanName = input.fullName ? input.fullName.trim() : undefined;

      const { data, error } = await supabase.functions.invoke('admin-manage-user', {
        body: {
          action: 'update_student',
          studentId: id,
          rollNumber: cleanRoll,
          fullName: cleanName,
          email: cleanEmail,
          isActive: input.isActive,
        },
      });

      if (error) {
        const detailedError = await AdminService.parseEdgeFunctionError(error, data);
        return { success: false, error: detailedError };
      }

      if (data && data.success && data.student) {
        return { success: true, student: data.student as Profile };
      }

      return { success: false, error: data?.error || 'Failed to update student profile.' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update student';
      return { success: false, error: msg };
    }
  }

  static async toggleStudentStatus(id: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.' };
    }
    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-user', {
        body: {
          action: 'toggle_student_status',
          studentId: id,
          isActive,
        },
      });

      if (!error && data?.success) {
        return { success: true };
      }

      if (error) {
        const detailedError = await AdminService.parseEdgeFunctionError(error, data);
        return { success: false, error: detailedError };
      }

      return { success: false, error: data?.error || 'Failed to toggle student status' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle status';
      return { success: false, error: msg };
    }
  }

  static async resetStudentPassword(studentId: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.' };
    }
    try {
      // 1. Attempt direct password update via the secure admin Edge Function
      const { data, error } = await supabase.functions.invoke('admin-manage-user', {
        body: {
          action: 'reset_password',
          studentId,
          newPassword,
        },
      });

      if (!error && data?.success) {
        return { success: true };
      }

      if (error) {
        const detailedError = await AdminService.parseEdgeFunctionError(error, data);
        return { success: false, error: detailedError };
      }

      // 2. If student profile lookup is needed as fallback
      const { data: student, error: fetchErr } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', studentId)
        .single();

      if (fetchErr || !student?.email) {
        return { success: false, error: 'Could not find student email address.' };
      }

      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(student.email);
      if (resetErr) {
        return { success: false, error: `Password reset email failed: ${resetErr.message}` };
      }
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Password reset failed';
      return { success: false, error: msg };
    }
  }

  static async requirePasswordReset(studentId: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.' };
    }
    try {
      // 1. Invoke secure server-side Edge function with action: 'require_password_change'
      const { data, error } = await supabase.functions.invoke('admin-manage-user', {
        body: {
          action: 'require_password_change',
          studentId,
        },
      });

      if (!error && data?.success) {
        return { success: true };
      }

      // Fallback: If Edge function failed, call atomic secure RPC
      const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_require_password_change', {
        p_student_id: studentId,
      });

      if (!rpcErr && rpcData?.success) {
        return { success: true };
      }

      const detailedError = error ? await AdminService.parseEdgeFunctionError(error, data) : (rpcErr?.message || 'Failed to require password reset');
      return { success: false, error: detailedError };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to require password reset';
      return { success: false, error: msg };
    }
  }

  static async deleteStudent(id: string): Promise<{ success: boolean; error?: string; message: string; softDeleted: boolean }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.', message: '', softDeleted: false };
    }
    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-user', {
        body: {
          action: 'delete_student',
          studentId: id,
        },
      });

      if (error) {
        const detailedError = await AdminService.parseEdgeFunctionError(error, data);
        return { success: false, error: detailedError, message: '', softDeleted: false };
      }

      if (data && data.success) {
        return {
          success: true,
          message: data.message || 'Student processed',
          softDeleted: data.softDeleted || false,
        };
      }

      return { success: false, error: data?.error || 'Delete failed', message: '', softDeleted: false };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      return { success: false, error: msg, message: '', softDeleted: false };
    }
  }

  static async resetStudentSubmission(studentId: string): Promise<{ success: boolean; error?: string; message?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.' };
    }
    try {
      // 1. First attempt via the secure admin Edge Function
      const { data, error } = await supabase.functions.invoke('admin-manage-user', {
        body: {
          action: 'reset_submission',
          studentId,
        },
      });

      if (!error && data?.success) {
        return {
          success: true,
          message: data.message || 'Submission reset successfully.',
        };
      }

      // 2. Fallback to direct RPC call for authenticated admin
      const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_reset_student_submission', {
        p_student_id: studentId,
      });

      if (!rpcErr && rpcData?.success) {
        return {
          success: true,
          message: rpcData.message || 'Submission reset successfully.',
        };
      }

      const detailedError = await AdminService.parseEdgeFunctionError(error, data);
      return {
        success: false,
        error: detailedError || rpcErr?.message || 'Failed to reset student submission.',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reset submission failed';
      return { success: false, error: msg };
    }
  }

  // ============================================================================
  // 2. QUESTION MANAGEMENT CRUD
  // ============================================================================

  static async getAllQuestions(): Promise<Question[]> {
    if (!isSupabaseConfigured || !supabase) {
      return [];
    }
    try {
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .order('question_number', { ascending: true });

      if (error) {
        console.error('Supabase getAllQuestions error:', error.message);
        return [];
      }
      return (data as Question[]) || [];
    } catch (err) {
      console.error('Supabase getAllQuestions exception:', err);
      return [];
    }
  }

  static async createQuestion(input: CreateQuestionInput): Promise<{ success: boolean; error?: string; question?: Question }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.' };
    }
    try {
      const { data, error } = await supabase
        .from('questions')
        .insert({
          question_number: input.questionNumber,
          question_text: input.questionText.trim(),
          description: input.description?.trim() || '',
          is_active: input.isActive ?? true,
        })
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, question: data as Question };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Create question failed';
      return { success: false, error: msg };
    }
  }

  static async updateQuestion(id: string, input: UpdateQuestionInput): Promise<{ success: boolean; error?: string; question?: Question }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.' };
    }
    try {
      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.questionNumber !== undefined) updatePayload.question_number = input.questionNumber;
      if (input.questionText !== undefined) updatePayload.question_text = input.questionText.trim();
      if (input.description !== undefined) updatePayload.description = input.description.trim();
      if (input.isActive !== undefined) updatePayload.is_active = input.isActive;

      const { data, error } = await supabase
        .from('questions')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, question: data as Question };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update question failed';
      return { success: false, error: msg };
    }
  }

  static async toggleQuestionStatus(id: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.' };
    }
    try {
      const { error } = await supabase
        .from('questions')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle question status';
      return { success: false, error: msg };
    }
  }

  static async deleteQuestion(id: string): Promise<{ success: boolean; error?: string; message: string; archived: boolean }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.', message: '', archived: false };
    }
    try {
      const { data, error } = await supabase.rpc('admin_delete_question', { p_question_id: id });
      if (error) {
        return { success: false, error: error.message, message: '', archived: false };
      }
      return {
        success: true,
        message: data?.message || 'Question processed',
        archived: data?.archived || false,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete question failed';
      return { success: false, error: msg, message: '', archived: false };
    }
  }

  // ============================================================================
  // 3. SUBMISSION SUMMARIES & REPORTING
  // ============================================================================

  static async getStudentSummaries(): Promise<StudentSummaryItem[]> {
    if (!isSupabaseConfigured || !supabase) {
      return [];
    }
    try {
      // 1. Primary path: High-performance, secure database-side aggregation RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_get_student_summaries');

      if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
        return rpcData.map((item: {
          id: string;
          roll_number: string;
          full_name: string;
          email: string | null;
          is_active: boolean | null;
          answered_count: number | string;
          distinct_choices_count: number | string;
          submission_status: string | null;
          submitted_at: string | null;
          must_change_password: boolean | null;
          password_changed_at: string | null;
        }) => {
          const answeredCount = Number(item.answered_count) || 0;
          let status: StudentSummaryItem['status'] = 'not_started';
          if (item.submission_status === 'submitted') {
            status = 'submitted';
          } else if (answeredCount > 0) {
            status = 'in_progress';
          }

          const studentEmail = item.email || '';

          return {
            id: item.id,
            rollNumber: item.roll_number,
            fullName: item.full_name,
            email: studentEmail,
            isActive: item.is_active ?? true,
            loginIdentifier: studentEmail,
            answeredCount,
            distinctChoicesCount: Number(item.distinct_choices_count) || 0,
            status,
            submittedAt: item.submitted_at || null,
            mustChangePassword: item.must_change_password ?? true,
            passwordChangedAt: item.password_changed_at || null,
          };
        });
      }

      if (rpcError) {
        console.warn('admin_get_student_summaries RPC unavailable, falling back to paginated query:', rpcError.message);
      }

      // 2. Resilient fallback path: Paginated retrieval ensuring zero rows are lost to PostgREST 1,000-row limits
      const { data: students, error: studErr } = await supabase
        .from('profiles')
        .select('id, roll_number, full_name, email, is_active, must_change_password, password_changed_at')
        .eq('role', 'student')
        .order('roll_number', { ascending: true });

      if (studErr || !students || students.length === 0) {
        if (studErr) console.error('Error fetching students for summary:', studErr.message);
        return [];
      }

      const { data: submissions } = await supabase
        .from('submissions')
        .select('*');

      const countMap = new Map<string, number>();
      const pageSize = 1000;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: chunk, error: chunkErr } = await supabase
          .from('answers')
          .select('respondent_id')
          .range(from, from + pageSize - 1);

        if (chunkErr || !chunk || chunk.length === 0) {
          hasMore = false;
          break;
        }

        chunk.forEach((a) => {
          countMap.set(a.respondent_id, (countMap.get(a.respondent_id) || 0) + 1);
        });

        if (chunk.length < pageSize) {
          hasMore = false;
        } else {
          from += pageSize;
        }
      }

      const subMap = new Map((submissions || []).map((s) => [s.student_id, s]));

      return students.map((s) => {
        const sub = subMap.get(s.id);
        const answeredCount = countMap.get(s.id) || 0;
        let status: StudentSummaryItem['status'] = 'not_started';
        if (sub && sub.status === 'submitted') {
          status = 'submitted';
        } else if (answeredCount > 0) {
          status = 'in_progress';
        }

        const studentEmail = s.email || '';

        return {
          id: s.id,
          rollNumber: s.roll_number,
          fullName: s.full_name,
          email: studentEmail,
          isActive: s.is_active ?? true,
          loginIdentifier: studentEmail,
          answeredCount,
          distinctChoicesCount: answeredCount,
          status,
          submittedAt: sub ? sub.submitted_at : null,
          mustChangePassword: s.must_change_password ?? true,
          passwordChangedAt: s.password_changed_at || null,
        };
      });
    } catch (err) {
      console.error('Supabase getStudentSummaries exception:', err);
      return [];
    }
  }

  static async getValidatedAnalysisData(): Promise<{
    students: Profile[];
    questions: Question[];
    detailedRows: DetailedAnswerExportRow[];
    sheet3Rows: (StudentQuestionAnalysisRow & { selectedStudentId: string })[];
    sheet4Rows: StudentSelectionSummaryRow[];
    studentDetailRows: StudentDetailExportRow[];
    questionBankRows: QuestionBankExportRow[];
    answerMemoryRows: AnswerMemoryExportRow[];
    submissionSummaryRows: SubmissionSummaryExportRow[];
  }> {
    const rawStudents = await this.getAllStudents();
    const rawQuestions = await this.getAllQuestions();

    // Sort students numerically by roll number: 25MCA001 to 25MCA060
    const students = [...rawStudents].sort((a, b) => {
      const numA = parseRollNumber(a.roll_number);
      const numB = parseRollNumber(b.roll_number);
      if (numA !== numB) return numA - numB;
      return a.roll_number.localeCompare(b.roll_number);
    });

    // Sort questions by question number ascending: 1 to 72
    const questions = [...rawQuestions].sort((a, b) => a.question_number - b.question_number);

    const studentsMap = new Map<string, Profile>(students.map((s) => [s.id, s]));
    const questionsMap = new Map<string, Question>(questions.map((q) => [q.id, q]));

    type RawAnswerItem = {
      id?: string;
      respondent_id: string;
      question_id: string;
      selected_student_id: string;
      created_at?: string;
      updated_at?: string;
    };

    let rawAnswers: RawAnswerItem[] = [];

    // Paginated answers retrieval ensuring zero records are lost to PostgREST 1,000-row limits
    if (isSupabaseConfigured && supabase) {
      try {
        const pageSize = 1000;
        let from = 0;
        let hasMore = true;

        while (hasMore) {
          const { data: chunk, error } = await supabase
            .from('answers')
            .select('id, respondent_id, question_id, selected_student_id, created_at, updated_at')
            .order('created_at', { ascending: true })
            .range(from, from + pageSize - 1);

          if (error) {
            console.error('Supabase getValidatedAnalysisData answers fetch error:', error.message);
            break;
          }

          if (chunk && chunk.length > 0) {
            rawAnswers.push(...(chunk as RawAnswerItem[]));
          }

          if (!chunk || chunk.length < pageSize) {
            hasMore = false;
          } else {
            from += pageSize;
          }
        }
      } catch (err) {
        console.warn('Supabase getValidatedAnalysisData answers fetch exception:', err);
      }
    }

    // Fetch submissions to calculate authoritative submission status
    let rawSubmissions: Submission[] = [];
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: subs, error: subErr } = await supabase
          .from('submissions')
          .select('*');
        if (!subErr && subs) {
          rawSubmissions = subs as Submission[];
        }
      } catch (err) {
        console.warn('Supabase submissions fetch error:', err);
      }
    }
    const submissionMap = new Map<string, Submission>(
      rawSubmissions.map((s) => [s.student_id, s])
    );

    // 1. Enforce strict data consistency rules:
    // - One respondent, one original question, one selected student
    // - Exclude self-selections (respondent_id !== selected_student_id)
    // - Exclude duplicate answers for the same (respondent, question)
    // - Exclude duplicate nominations for the same (respondent, classmate)
    // - Ensure valid profile and question records exist
    interface ValidAnswerRecord {
      id: string;
      respondentId: string;
      respondentRoll: string;
      respondentName: string;
      questionId: string;
      questionNumber: number;
      questionText: string;
      selectedStudentId: string;
      selectedStudentRoll: string;
      selectedStudentName: string;
      answeredAt: string;
    }

    const validAnswers: ValidAnswerRecord[] = [];
    const seenRespondentQuestion = new Set<string>();
    const seenRespondentClassmate = new Set<string>();

    for (const ans of rawAnswers) {
      if (!ans.respondent_id || !ans.question_id || !ans.selected_student_id) continue;
      // Rule C: A respondent cannot select themselves
      if (ans.respondent_id === ans.selected_student_id) continue;

      const respondent = studentsMap.get(ans.respondent_id);
      const selected = studentsMap.get(ans.selected_student_id);
      const question = questionsMap.get(ans.question_id);

      if (!respondent || !selected || !question) continue;

      // Rule A: Unique answer per respondent per question
      const key = `${ans.respondent_id}___${ans.question_id}`;
      if (seenRespondentQuestion.has(key)) continue;

      // Rule B: A respondent cannot select the same classmate for multiple questions
      const classmateKey = `${ans.respondent_id}___${ans.selected_student_id}`;
      if (seenRespondentClassmate.has(classmateKey)) continue;

      seenRespondentQuestion.add(key);
      seenRespondentClassmate.add(classmateKey);

      validAnswers.push({
        id: ans.id || '',
        respondentId: respondent.id,
        respondentRoll: respondent.roll_number,
        respondentName: respondent.full_name,
        questionId: question.id,
        questionNumber: question.question_number,
        questionText: question.question_text,
        selectedStudentId: selected.id,
        selectedStudentRoll: selected.roll_number,
        selectedStudentName: selected.full_name,
        answeredAt: ans.updated_at || ans.created_at || new Date().toISOString(),
      });
    }

    // Sort valid answers: Respondent Roll Number (numerically: 1 to 60), then Question Number (ascending: 1 to 72)
    validAnswers.sort((a, b) => {
      const numA = parseRollNumber(a.respondentRoll);
      const numB = parseRollNumber(b.respondentRoll);
      if (numA !== numB) return numA - numB;
      const rollComp = a.respondentRoll.localeCompare(b.respondentRoll);
      if (rollComp !== 0) return rollComp;
      return a.questionNumber - b.questionNumber;
    });

    // 2. Build Sheet 1: Student Details Rows
    const studentDetailRows: StudentDetailExportRow[] = students.map((s) => ({
      rollNumber: s.roll_number,
      fullName: s.full_name,
      email: s.email || `${s.roll_number.toLowerCase()}@mcafarewell.com`,
      accountStatus: (s.is_active ?? true) ? 'ACTIVE' : 'DISABLED',
      passwordStatus: s.password_changed_at || s.must_change_password === false ? 'Changed' : 'Default (Must Change)',
      studentId: s.id,
    }));

    // 3. Build Sheet 2: Question Bank Rows
    const questionBankRows: QuestionBankExportRow[] = questions.map((q) => ({
      questionNumber: q.question_number,
      questionText: q.question_text,
      activeStatus: q.is_active ? 'ACTIVE' : 'INACTIVE',
      questionId: q.id,
    }));

    // 4. Build Sheet 3: Answers / Memory Selections Rows
    const answerMemoryRows: AnswerMemoryExportRow[] = validAnswers.map((a) => ({
      respondentRollNumber: a.respondentRoll,
      respondentName: a.respondentName,
      questionNumber: a.questionNumber,
      questionText: a.questionText,
      selectedClassmateRollNumber: a.selectedStudentRoll,
      selectedClassmateName: a.selectedStudentName,
      answerId: a.id,
      answeredAt: a.answeredAt,
    }));

    // Legacy DetailedAnswerExportRow for backward compatibility
    const detailedRows: DetailedAnswerExportRow[] = answerMemoryRows.map((a) => ({
      respondentRollNumber: a.respondentRollNumber,
      respondentName: a.respondentName,
      questionNumber: a.questionNumber,
      questionText: a.questionText,
      selectedClassmateRollNumber: a.selectedClassmateRollNumber,
      selectedClassmateName: a.selectedClassmateName,
      answeredAt: a.answeredAt,
    }));

    // 5. Build Sheet 4: Submission Summary Rows
    // Calculate actual valid answer counts and distinct classmate counts per student
    const respondentAnswersCountMap = new Map<string, number>();
    const respondentDistinctClassmatesMap = new Map<string, Set<string>>();

    for (const a of validAnswers) {
      respondentAnswersCountMap.set(
        a.respondentId,
        (respondentAnswersCountMap.get(a.respondentId) || 0) + 1
      );
      let set = respondentDistinctClassmatesMap.get(a.respondentId);
      if (!set) {
        set = new Set<string>();
        respondentDistinctClassmatesMap.set(a.respondentId, set);
      }
      set.add(a.selectedStudentId);
    }

    const submissionSummaryRows: SubmissionSummaryExportRow[] = students.map((student) => {
      const sub = submissionMap.get(student.id);
      const answeredCount = respondentAnswersCountMap.get(student.id) || 0;
      const distinctCount = respondentDistinctClassmatesMap.get(student.id)?.size || 0;

      let status = 'NOT STARTED';
      // Critical requirement: Do not label an incomplete questionnaire as Submitted
      if (sub && sub.status === 'submitted' && answeredCount >= 59) {
        status = 'SUBMITTED';
      } else if (answeredCount > 0) {
        status = 'IN PROGRESS';
      }

      const submittedAt = (sub && sub.status === 'submitted' && answeredCount >= 59)
        ? sub.submitted_at
        : null;

      return {
        rollNumber: student.roll_number,
        studentName: student.full_name,
        answeredCount,
        distinctClassmatesCount: distinctCount,
        submissionStatus: status,
        submittedAt,
        accountStatus: (student.is_active ?? true) ? 'ACTIVE' : 'DISABLED',
      };
    });

    // 6. Build Backward-Compatible Repetition Analysis (Sheet 3 & Sheet 4 legacy structures)
    const sheet3GroupMap = new Map<string, {
      selectedStudentId: string;
      selectedStudentRoll: string;
      selectedStudentName: string;
      questionId: string;
      questionText: string;
      respondentsMap: Map<string, { rollNumber: string; fullName: string }>;
    }>();

    for (const ans of validAnswers) {
      const gKey = `${ans.selectedStudentId}___${ans.questionId}`;
      let group = sheet3GroupMap.get(gKey);
      if (!group) {
        group = {
          selectedStudentId: ans.selectedStudentId,
          selectedStudentRoll: ans.selectedStudentRoll,
          selectedStudentName: ans.selectedStudentName,
          questionId: ans.questionId,
          questionText: ans.questionText,
          respondentsMap: new Map(),
        };
        sheet3GroupMap.set(gKey, group);
      }
      group.respondentsMap.set(ans.respondentId, {
        rollNumber: ans.respondentRoll,
        fullName: ans.respondentName,
      });
    }

    const sheet3Rows: (StudentQuestionAnalysisRow & { selectedStudentId: string })[] = [];

    for (const group of sheet3GroupMap.values()) {
      const sortedRespondents = Array.from(group.respondentsMap.values()).sort((a, b) => {
        const numA = parseRollNumber(a.rollNumber);
        const numB = parseRollNumber(b.rollNumber);
        if (numA !== numB) return numA - numB;
        return a.rollNumber.localeCompare(b.rollNumber);
      });

      sheet3Rows.push({
        selectedStudentId: group.selectedStudentId,
        selectedStudentRollNumber: group.selectedStudentRoll,
        selectedStudentName: group.selectedStudentName,
        questionText: group.questionText,
        repetitionCount: sortedRespondents.length,
        respondentRollNumbers: sortedRespondents.map((r) => r.rollNumber).join(', '),
        respondentNames: sortedRespondents.map((r) => r.fullName).join(', '),
      });
    }

    sheet3Rows.sort((a, b) => {
      const nameComp = a.selectedStudentName.localeCompare(b.selectedStudentName);
      if (nameComp !== 0) return nameComp;

      const rollComp = parseRollNumber(a.selectedStudentRollNumber) - parseRollNumber(b.selectedStudentRollNumber);
      if (rollComp !== 0) return rollComp;

      if (b.repetitionCount !== a.repetitionCount) {
        return b.repetitionCount - a.repetitionCount;
      }

      return a.questionText.localeCompare(b.questionText);
    });

    const studentSheet3Map = new Map<string, typeof sheet3Rows>();
    for (const row of sheet3Rows) {
      const list = studentSheet3Map.get(row.selectedStudentId) || [];
      list.push(row);
      studentSheet3Map.set(row.selectedStudentId, list);
    }

    const sheet4Rows: StudentSelectionSummaryRow[] = students.map((student) => {
      const qRows = studentSheet3Map.get(student.id) || [];

      if (qRows.length === 0) {
        return {
          studentRollNumber: student.roll_number,
          studentName: student.full_name,
          totalSelectionsReceived: 0,
          distinctQuestionsCount: 0,
          mostFrequentlyAssociatedQuestion: '',
          highestQuestionRepetitionCount: 0,
        };
      }

      const sortedQRows = [...qRows].sort((a, b) => {
        if (b.repetitionCount !== a.repetitionCount) {
          return b.repetitionCount - a.repetitionCount;
        }
        return a.questionText.localeCompare(b.questionText);
      });

      const totalSelections = sortedQRows.reduce((sum, r) => sum + r.repetitionCount, 0);
      const distinctQuestions = sortedQRows.length;
      const topQuestion = sortedQRows[0];

      return {
        studentRollNumber: student.roll_number,
        studentName: student.full_name,
        totalSelectionsReceived: totalSelections,
        distinctQuestionsCount: distinctQuestions,
        mostFrequentlyAssociatedQuestion: topQuestion.questionText,
        highestQuestionRepetitionCount: topQuestion.repetitionCount,
      };
    });

    return {
      students,
      questions,
      detailedRows,
      sheet3Rows,
      sheet4Rows,
      studentDetailRows,
      questionBankRows,
      answerMemoryRows,
      submissionSummaryRows,
    };
  }

  static async getDetailedAnswers(): Promise<DetailedAnswerExportRow[]> {
    const analysis = await this.getValidatedAnalysisData();
    return analysis.detailedRows;
  }

  // ============================================================================
  // 4. EXCELJS EXPORT (.XLSX) WITH EXACTLY 4 SHEETS
  // ============================================================================

  static async exportToExcel(): Promise<void> {
    const currentUser = await AuthService.getCurrentUser();
    if (!currentUser || currentUser.profile.role !== 'admin') {
      throw new Error('Unauthorized: Only administrators are permitted to export yearbook submissions.');
    }

    const analysisData = await this.getValidatedAnalysisData();
    const { students, questions, answerMemoryRows, submissionSummaryRows } = analysisData;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MCA Memories 2025–2027 Yearbook System';
    workbook.lastModifiedBy = 'Administrator';
    workbook.created = new Date();
    workbook.modified = new Date();

    const exportTimestamp = formatExportDateTime(new Date());

    // =========================================================================
    // SHEET 1: Student Details
    // =========================================================================
    const studentSheet = workbook.addWorksheet('Student Details', {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
      properties: { tabColor: { argb: 'FF581C3F' } },
    });

    // Title Banner
    studentSheet.mergeCells('A1:F1');
    const s1Title = studentSheet.getCell('A1');
    s1Title.value = 'MCA MEMORIES 2025–2027 • STUDENT DETAILS';
    s1Title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    s1Title.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF581C3F' },
    };
    s1Title.alignment = { vertical: 'middle', horizontal: 'center' };
    studentSheet.getRow(1).height = 36;

    // Subtitle
    studentSheet.mergeCells('A2:F2');
    const s1Sub = studentSheet.getCell('A2');
    const minRoll = students.length > 0 ? students[0].roll_number : '—';
    const maxRoll = students.length > 0 ? students[students.length - 1].roll_number : '—';
    s1Sub.value = `Total Registered Students: ${students.length} • Roll Numbers: ${minRoll} to ${maxRoll} • Exported on ${exportTimestamp}`;
    s1Sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
    s1Sub.alignment = { vertical: 'middle', horizontal: 'center' };
    studentSheet.getRow(2).height = 22;

    // Column Headers
    studentSheet.getRow(4).values = [
      'Roll Number',
      'Student Full Name',
      'Email Address',
      'Account Status',
      'Password Status',
      'Student Profile ID',
    ];

    studentSheet.columns = [
      { key: 'rollNumber', width: 16 },
      { key: 'fullName', width: 30 },
      { key: 'email', width: 32 },
      { key: 'accountStatus', width: 18 },
      { key: 'passwordStatus', width: 24 },
      { key: 'studentId', width: 40 },
    ];

    const s1HeaderRow = studentSheet.getRow(4);
    s1HeaderRow.height = 26;
    s1HeaderRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF732A54' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD99CA5' } },
        bottom: { style: 'medium', color: { argb: 'FF42112D' } },
      };
    });

    // Populate Student Rows
    students.forEach((student, index) => {
      const rowIndex = 5 + index;
      const row = studentSheet.getRow(rowIndex);
      const passStatus = student.password_changed_at || student.must_change_password === false ? 'Changed' : 'Default (Must Change)';

      row.values = [
        student.roll_number,
        student.full_name,
        student.email || `${student.roll_number.toLowerCase()}@mcafarewell.com`,
        student.is_active ? 'ACTIVE' : 'DISABLED',
        passStatus,
        student.id,
      ];

      row.height = 22;
      const isEven = index % 2 === 0;
      const bgColor = isEven ? 'FFFFFFFF' : 'FFFDF8F5';

      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: bgColor },
        };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE6D5D8' } },
          right: { style: 'thin', color: { argb: 'FFE6D5D8' } },
          left: { style: 'thin', color: { argb: 'FFE6D5D8' } },
        };

        if (colNumber === 1 || colNumber === 4 || colNumber === 5) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });
    });

    studentSheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(5, 4 + students.length), column: 6 } };

    // =========================================================================
    // SHEET 2: Question Bank
    // =========================================================================
    const questionSheet = workbook.addWorksheet('Question Bank', {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
      properties: { tabColor: { argb: 'FFC59B27' } },
    });

    questionSheet.mergeCells('A1:D1');
    const s2Title = questionSheet.getCell('A1');
    s2Title.value = 'MCA MEMORIES 2025–2027 • QUESTION BANK';
    s2Title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    s2Title.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF8F6A0C' },
    };
    s2Title.alignment = { vertical: 'middle', horizontal: 'center' };
    questionSheet.getRow(1).height = 36;

    questionSheet.mergeCells('A2:D2');
    const s2Sub = questionSheet.getCell('A2');
    const activeQuestionsCount = questions.filter((q) => q.is_active).length;
    s2Sub.value = `Total Questions: ${questions.length} • Active Questions: ${activeQuestionsCount} • Exported on ${exportTimestamp}`;
    s2Sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
    s2Sub.alignment = { vertical: 'middle', horizontal: 'center' };
    questionSheet.getRow(2).height = 22;

    questionSheet.getRow(4).values = [
      'Question #',
      'Yearbook Memory Question Prompt',
      'Active Status',
      'Question Record ID',
    ];

    questionSheet.columns = [
      { key: 'qNum', width: 14 },
      { key: 'qText', width: 72 },
      { key: 'status', width: 16 },
      { key: 'qId', width: 40 },
    ];

    const s2HeaderRow = questionSheet.getRow(4);
    s2HeaderRow.height = 26;
    s2HeaderRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFC59B27' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5C672' } },
        bottom: { style: 'medium', color: { argb: 'FF8F6A0C' } },
      };
    });

    questions.forEach((q, index) => {
      const rowIndex = 5 + index;
      const row = questionSheet.getRow(rowIndex);

      row.values = [
        q.question_number,
        q.question_text,
        q.is_active ? 'ACTIVE' : 'INACTIVE',
        q.id,
      ];

      row.height = 24;
      const isEven = index % 2 === 0;
      const bgColor = isEven ? 'FFFFFFFF' : 'FFFDFBF7';

      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: bgColor },
        };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFEEDDC5' } },
          right: { style: 'thin', color: { argb: 'FFEEDDC5' } },
          left: { style: 'thin', color: { argb: 'FFEEDDC5' } },
        };

        if (colNumber === 1 || colNumber === 3) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: colNumber === 2 };
        }
      });
    });

    questionSheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(5, 4 + questions.length), column: 4 } };

    // =========================================================================
    // SHEET 3: Answers - Memory Selections
    // =========================================================================
    const answersSheet = workbook.addWorksheet('Answers - Memory Selections', {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
      properties: { tabColor: { argb: 'FF87426A' } },
    });

    answersSheet.mergeCells('A1:H1');
    const s3Title = answersSheet.getCell('A1');
    s3Title.value = 'MCA MEMORIES 2025–2027 • ANSWERS & MEMORY SELECTIONS';
    s3Title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    s3Title.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF581C3F' },
    };
    s3Title.alignment = { vertical: 'middle', horizontal: 'center' };
    answersSheet.getRow(1).height = 36;

    answersSheet.mergeCells('A2:H2');
    const s3Sub = answersSheet.getCell('A2');
    s3Sub.value = `Total Recorded Selections: ${answerMemoryRows.length} • Required per student: 59 • Confidential Yearbook Data • Exported on ${exportTimestamp}`;
    s3Sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
    s3Sub.alignment = { vertical: 'middle', horizontal: 'center' };
    answersSheet.getRow(2).height = 22;

    answersSheet.getRow(4).values = [
      'Respondent Roll Number',
      'Respondent Name',
      'Question #',
      'Yearbook Memory Question Prompt',
      'Selected Classmate Roll Number',
      'Selected Classmate Name',
      'Answer Record ID',
      'Answered Timestamp',
    ];

    answersSheet.columns = [
      { key: 'respRoll', width: 22 },
      { key: 'respName', width: 28 },
      { key: 'qNum', width: 14 },
      { key: 'qText', width: 62 },
      { key: 'chosenRoll', width: 24 },
      { key: 'chosenName', width: 28 },
      { key: 'ansId', width: 40 },
      { key: 'timestamp', width: 24 },
    ];

    const s3HeaderRow = answersSheet.getRow(4);
    s3HeaderRow.height = 26;
    s3HeaderRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF87426A' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD99CA5' } },
        bottom: { style: 'medium', color: { argb: 'FF42112D' } },
      };
    });

    if (answerMemoryRows.length === 0) {
      const emptyRow = answersSheet.getRow(5);
      emptyRow.values = ['No answers submitted yet.', '', '', '', '', '', '', ''];
      emptyRow.height = 30;
      emptyRow.getCell(1).font = { italic: true, color: { argb: 'FF888888' } };
    } else {
      answerMemoryRows.forEach((rowItem, index) => {
        const rowIndex = 5 + index;
        const row = answersSheet.getRow(rowIndex);

        row.values = [
          rowItem.respondentRollNumber,
          rowItem.respondentName,
          rowItem.questionNumber,
          rowItem.questionText,
          rowItem.selectedClassmateRollNumber,
          rowItem.selectedClassmateName,
          rowItem.answerId,
          formatExportDateTime(rowItem.answeredAt),
        ];

        row.height = 22;
        const isEven = index % 2 === 0;
        const bgColor = isEven ? 'FFFFFFFF' : 'FFFDF8F5';

        row.eachCell((cell, colNumber) => {
          cell.font = { name: 'Calibri', size: 10 };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: bgColor },
          };
          cell.border = {
            bottom: { style: 'thin', color: { argb: 'FFE6D5D8' } },
            right: { style: 'thin', color: { argb: 'FFE6D5D8' } },
            left: { style: 'thin', color: { argb: 'FFE6D5D8' } },
          };

          if (colNumber === 1 || colNumber === 3 || colNumber === 5 || colNumber === 8) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: colNumber === 4 };
          }
        });
      });
    }

    answersSheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(5, 4 + answerMemoryRows.length), column: 8 } };

    // =========================================================================
    // SHEET 4: Submission Summary
    // =========================================================================
    const summarySheet = workbook.addWorksheet('Submission Summary', {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
      properties: { tabColor: { argb: 'FF4A1525' } },
    });

    summarySheet.mergeCells('A1:G1');
    const s4Title = summarySheet.getCell('A1');
    s4Title.value = 'MCA MEMORIES 2025–2027 • SUBMISSION SUMMARY';
    s4Title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    s4Title.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4A1525' },
    };
    s4Title.alignment = { vertical: 'middle', horizontal: 'center' };
    summarySheet.getRow(1).height = 36;

    summarySheet.mergeCells('A2:G2');
    const s4Sub = summarySheet.getCell('A2');
    const submittedCount = submissionSummaryRows.filter((s) => s.submissionStatus === 'SUBMITTED').length;
    s4Sub.value = `Batch of ${submissionSummaryRows.length} Students • ${submittedCount} Completed • ${submissionSummaryRows.length - submittedCount} Pending • 59 Required Answers Denominator • Exported on ${exportTimestamp}`;
    s4Sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
    s4Sub.alignment = { vertical: 'middle', horizontal: 'center' };
    summarySheet.getRow(2).height = 22;

    summarySheet.getRow(4).values = [
      'Roll Number',
      'Student Full Name',
      'Actual Valid Answer Count (of 59)',
      'Distinct-Classmate Count',
      'Submission Status',
      'Submission Timestamp',
      'Account Status',
    ];

    summarySheet.columns = [
      { key: 'rollNumber', width: 16 },
      { key: 'fullName', width: 30 },
      { key: 'answerCount', width: 32 },
      { key: 'distinctCount', width: 26 },
      { key: 'status', width: 22 },
      { key: 'submittedAt', width: 26 },
      { key: 'accountStatus', width: 16 },
    ];

    const s4HeaderRow = summarySheet.getRow(4);
    s4HeaderRow.height = 26;
    s4HeaderRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF581C3F' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD99CA5' } },
        bottom: { style: 'medium', color: { argb: 'FF2A0D15' } },
      };
    });

    submissionSummaryRows.forEach((student, index) => {
      const rowIndex = 5 + index;
      const row = summarySheet.getRow(rowIndex);

      const formattedTime = student.submittedAt
        ? formatExportDateTime(student.submittedAt)
        : '—';

      row.values = [
        student.rollNumber,
        student.studentName,
        `${student.answeredCount} / 59`,
        student.distinctClassmatesCount,
        student.submissionStatus,
        formattedTime,
        student.accountStatus,
      ];

      row.height = 22;
      const isEven = index % 2 === 0;
      const bgColor = isEven ? 'FFFFFFFF' : 'FFFDF8F5';

      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: bgColor },
        };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE6D5D8' } },
          right: { style: 'thin', color: { argb: 'FFE6D5D8' } },
          left: { style: 'thin', color: { argb: 'FFE6D5D8' } },
        };

        if (colNumber === 1 || colNumber === 3 || colNumber === 4 || colNumber === 6 || colNumber === 7) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else if (colNumber === 5) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          if (student.submissionStatus === 'SUBMITTED') {
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1B5E20' } };
          } else if (student.submissionStatus === 'IN PROGRESS') {
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB78103' } };
          } else {
            cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF888888' } };
          }
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });
    });

    summarySheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(5, 4 + submissionSummaryRows.length), column: 7 } };

    // Write buffer and trigger browser download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const nowStr = new Date().toISOString().slice(0, 10);
    const fileName = `MCA_Memories_2025_2027_Yearbook_Responses_${nowStr}.xlsx`;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}
