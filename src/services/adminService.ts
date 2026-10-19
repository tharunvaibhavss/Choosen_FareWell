import ExcelJS from 'exceljs';
import { supabase, isSupabaseConfigured } from './supabase';
import { AuthService } from './authService';
import type { 
  StudentSummaryItem, 
  DetailedAnswerExportRow, 
  StudentQuestionAnalysisRow,
  StudentSelectionSummaryRow,
  Profile, 
  Question, 
  CreateStudentInput, 
  UpdateStudentInput,
  CreateQuestionInput,
  UpdateQuestionInput 
} from '../types/database';

export function parseRollNumber(roll: string | number | undefined | null): number {
  if (typeof roll === 'number') return roll;
  const str = String(roll || '');
  const match = str.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
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
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      return { success: true };
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
      const { data: students, error: studErr } = await supabase
        .from('profiles')
        .select('id, roll_number, full_name, email, is_active')
        .eq('role', 'student')
        .order('roll_number', { ascending: true });

      if (studErr) {
        console.error('Error fetching students for summary:', studErr.message);
        return [];
      }
      if (!students || students.length === 0) {
        return [];
      }

      const { data: submissions } = await supabase
        .from('submissions')
        .select('*');

      const { data: answers } = await supabase
        .from('answers')
        .select('respondent_id');

      const subMap = new Map((submissions || []).map((s) => [s.student_id, s]));
      const countMap = new Map<string, number>();

      (answers || []).forEach((a) => {
        countMap.set(a.respondent_id, (countMap.get(a.respondent_id) || 0) + 1);
      });

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
          status,
          submittedAt: sub ? sub.submitted_at : null,
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
  }> {
    const students = await this.getAllStudents();
    const questions = await this.getAllQuestions();

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

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('answers')
          .select('id, respondent_id, question_id, selected_student_id, created_at, updated_at');

        if (!error && data && data.length > 0) {
          rawAnswers = data as RawAnswerItem[];
        }
      } catch (err) {
        console.warn('Supabase getValidatedAnalysisData answers fetch error:', err);
      }
    }

    // 1. Enforce strict data consistency rules:
    // - One respondent, one original question, one selected student
    // - Exclude self-selections (respondent_id !== selected_student_id)
    // - Exclude duplicate answers for the same (respondent, question)
    // - Ensure valid profile and question records exist
    interface ValidAnswerRecord {
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

    // 2. Build Detailed Rows (Sheet 2)
    const detailedRows: DetailedAnswerExportRow[] = validAnswers.map((a) => ({
      respondentRollNumber: a.respondentRoll,
      respondentName: a.respondentName,
      questionNumber: a.questionNumber,
      questionText: a.questionText,
      selectedClassmateRollNumber: a.selectedStudentRoll,
      selectedClassmateName: a.selectedStudentName,
      answeredAt: a.answeredAt,
    })).sort((a, b) => {
      const rollDiff = parseRollNumber(a.respondentRollNumber) - parseRollNumber(b.respondentRollNumber);
      if (rollDiff !== 0) return rollDiff;
      return a.questionNumber - b.questionNumber;
    });

    // 3. Build Sheet 3: Student & Question Analysis
    // Group answers by selectedStudentId and original questionId
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
      // 4. Sort the respondent roll numbers numerically in ascending order.
      // 5. Keep respondent names in the corresponding order of their roll numbers.
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

    // Sort Sheet 3 rows:
    // 1. Sort selected student names alphabetically in ascending order, A to Z.
    // 2. Within each selected student, sort questions by Repetition Count in descending order, highest to lowest.
    // 3. If two questions have the same count, sort their question text alphabetically.
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

    // 4. Build Sheet 4: Student Selection Summary
    // Sourced from all 60 students, sorted numerically by roll number
    const studentSheet3Map = new Map<string, typeof sheet3Rows>();
    for (const row of sheet3Rows) {
      const list = studentSheet3Map.get(row.selectedStudentId) || [];
      list.push(row);
      studentSheet3Map.set(row.selectedStudentId, list);
    }

    // Sort students by roll number numerically in ascending order (e.g. 1, 2, ... 60)
    const sortedStudents = [...students].sort((a, b) => {
      const numA = parseRollNumber(a.roll_number);
      const numB = parseRollNumber(b.roll_number);
      if (numA !== numB) return numA - numB;
      return a.roll_number.localeCompare(b.roll_number);
    });

    const sheet4Rows: StudentSelectionSummaryRow[] = sortedStudents.map((student) => {
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

      // Explicitly sort qRows for this student: highest repetition count first; tie-break alphabetically by question text
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

    const summaries = await this.getStudentSummaries();
    const analysisData = await this.getValidatedAnalysisData();
    const detailed = analysisData.detailedRows;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MCA Memories 2025–2027 Yearbook System';
    workbook.lastModifiedBy = 'Administrator';
    workbook.created = new Date();
    workbook.modified = new Date();

    // =========================================================================
    // SHEET 1: Summary Report
    // =========================================================================
    const summarySheet = workbook.addWorksheet('Summary Report', {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
      properties: { tabColor: { argb: 'FF581C3F' } },
    });

    // Title Banner
    summarySheet.mergeCells('A1:F1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value = 'MCA MEMORIES 2025–2027 • STUDENT QUESTIONNAIRE SUMMARY';
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF581C3F' },
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    summarySheet.getRow(1).height = 36;

    // Subtitle (Requirement 3: Denominator 59)
    summarySheet.mergeCells('A2:F2');
    const subCell = summarySheet.getCell('A2');
    const submittedCount = summaries.filter((s) => s.status === 'submitted').length;
    subCell.value = `Batch of ${summaries.length} Students • ${submittedCount} Completed • ${summaries.length - submittedCount} Pending • 59 Required Answers Denominator • Exported on ${new Date().toLocaleString()}`;
    subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
    subCell.alignment = { vertical: 'middle', horizontal: 'center' };
    summarySheet.getRow(2).height = 22;

    // Column Headers
    summarySheet.getRow(4).values = [
      'Roll Number',
      'Student Full Name',
      'Account Status',
      'Answered Count (of 59 Required)',
      'Submission Status',
      'Submission Timestamp',
    ];

    summarySheet.columns = [
      { key: 'rollNumber', width: 16 },
      { key: 'fullName', width: 30 },
      { key: 'accountStatus', width: 16 },
      { key: 'answeredCount', width: 28 },
      { key: 'status', width: 20 },
      { key: 'submittedAt', width: 26 },
    ];

    const headerRow = summarySheet.getRow(4);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
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
    summaries.forEach((student, index) => {
      const rowIndex = 5 + index;
      const row = summarySheet.getRow(rowIndex);

      const formattedStatus = 
        student.status === 'submitted' 
          ? 'SUBMITTED' 
          : student.status === 'in_progress' 
            ? 'IN PROGRESS' 
            : 'NOT STARTED';

      const formattedTime = student.submittedAt 
        ? new Date(student.submittedAt).toLocaleString() 
        : '—';

      row.values = [
        student.rollNumber,
        student.fullName,
        student.isActive ? 'ACTIVE' : 'DISABLED',
        `${student.answeredCount} / 59`,
        formattedStatus,
        formattedTime,
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

        if (colNumber === 1 || colNumber === 3 || colNumber === 4) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else if (colNumber === 5) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          if (student.status === 'submitted') {
            cell.font = { bold: true, color: { argb: 'FF1B5E20' } };
          } else if (student.status === 'in_progress') {
            cell.font = { bold: true, color: { argb: 'FFB78103' } };
          } else {
            cell.font = { color: { argb: 'FF888888' } };
          }
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });
    });

    summarySheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(5, 4 + summaries.length), column: 6 } };

    // =========================================================================
    // SHEET 2: Detailed Memory Responses
    // =========================================================================
    const detailSheet = workbook.addWorksheet('Detailed Memory Responses', {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
      properties: { tabColor: { argb: 'FFC59B27' } },
    });

    detailSheet.mergeCells('A1:G1');
    const dTitleCell = detailSheet.getCell('A1');
    dTitleCell.value = 'MCA MEMORIES 2025–2027 • DETAILED MEMORY RESPONSES';
    dTitleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    dTitleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF581C3F' },
    };
    dTitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    detailSheet.getRow(1).height = 36;

    detailSheet.mergeCells('A2:G2');
    const dSubCell = detailSheet.getCell('A2');
    dSubCell.value = `Total Saved Responses: ${detailed.length} • Required per student: 59 • Confidential Yearbook Data`;
    dSubCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
    dSubCell.alignment = { vertical: 'middle', horizontal: 'center' };
    detailSheet.getRow(2).height = 22;

    detailSheet.getRow(4).values = [
      'Respondent Roll No',
      'Respondent Name',
      'Q#',
      'Yearbook Memory Question',
      'Selected Classmate Roll',
      'Selected Classmate Name',
      'Timestamp',
    ];

    detailSheet.columns = [
      { key: 'respRoll', width: 18 },
      { key: 'respName', width: 26 },
      { key: 'qNum', width: 8 },
      { key: 'qText', width: 62 },
      { key: 'chosenRoll', width: 22 },
      { key: 'chosenName', width: 26 },
      { key: 'timestamp', width: 24 },
    ];

    const dHeaderRow = detailSheet.getRow(4);
    dHeaderRow.height = 26;
    dHeaderRow.eachCell((cell) => {
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

    if (detailed.length === 0) {
      const emptyRow = detailSheet.getRow(5);
      emptyRow.values = ['No answers submitted yet.', '', '', '', '', '', ''];
      emptyRow.height = 30;
      emptyRow.getCell(1).font = { italic: true, color: { argb: 'FF888888' } };
    } else {
      detailed.forEach((rowItem, index) => {
        const rowIndex = 5 + index;
        const row = detailSheet.getRow(rowIndex);

        row.values = [
          rowItem.respondentRollNumber,
          rowItem.respondentName,
          rowItem.questionNumber,
          rowItem.questionText,
          rowItem.selectedClassmateRollNumber,
          rowItem.selectedClassmateName,
          new Date(rowItem.answeredAt).toLocaleString(),
        ];

        row.height = 22;
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
          };

          if (colNumber === 1 || colNumber === 3 || colNumber === 5) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          }
        });
      });
    }

    detailSheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(5, 4 + detailed.length), column: 7 } };

    // =========================================================================
    // SHEET 3: Student & Question Analysis
    // =========================================================================
    const sheet3 = workbook.addWorksheet('Student & Question Analysis', {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
      properties: { tabColor: { argb: 'FF87426A' } },
    });

    sheet3.mergeCells('A1:F1');
    const s3Title = sheet3.getCell('A1');
    s3Title.value = 'MCA MEMORIES 2025–2027 • STUDENT & QUESTION ANALYSIS';
    s3Title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    s3Title.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF581C3F' },
    };
    s3Title.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet3.getRow(1).height = 36;

    sheet3.mergeCells('A2:F2');
    const s3Sub = sheet3.getCell('A2');
    s3Sub.value = `Repetition Analysis of Student Nominations • ${analysisData.sheet3Rows.length} Distinct Student-Question Combinations • Exported on ${new Date().toLocaleString()}`;
    s3Sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
    s3Sub.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet3.getRow(2).height = 22;

    sheet3.getRow(4).values = [
      'Selected Student Roll Number',
      'Selected Student Name',
      'Question Text',
      'Repetition Count',
      'Selected By: Respondent Roll Numbers',
      'Selected By: Respondent Names',
    ];

    sheet3.columns = [
      { key: 'selectedRoll', width: 22 },
      { key: 'selectedName', width: 28 },
      { key: 'questionText', width: 55 },
      { key: 'repetitionCount', width: 18 },
      { key: 'respondentRolls', width: 36 },
      { key: 'respondentNames', width: 45 },
    ];

    const s3HeaderRow = sheet3.getRow(4);
    s3HeaderRow.height = 26;
    s3HeaderRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF581C3F' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD99CA5' } },
        bottom: { style: 'medium', color: { argb: 'FF42112D' } },
      };
    });

    if (analysisData.sheet3Rows.length === 0) {
      const emptyRow = sheet3.getRow(5);
      emptyRow.values = ['No student nominations recorded yet.', '', '', 0, '', ''];
      emptyRow.height = 28;
      emptyRow.getCell(1).font = { italic: true, color: { argb: 'FF888888' } };
    } else {
      analysisData.sheet3Rows.forEach((item, idx) => {
        const rowIndex = 5 + idx;
        const row = sheet3.getRow(rowIndex);
        const rollVal = formatRollValue(item.selectedStudentRollNumber);

        row.values = [
          rollVal,
          item.selectedStudentName,
          item.questionText,
          item.repetitionCount,
          item.respondentRollNumbers,
          item.respondentNames,
        ];

        row.height = 26;
        const isEven = idx % 2 === 0;
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

          if (colNumber === 1) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            if (typeof rollVal === 'number') {
              cell.numFmt = '0';
            }
          } else if (colNumber === 4) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.numFmt = '#,##0';
            // Subtle conditional highlight for higher repetition counts
            if (item.repetitionCount >= 5) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF5E6EC' },
              };
              cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF581C3F' } };
            } else if (item.repetitionCount >= 2) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFAF2F5' },
              };
              cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF732A54' } };
            }
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: colNumber === 3 || colNumber === 5 || colNumber === 6 };
          }
        });
      });
    }

    const s3LastRow = Math.max(5, 4 + analysisData.sheet3Rows.length);
    sheet3.autoFilter = { from: { row: 4, column: 1 }, to: { row: s3LastRow, column: 6 } };

    // =========================================================================
    // SHEET 4: Student Selection Summary
    // =========================================================================
    const sheet4 = workbook.addWorksheet('Student Selection Summary', {
      views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
      properties: { tabColor: { argb: 'FF4A1525' } },
    });

    sheet4.mergeCells('A1:F1');
    const s4Title = sheet4.getCell('A1');
    s4Title.value = 'MCA MEMORIES 2025–2027 • STUDENT SELECTION SUMMARY';
    s4Title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    s4Title.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4A1525' },
    };
    s4Title.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet4.getRow(1).height = 36;

    sheet4.mergeCells('A2:F2');
    const s4Sub = sheet4.getCell('A2');
    s4Sub.value = `Comprehensive Selection Totals Across All ${analysisData.sheet4Rows.length} Students • Sorted by Roll Number Numerically • Exported on ${new Date().toLocaleString()}`;
    s4Sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
    s4Sub.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet4.getRow(2).height = 22;

    sheet4.getRow(4).values = [
      'Student Roll Number',
      'Student Name',
      'Total Selections Received',
      'Number of Distinct Questions',
      'Most Frequently Associated Question',
      'Highest Question Repetition Count',
    ];

    sheet4.columns = [
      { key: 'studentRoll', width: 20 },
      { key: 'studentName', width: 28 },
      { key: 'totalSelections', width: 24 },
      { key: 'distinctQuestions', width: 26 },
      { key: 'mostFrequentQuestion', width: 55 },
      { key: 'highestCount', width: 30 },
    ];

    const s4HeaderRow = sheet4.getRow(4);
    s4HeaderRow.height = 26;
    s4HeaderRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4A1525' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD99CA5' } },
        bottom: { style: 'medium', color: { argb: 'FF2A0D15' } },
      };
    });

    analysisData.sheet4Rows.forEach((item, idx) => {
      const rowIndex = 5 + idx;
      const row = sheet4.getRow(rowIndex);
      const rollVal = formatRollValue(item.studentRollNumber);

      row.values = [
        rollVal,
        item.studentName,
        item.totalSelectionsReceived,
        item.distinctQuestionsCount,
        item.mostFrequentlyAssociatedQuestion,
        item.highestQuestionRepetitionCount,
      ];

      row.height = 24;
      const isEven = idx % 2 === 0;
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

        if (colNumber === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          if (typeof rollVal === 'number') {
            cell.numFmt = '0';
          }
        } else if (colNumber === 3 || colNumber === 4 || colNumber === 6) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.numFmt = '#,##0';
          if (colNumber === 3 && item.totalSelectionsReceived >= 10) {
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF581C3F' } };
          }
          if (colNumber === 6 && item.highestQuestionRepetitionCount >= 5) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF5E6EC' },
            };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF581C3F' } };
          }
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: colNumber === 5 };
        }
      });
    });

    const s4LastDataRow = 4 + analysisData.sheet4Rows.length;
    sheet4.autoFilter = { from: { row: 4, column: 1 }, to: { row: s4LastDataRow, column: 6 } };

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
