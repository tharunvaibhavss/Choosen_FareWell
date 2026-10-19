import ExcelJS from 'exceljs';
import { supabase, isSupabaseConfigured } from './supabase';
import { MockStorageService } from './mockStorage';
import type { 
  StudentSummaryItem, 
  DetailedAnswerExportRow, 
  Profile, 
  Question, 
  CreateStudentInput, 
  UpdateStudentInput,
  CreateQuestionInput,
  UpdateQuestionInput 
} from '../types/database';

export class AdminService {
  // ============================================================================
  // 1. STUDENT MANAGEMENT CRUD
  // ============================================================================

  static async getAllStudents(): Promise<Profile[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'student')
          .order('roll_number', { ascending: true });

        if (!error && data) {
          return data as Profile[];
        }
      } catch (err) {
        console.warn('Supabase getAllStudents error:', err);
      }
    }
    return MockStorageService.getAllProfiles().filter((p) => p.role === 'student');
  }

  static async createStudent(input: CreateStudentInput): Promise<{ success: boolean; error?: string; student?: Profile }> {
    if (isSupabaseConfigured && supabase) {
      try {
        const cleanRoll = input.rollNumber.trim().toUpperCase();
        const cleanEmail = input.email.trim().toLowerCase();
        const { data, error } = await supabase.rpc('admin_create_student', {
          p_roll_number: cleanRoll,
          p_full_name: input.fullName.trim(),
          p_email: cleanEmail,
          p_user_id: crypto.randomUUID(),
          p_is_active: input.isActive ?? true,
        });

        if (error) {
          return { success: false, error: error.message };
        }
        if (data && !data.success) {
          return { success: false, error: data.message || 'Creation failed' };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to create student';
        return { success: false, error: msg };
      }
    }

    return MockStorageService.createStudent(input);
  }

  static async updateStudent(id: string, input: UpdateStudentInput): Promise<{ success: boolean; error?: string; student?: Profile }> {
    if (isSupabaseConfigured && supabase) {
      try {
        const cleanRoll = input.rollNumber ? input.rollNumber.trim().toUpperCase() : '';
        const cleanEmail = input.email ? input.email.trim().toLowerCase() : '';
        const { data, error } = await supabase.rpc('admin_update_student', {
          p_student_id: id,
          p_roll_number: cleanRoll,
          p_full_name: input.fullName?.trim() || '',
          p_email: cleanEmail,
          p_is_active: input.isActive ?? true,
        });

        if (error) {
          return { success: false, error: error.message };
        }
        if (data && !data.success) {
          return { success: false, error: data.message || 'Update failed' };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to update student';
        return { success: false, error: msg };
      }
    }

    return MockStorageService.updateStudent(id, input);
  }

  static async toggleStudentStatus(id: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ is_active: isActive })
          .eq('id', id);

        if (error) return { success: false, error: error.message };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to toggle status';
        return { success: false, error: msg };
      }
    }

    return MockStorageService.toggleStudentStatus(id, isActive);
  }

  static async resetStudentPassword(studentId: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    if (!newPassword || newPassword.length < 4) {
      return { success: false, error: 'Password must be at least 4 characters long.' };
    }

    if (isSupabaseConfigured && supabase) {
      try {
        // In Supabase, admin resets password via auth admin API or edge function
        console.log(`Supabase password reset requested for ${studentId}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Password reset failed';
        return { success: false, error: msg };
      }
    }

    MockStorageService.saveStudentPassword(studentId, newPassword);
    return { success: true };
  }

  static async deleteStudent(id: string): Promise<{ success: boolean; error?: string; message: string; softDeleted: boolean }> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.rpc('admin_delete_student', { p_student_id: id });
        if (error) {
          return { success: false, error: error.message, message: '', softDeleted: false };
        }
        return {
          success: true,
          message: data.message || 'Student processed',
          softDeleted: data.soft_deleted || false,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Delete failed';
        return { success: false, error: msg, message: '', softDeleted: false };
      }
    }

    return MockStorageService.deleteStudent(id);
  }

  // ============================================================================
  // 2. QUESTION MANAGEMENT CRUD
  // ============================================================================

  static async getAllQuestions(): Promise<Question[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('questions')
          .select('*')
          .order('question_number', { ascending: true });

        if (!error && data) {
          return data as Question[];
        }
      } catch (err) {
        console.warn('Supabase getAllQuestions error:', err);
      }
    }
    return MockStorageService.getQuestions();
  }

  static async createQuestion(input: CreateQuestionInput): Promise<{ success: boolean; error?: string; question?: Question }> {
    if (isSupabaseConfigured && supabase) {
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

    return MockStorageService.createQuestion(input);
  }

  static async updateQuestion(id: string, input: UpdateQuestionInput): Promise<{ success: boolean; error?: string; question?: Question }> {
    if (isSupabaseConfigured && supabase) {
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

    return MockStorageService.updateQuestion(id, input);
  }

  static async toggleQuestionStatus(id: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('questions')
          .update({ is_active: isActive, updated_at: new Date().toISOString() })
          .eq('id', id);

        if (error) return { success: false, error: error.message };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to toggle question status';
        return { success: false, error: msg };
      }
    }

    return MockStorageService.toggleQuestionStatus(id, isActive);
  }

  static async deleteQuestion(id: string): Promise<{ success: boolean; error?: string; message: string; archived: boolean }> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.rpc('admin_delete_question', { p_question_id: id });
        if (error) {
          return { success: false, error: error.message, message: '', archived: false };
        }
        return {
          success: true,
          message: data.message || 'Question processed',
          archived: data.archived || false,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Delete question failed';
        return { success: false, error: msg, message: '', archived: false };
      }
    }

    return MockStorageService.deleteQuestion(id);
  }

  // ============================================================================
  // 3. SUBMISSION SUMMARIES & REPORTING
  // ============================================================================

  static async getStudentSummaries(): Promise<StudentSummaryItem[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: students, error: studErr } = await supabase
          .from('profiles')
          .select('id, roll_number, full_name, email, is_active')
          .eq('role', 'student')
          .order('roll_number', { ascending: true });

        if (!studErr && students) {
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

            const studentEmail = s.email || `${s.roll_number.toLowerCase()}@mca2527.college`;

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
        }
      } catch (err) {
        console.warn('Supabase getStudentSummaries error, falling back:', err);
      }
    }

    return MockStorageService.getAdminStudentSummaries();
  }

  static async getDetailedAnswers(): Promise<DetailedAnswerExportRow[]> {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('answers')
          .select(`
            created_at,
            updated_at,
            respondent:profiles!answers_respondent_id_fkey(roll_number, full_name),
            question:questions!answers_question_id_fkey(question_number, question_text),
            classmate:profiles!answers_selected_student_id_fkey(roll_number, full_name)
          `);

        if (!error && data) {
          type SupabaseAnswerRow = {
            created_at: string;
            updated_at: string;
            respondent: { roll_number: string; full_name: string } | null;
            question: { question_number: number; question_text: string } | null;
            classmate: { roll_number: string; full_name: string } | null;
          };

          return (data as unknown as SupabaseAnswerRow[]).map((row) => ({
            respondentRollNumber: row.respondent?.roll_number || 'UNKNOWN',
            respondentName: row.respondent?.full_name || 'Unknown Student',
            questionNumber: row.question?.question_number || 0,
            questionText: row.question?.question_text || '',
            selectedClassmateRollNumber: row.classmate?.roll_number || 'UNKNOWN',
            selectedClassmateName: row.classmate?.full_name || 'Unknown Classmate',
            answeredAt: row.updated_at || row.created_at,
          })).sort((a, b) => {
            if (a.respondentRollNumber !== b.respondentRollNumber) {
              return a.respondentRollNumber.localeCompare(b.respondentRollNumber);
            }
            return a.questionNumber - b.questionNumber;
          });
        }
      } catch (err) {
        console.warn('Supabase getDetailedAnswers error, falling back:', err);
      }
    }

    return MockStorageService.getDetailedAnswersForExport();
  }

  // ============================================================================
  // 4. EXCELJS EXPORT (.XLSX) WITH 59 DENOMINATOR
  // ============================================================================

  static async exportToExcel(): Promise<void> {
    const summaries = await this.getStudentSummaries();
    const detailed = await this.getDetailedAnswers();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MCA Memories 2025–2027 Yearbook System';
    workbook.lastModifiedBy = 'Administrator';
    workbook.created = new Date();
    workbook.modified = new Date();

    // SHEET 1: SUBMISSIONS SUMMARY
    const summarySheet = workbook.addWorksheet('Summary Report', {
      views: [{ showGridLines: true }],
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
      { key: 'answeredCount', width: 26 },
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

    // SHEET 2: DETAILED MEMORY ANSWERS
    const detailSheet = workbook.addWorksheet('Detailed Answers', {
      views: [{ showGridLines: true }],
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
