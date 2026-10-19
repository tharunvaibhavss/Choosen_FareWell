import { MCA_72_QUESTIONS } from '../data/defaultQuestions';
import { MCA_60_STUDENTS, ADMIN_ACCOUNT } from '../data/studentsData';
import type { 
  Profile, 
  Question, 
  StudentQuestionOrder, 
  Answer, 
  Submission, 
  StudentSummaryItem,
  DetailedAnswerExportRow,
  CreateStudentInput,
  UpdateStudentInput,
  CreateQuestionInput,
  UpdateQuestionInput
} from '../types/database';

const STORAGE_KEYS = {
  CURRENT_USER: 'mca_current_user',
  PROFILES: 'mca_profiles_v2',
  PASSWORDS: 'mca_passwords_v2',
  QUESTIONS: 'mca_questions_v2',
  STUDENT_ORDERS: 'mca_student_question_orders_v2',
  ANSWERS: 'mca_answers_v1',
  SUBMISSIONS: 'mca_submissions_v1',
};

// Seed deterministic pseudo-random shuffle per student ID so refresh/re-login is 100% persistent
function pseudoRandomShuffle<T>(array: T[], seedStr: string): T[] {
  const result = [...array];
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed << 5) - seed + seedStr.charCodeAt(i);
    seed |= 0;
  }
  
  // Mulberry32 generator
  function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class MockStorageService {
  // 1. Profiles CRUD
  static getAllProfiles(): Profile[] {
    const cached = localStorage.getItem(STORAGE_KEYS.PROFILES);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // fallback to default
      }
    }

    const initialProfiles: Profile[] = [
      {
        id: ADMIN_ACCOUNT.id,
        roll_number: ADMIN_ACCOUNT.rollNumber,
        full_name: ADMIN_ACCOUNT.fullName,
        role: 'admin',
        is_active: true,
        email: ADMIN_ACCOUNT.email,
      },
      ...MCA_60_STUDENTS.map((s) => ({
        id: s.id,
        roll_number: s.rollNumber,
        full_name: s.fullName,
        section: s.section,
        role: 'student' as const,
        is_active: true,
        email: s.email,
      })),
    ];

    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(initialProfiles));
    return initialProfiles;
  }

  static saveProfiles(profiles: Profile[]): void {
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
  }

  static getProfileByRollNumber(rollNumber: string): Profile | null {
    const profiles = this.getAllProfiles();
    const cleanRoll = rollNumber.trim().toUpperCase();
    if (cleanRoll === 'ADMIN' || cleanRoll === 'ADMIN01' || cleanRoll.includes('ADMIN')) {
      return profiles.find((p) => p.role === 'admin') || null;
    }
    return profiles.find((p) => p.roll_number.toUpperCase() === cleanRoll) || null;
  }

  static getProfileById(id: string): Profile | null {
    const profiles = this.getAllProfiles();
    return profiles.find((p) => p.id === id) || null;
  }

  static createStudent(input: CreateStudentInput): { success: boolean; error?: string; student?: Profile } {
    const profiles = this.getAllProfiles();
    const cleanRoll = input.rollNumber.trim().toUpperCase();
    const cleanEmail = (input.email || '').trim().toLowerCase();
    
    if (!cleanRoll) {
      return { success: false, error: 'Roll number is required.' };
    }
    if (!input.fullName.trim()) {
      return { success: false, error: 'Student full name is required.' };
    }
    if (!cleanEmail) {
      return { success: false, error: 'Email address is required.' };
    }

    // Uniqueness validation for roll number
    if (profiles.some((p) => p.roll_number.toUpperCase() === cleanRoll)) {
      return { success: false, error: `Roll number ${cleanRoll} is already registered.` };
    }

    // Uniqueness validation for email
    if (profiles.some((p) => p.email && p.email.toLowerCase() === cleanEmail)) {
      return { success: false, error: `Email address ${cleanEmail} is already registered.` };
    }

    const newStudent: Profile = {
      id: `usr-${cleanRoll.toLowerCase()}-${Date.now().toString().slice(-4)}`,
      roll_number: cleanRoll,
      full_name: input.fullName.trim(),
      role: 'student',
      is_active: input.isActive ?? true,
      email: cleanEmail,
      created_at: new Date().toISOString(),
    };

    profiles.push(newStudent);
    this.saveProfiles(profiles);

    // Save initial password if provided
    if (input.password) {
      this.saveStudentPassword(newStudent.id, input.password);
    }

    return { success: true, student: newStudent };
  }

  static updateStudent(id: string, input: UpdateStudentInput): { success: boolean; error?: string; student?: Profile } {
    const profiles = this.getAllProfiles();
    const index = profiles.findIndex((p) => p.id === id);

    if (index === -1) {
      return { success: false, error: 'Student account not found.' };
    }

    const current = profiles[index];

    // If changing roll number, check uniqueness
    if (input.rollNumber && input.rollNumber.trim().toUpperCase() !== current.roll_number.toUpperCase()) {
      const cleanNewRoll = input.rollNumber.trim().toUpperCase();
      if (profiles.some((p) => p.id !== id && p.roll_number.toUpperCase() === cleanNewRoll)) {
        return { success: false, error: `Roll number ${cleanNewRoll} is already in use by another student.` };
      }
      current.roll_number = cleanNewRoll;
    }

    // If changing email, check uniqueness
    if (input.email && input.email.trim().toLowerCase() !== (current.email || '').toLowerCase()) {
      const cleanNewEmail = input.email.trim().toLowerCase();
      if (profiles.some((p) => p.id !== id && p.email && p.email.toLowerCase() === cleanNewEmail)) {
        return { success: false, error: `Email address ${cleanNewEmail} is already in use by another student.` };
      }
      current.email = cleanNewEmail;
    }

    if (input.fullName !== undefined) current.full_name = input.fullName.trim();
    if (input.isActive !== undefined) current.is_active = input.isActive;

    profiles[index] = current;
    this.saveProfiles(profiles);

    return { success: true, student: current };
  }

  static toggleStudentStatus(id: string, isActive: boolean): { success: boolean; error?: string } {
    const profiles = this.getAllProfiles();
    const student = profiles.find((p) => p.id === id);
    if (!student) return { success: false, error: 'Student not found.' };

    student.is_active = isActive;
    this.saveProfiles(profiles);
    return { success: true };
  }

  static deleteStudent(id: string): { success: boolean; error?: string; message: string; softDeleted: boolean } {
    const profiles = this.getAllProfiles();
    const student = profiles.find((p) => p.id === id);
    if (!student) return { success: false, error: 'Student not found.', message: '', softDeleted: false };

    // Check if student has locked submission
    const hasSubmission = this.isSubmitted(id);
    if (hasSubmission) {
      // Deactivate to preserve historical reporting
      student.is_active = false;
      this.saveProfiles(profiles);
      return {
        success: true,
        softDeleted: true,
        message: `${student.full_name} (${student.roll_number}) has a final submission. The account was safely deactivated to preserve yearbook records.`,
      };
    }

    // If no final submission, delete student and their draft answers
    const filteredProfiles = profiles.filter((p) => p.id !== id);
    this.saveProfiles(filteredProfiles);

    const allAnswers = this.getAllAnswersRaw().filter(
      (a) => a.respondent_id !== id && a.selected_student_id !== id
    );
    localStorage.setItem(STORAGE_KEYS.ANSWERS, JSON.stringify(allAnswers));

    return {
      success: true,
      softDeleted: false,
      message: `Student ${student.full_name} (${student.roll_number}) was deleted successfully.`,
    };
  }

  static saveStudentPassword(studentId: string, password: string): void {
    const passwords = (() => {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.PASSWORDS) || '{}');
      } catch {
        return {};
      }
    })();
    passwords[studentId] = password;
    localStorage.setItem(STORAGE_KEYS.PASSWORDS, JSON.stringify(passwords));
  }

  static getStudentPassword(studentId: string): string | null {
    try {
      const passwords = JSON.parse(localStorage.getItem(STORAGE_KEYS.PASSWORDS) || '{}');
      return passwords[studentId] || null;
    } catch {
      return null;
    }
  }

  // 2. Questions CRUD
  static getQuestions(): Question[] {
    const cached = localStorage.getItem(STORAGE_KEYS.QUESTIONS);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // fallback
      }
    }

    const defaultQs: Question[] = MCA_72_QUESTIONS.map((q) => ({
      id: q.id,
      question_number: q.questionNumber,
      question_text: q.questionText,
      description: `Select the batchmate who represents this memory best.`,
      is_active: q.isActive,
    }));

    localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(defaultQs));
    return defaultQs;
  }

  static saveQuestions(questions: Question[]): void {
    localStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(questions));
  }

  static createQuestion(input: CreateQuestionInput): { success: boolean; error?: string; question?: Question } {
    const questions = this.getQuestions();

    if (input.questionNumber < 1 || input.questionNumber > 72) {
      return { success: false, error: 'Question number must be between 1 and 72.' };
    }
    if (!input.questionText.trim()) {
      return { success: false, error: 'Question title/text is required.' };
    }
    if (questions.some((q) => q.question_number === input.questionNumber)) {
      return { success: false, error: `Question #${input.questionNumber} already exists.` };
    }

    const newQuestion: Question = {
      id: `q-custom-${Date.now()}`,
      question_number: input.questionNumber,
      question_text: input.questionText.trim(),
      description: input.description?.trim() || '',
      is_active: input.isActive ?? true,
      created_at: new Date().toISOString(),
    };

    questions.push(newQuestion);
    questions.sort((a, b) => a.question_number - b.question_number);
    this.saveQuestions(questions);

    return { success: true, question: newQuestion };
  }

  static updateQuestion(id: string, input: UpdateQuestionInput): { success: boolean; error?: string; question?: Question } {
    const questions = this.getQuestions();
    const index = questions.findIndex((q) => q.id === id);

    if (index === -1) {
      return { success: false, error: 'Question not found.' };
    }

    const current = questions[index];

    // If changing number, check uniqueness & range
    if (input.questionNumber !== undefined && input.questionNumber !== current.question_number) {
      if (input.questionNumber < 1 || input.questionNumber > 72) {
        return { success: false, error: 'Question number must be between 1 and 72.' };
      }
      if (questions.some((q) => q.id !== id && q.question_number === input.questionNumber)) {
        return { success: false, error: `Question #${input.questionNumber} already exists.` };
      }
      current.question_number = input.questionNumber;
    }

    if (input.questionText !== undefined) current.question_text = input.questionText.trim();
    if (input.description !== undefined) current.description = input.description.trim();
    if (input.isActive !== undefined) current.is_active = input.isActive;
    current.updated_at = new Date().toISOString();

    questions[index] = current;
    questions.sort((a, b) => a.question_number - b.question_number);
    this.saveQuestions(questions);

    return { success: true, question: current };
  }

  static toggleQuestionStatus(id: string, isActive: boolean): { success: boolean; error?: string } {
    const questions = this.getQuestions();
    const q = questions.find((item) => item.id === id);
    if (!q) return { success: false, error: 'Question not found.' };

    q.is_active = isActive;
    this.saveQuestions(questions);
    return { success: true };
  }

  static deleteQuestion(id: string): { success: boolean; error?: string; message: string; archived: boolean } {
    const questions = this.getQuestions();
    const q = questions.find((item) => item.id === id);
    if (!q) return { success: false, error: 'Question not found.', message: '', archived: false };

    // Check if answers already exist for this question
    const allAnswers = this.getAllAnswersRaw();
    const answersForThisQ = allAnswers.filter((a) => a.question_id === id);

    if (answersForThisQ.length > 0) {
      // Archive / deactivate so historical records remain intact
      q.is_active = false;
      this.saveQuestions(questions);
      return {
        success: true,
        archived: true,
        message: `Question #${q.question_number} has ${answersForThisQ.length} saved answer(s). It was safely archived and marked inactive to protect existing responses.`,
      };
    }

    // Safe to delete if no answers exist
    const filtered = questions.filter((item) => item.id !== id);
    this.saveQuestions(filtered);

    return {
      success: true,
      archived: false,
      message: `Question #${q.question_number} was deleted successfully.`,
    };
  }

  // 3. Persistent randomized student question order (exactly 72 per student)
  static getOrCreateStudentQuestionOrder(studentId: string): StudentQuestionOrder[] {
    const allOrdersMap: Record<string, StudentQuestionOrder[]> = (() => {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.STUDENT_ORDERS) || '{}');
      } catch {
        return {};
      }
    })();

    const activeQuestions = this.getQuestions().filter((q) => q.is_active);
    const questionsMap = new Map(this.getQuestions().map((q) => [q.id, q]));

    // If order already exists and contains all 72 questions, ensure updated question titles/descriptions are refreshed without breaking position
    if (allOrdersMap[studentId] && allOrdersMap[studentId].length === activeQuestions.length && activeQuestions.length === 72) {
      const refreshedOrder = allOrdersMap[studentId].map((o) => {
        const liveQ = questionsMap.get(o.question_id);
        return {
          ...o,
          question_number: liveQ?.question_number ?? o.question_number,
          question_text: liveQ?.question_text ?? o.question_text,
          description: liveQ?.description ?? o.description,
          is_marked_for_review: o.is_marked_for_review ?? false,
        };
      });
      allOrdersMap[studentId] = refreshedOrder;
      localStorage.setItem(STORAGE_KEYS.STUDENT_ORDERS, JSON.stringify(allOrdersMap));
      return refreshedOrder;
    }

    // New randomized order based on active questions
    const shuffled = pseudoRandomShuffle(activeQuestions, studentId);

    const newOrder: StudentQuestionOrder[] = shuffled.map((q, idx) => ({
      id: `ord-${studentId}-${q.id}`,
      respondent_id: studentId,
      question_id: q.id,
      position: idx + 1,
      is_marked_for_review: false,
      question_number: q.question_number,
      question_text: q.question_text,
      description: q.description,
    }));

    allOrdersMap[studentId] = newOrder;
    localStorage.setItem(STORAGE_KEYS.STUDENT_ORDERS, JSON.stringify(allOrdersMap));
    return newOrder;
  }

  static toggleMarkForReview(studentId: string, questionId: string, isMarked: boolean): void {
    const allOrdersMap: Record<string, StudentQuestionOrder[]> = (() => {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.STUDENT_ORDERS) || '{}');
      } catch {
        return {};
      }
    })();

    const studentOrders = allOrdersMap[studentId];
    if (studentOrders) {
      const item = studentOrders.find((o) => o.question_id === questionId);
      if (item) {
        item.is_marked_for_review = isMarked;
        localStorage.setItem(STORAGE_KEYS.STUDENT_ORDERS, JSON.stringify(allOrdersMap));
      }
    }
  }

  // 4. Saved Answers
  static getAllAnswersRaw(): Answer[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.ANSWERS) || '[]');
    } catch {
      return [];
    }
  }

  static getStudentAnswers(studentId: string): Answer[] {
    return this.getAllAnswersRaw().filter((a) => a.respondent_id === studentId);
  }

  static saveAnswer(respondentId: string, questionId: string, selectedStudentId: string): { success: boolean; error?: string } {
    // Check if already submitted
    if (this.isSubmitted(respondentId)) {
      return { success: false, error: 'Questionnaire is locked after final submission.' };
    }

    // Rule C: No self-selection
    if (respondentId === selectedStudentId) {
      return { success: false, error: 'Rule C: You cannot select yourself.' };
    }

    // Check if selected student exists and is active
    const target = this.getProfileById(selectedStudentId);
    if (!target || target.role !== 'student') {
      return { success: false, error: 'Selected classmate is invalid.' };
    }
    if (target.is_active === false) {
      return { success: false, error: 'Selected classmate is currently inactive.' };
    }

    const allAnswers = this.getAllAnswersRaw();

    // Rule B: Check if selected student is already chosen for a different question by this respondent
    const duplicateReuse = allAnswers.find(
      (a) => a.respondent_id === respondentId && 
             a.selected_student_id === selectedStudentId && 
             a.question_id !== questionId
    );

    if (duplicateReuse) {
      return { success: false, error: 'Rule B: This classmate has already been selected for another memory.' };
    }

    // Rule A: Upsert answer for (respondent_id, question_id)
    const existingIndex = allAnswers.findIndex(
      (a) => a.respondent_id === respondentId && a.question_id === questionId
    );

    const now = new Date().toISOString();
    if (existingIndex >= 0) {
      allAnswers[existingIndex] = {
        ...allAnswers[existingIndex],
        selected_student_id: selectedStudentId,
        updated_at: now,
      };
    } else {
      allAnswers.push({
        id: `ans-${respondentId}-${questionId}`,
        respondent_id: respondentId,
        question_id: questionId,
        selected_student_id: selectedStudentId,
        created_at: now,
        updated_at: now,
      });
    }

    localStorage.setItem(STORAGE_KEYS.ANSWERS, JSON.stringify(allAnswers));
    return { success: true };
  }

  static removeAnswer(respondentId: string, questionId: string): { success: boolean; error?: string } {
    if (this.isSubmitted(respondentId)) {
      return { success: false, error: 'Questionnaire is locked after final submission.' };
    }

    const allAnswers = this.getAllAnswersRaw();
    const filtered = allAnswers.filter(
      (a) => !(a.respondent_id === respondentId && a.question_id === questionId)
    );

    localStorage.setItem(STORAGE_KEYS.ANSWERS, JSON.stringify(filtered));
    return { success: true };
  }

  // 5. Final Submission (Rule D: exactly 59 required answers)
  static isSubmitted(studentId: string): boolean {
    const submissions = this.getAllSubmissions();
    return submissions.some((s) => s.student_id === studentId && s.status === 'submitted');
  }

  static getSubmission(studentId: string): Submission | null {
    const submissions = this.getAllSubmissions();
    return submissions.find((s) => s.student_id === studentId) || null;
  }

  static getAllSubmissions(): Submission[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.SUBMISSIONS) || '[]');
    } catch {
      return [];
    }
  }

  static submitQuestionnaire(studentId: string): { success: boolean; error?: string; submission?: Submission } {
    // Idempotency check
    const existing = this.getSubmission(studentId);
    if (existing) {
      return { success: true, submission: existing };
    }

    const answers = this.getStudentAnswers(studentId);

    // Rule D: Exactly 59 answers required
    if (answers.length < 59) {
      return {
        success: false,
        error: `Rule D: Exactly 59 answers required to submit. You have answered ${answers.length} of 59.`,
      };
    }

    // Rule B: Uniqueness check
    const uniqueClassmates = new Set(answers.map((a) => a.selected_student_id));
    if (uniqueClassmates.size !== answers.length) {
      return {
        success: false,
        error: 'Rule B: Duplicate classmate selections found. Each classmate must be chosen at most once.',
      };
    }

    // Rule C: No self-selection
    if (answers.some((a) => a.selected_student_id === studentId)) {
      return {
        success: false,
        error: 'Rule C: Self-selection is not permitted.',
      };
    }

    const newSubmission: Submission = {
      id: `sub-${studentId}-${Date.now()}`,
      student_id: studentId,
      answer_count: answers.length,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    };

    const submissions = this.getAllSubmissions();
    submissions.push(newSubmission);
    localStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(submissions));

    return { success: true, submission: newSubmission };
  }

  // 6. Admin Summaries & Reporting
  static getAdminStudentSummaries(): StudentSummaryItem[] {
    const submissions = this.getAllSubmissions();
    const allAnswers = this.getAllAnswersRaw();
    const students = this.getAllProfiles().filter((p) => p.role === 'student');

    return students.map((student) => {
      const studentSubmission = submissions.find((s) => s.student_id === student.id);
      const studentAnswers = allAnswers.filter((a) => a.respondent_id === student.id);
      const answeredCount = studentAnswers.length;

      let status: StudentSummaryItem['status'] = 'not_started';
      if (studentSubmission && studentSubmission.status === 'submitted') {
        status = 'submitted';
      } else if (answeredCount > 0) {
        status = 'in_progress';
      }

      return {
        id: student.id,
        rollNumber: student.roll_number,
        fullName: student.full_name,
        email: student.email || `${student.roll_number.toLowerCase()}@mca2527.college`,
        isActive: student.is_active ?? true,
        loginIdentifier: student.email || `${student.roll_number.toLowerCase()}@mca2527.college`,
        answeredCount,
        status,
        submittedAt: studentSubmission ? studentSubmission.submitted_at : null,
      };
    });
  }

  static getDetailedAnswersForExport(): DetailedAnswerExportRow[] {
    const allAnswers = this.getAllAnswersRaw();
    const questionsMap = new Map(this.getQuestions().map((q) => [q.id, q]));
    const profilesMap = new Map(this.getAllProfiles().map((p) => [p.id, p]));

    return allAnswers.map((ans) => {
      const respondent = profilesMap.get(ans.respondent_id);
      const question = questionsMap.get(ans.question_id);
      const classmate = profilesMap.get(ans.selected_student_id);

      return {
        respondentRollNumber: respondent?.roll_number || 'UNKNOWN',
        respondentName: respondent?.full_name || 'Unknown Student',
        questionNumber: question?.question_number || 0,
        questionText: question?.question_text || 'Unknown Question',
        selectedClassmateRollNumber: classmate?.roll_number || 'UNKNOWN',
        selectedClassmateName: classmate?.full_name || 'Unknown Classmate',
        answeredAt: ans.updated_at || ans.created_at,
      };
    }).sort((a, b) => {
      if (a.respondentRollNumber !== b.respondentRollNumber) {
        return a.respondentRollNumber.localeCompare(b.respondentRollNumber);
      }
      return a.questionNumber - b.questionNumber;
    });
  }
}
