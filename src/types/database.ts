export type UserRole = 'student' | 'admin';

export interface Profile {
  id: string;
  roll_number: string;
  full_name: string;
  email?: string;
  role: UserRole;
  is_active?: boolean;
  section?: string;
  created_at?: string;
}

export interface Question {
  id: string;
  question_number: number;
  question_text: string;
  description?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StudentQuestionOrder {
  id: string;
  respondent_id: string;
  question_id: string;
  position: number; // 1 to 72
  is_marked_for_review: boolean;
  question_number?: number;
  question_text?: string;
  description?: string;
  created_at?: string;
}

export interface Answer {
  id: string;
  respondent_id: string;
  question_id: string;
  selected_student_id: string;
  created_at: string;
  updated_at: string;
}

export interface Submission {
  id: string;
  student_id: string;
  answer_count: number;
  status: 'submitted' | 'reopened';
  submitted_at: string;
}

export interface StudentSummaryItem {
  id: string;
  rollNumber: string;
  fullName: string;
  email: string;
  isActive: boolean;
  loginIdentifier: string;
  answeredCount: number;
  status: 'submitted' | 'in_progress' | 'not_started';
  submittedAt: string | null;
}

export interface DetailedAnswerExportRow {
  respondentRollNumber: string;
  respondentName: string;
  questionNumber: number;
  questionText: string;
  selectedClassmateRollNumber: string;
  selectedClassmateName: string;
  answeredAt: string;
}

export interface StudentQuestionAnalysisRow {
  selectedStudentRollNumber: string;
  selectedStudentName: string;
  questionText: string;
  repetitionCount: number;
  respondentRollNumbers: string;
  respondentNames: string;
}

export interface StudentSelectionSummaryRow {
  studentRollNumber: string;
  studentName: string;
  totalSelectionsReceived: number;
  distinctQuestionsCount: number;
  mostFrequentlyAssociatedQuestion: string;
  highestQuestionRepetitionCount: number;
}

// Admin Student Management Inputs
export interface CreateStudentInput {
  rollNumber: string;
  fullName: string;
  email: string;
  password?: string;
  isActive?: boolean;
}

export interface UpdateStudentInput {
  rollNumber?: string;
  fullName?: string;
  email?: string;
  isActive?: boolean;
}

export interface ResetPasswordInput {
  studentId: string;
  newPassword: string;
}

// Admin Question Management Inputs
export interface CreateQuestionInput {
  questionNumber: number;
  questionText: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateQuestionInput {
  questionNumber?: number;
  questionText?: string;
  description?: string;
  isActive?: boolean;
}

export type AdminDashboardTab = 'overview' | 'students' | 'questions' | 'submissions' | 'export';
