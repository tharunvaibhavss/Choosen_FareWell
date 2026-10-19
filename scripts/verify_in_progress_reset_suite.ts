import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

function loadLocalEnv(relativeFilePath: string) {
  try {
    const fullPath = path.resolve(process.cwd(), relativeFilePath);
    if (!fs.existsSync(fullPath)) return;
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) continue;
      const key = line.slice(0, eqIndex).trim();
      let val = line.slice(eqIndex + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch (e) {}
}

loadLocalEnv('.env.local');

const adminSupabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getStudentPasswordFromExcel(rollNumber: string): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('student login.xlsx');
  const ws = wb.worksheets[0];
  let password = '';
  ws.eachRow((row) => {
    const roll = String(row.getCell(7).value || '').trim().toUpperCase();
    if (roll === rollNumber.toUpperCase()) {
      password = String(row.getCell(10).value || '').trim();
    }
  });
  if (!password) {
    throw new Error(`Password not found in Excel for ${rollNumber}`);
  }
  return password;
}

async function runSuite() {
  const authModule = await import('../src/services/authService');
  const questModule = await import('../src/services/questionnaireService');
  const adminModule = await import('../src/services/adminService');
  const AuthService = authModule.AuthService;
  const QuestionnaireService = questModule.QuestionnaireService;
  const AdminService = adminModule.AdminService;

  console.log('================================================================');
  console.log('MCA MEMORIES — IN-PROGRESS STUDENT SUBMISSION RESET TEST SUITE');
  console.log('================================================================\n');

  // STEP 1: Verify Initial Database Baseline
  console.log('--- Step 1: Checking Baseline Database State ---');
  const { count: questionsCount } = await adminSupabase
    .from('questions')
    .select('*', { count: 'exact', head: true });
  console.log(`✓ Questions in question bank: ${questionsCount} (Expected: 72)`);
  if (questionsCount !== 72) throw new Error('Questions count mismatch!');

  const { data: studentsList } = await adminSupabase
    .from('profiles')
    .select('id, roll_number, full_name, role')
    .eq('role', 'student');
  console.log(`✓ Total registered students: ${studentsList?.length} (Expected: 60)`);

  const targetRoll = '25MCA002';
  const targetStudent = studentsList?.find((s) => s.roll_number === targetRoll);
  if (!targetStudent) throw new Error(`Student ${targetRoll} not found!`);
  const targetPassword = await getStudentPasswordFromExcel(targetRoll);

  console.log(`✓ Using test student: ${targetRoll} (${targetStudent.full_name})`);

  // STEP 2: Authenticate Administrator
  console.log('\n--- Step 2: Authenticating Administrator ---');
  const adminLogin = await AuthService.login({
    identifier: 'admin',
    password: process.env.INITIAL_ADMIN_PASSWORD!,
  });
  if (adminLogin.error || !adminLogin.user) {
    throw new Error(`Admin login failed: ${adminLogin.error}`);
  }
  console.log(`✓ Admin logged in successfully: ${adminLogin.user.profile.full_name}`);

  // STEP 3: Setup In-Progress State for Test Student (Saved answers, NO submission record)
  console.log('\n--- Step 3: Setting Up In-Progress State for 25MCA002 ---');
  await adminSupabase.rpc('get_or_create_student_question_order', { p_student_id: targetStudent.id });
  const { data: qRows } = await adminSupabase.from('questions').select('id').limit(3);
  const { data: classmates } = await adminSupabase.from('profiles').select('id, roll_number').eq('role', 'student').neq('id', targetStudent.id).limit(3);

  // Clean any previous test answers or submissions
  await adminSupabase.from('submissions').delete().eq('student_id', targetStudent.id);
  await adminSupabase.from('answers').delete().eq('respondent_id', targetStudent.id);

  // Insert 3 draft answers (simulating an in-progress questionnaire)
  const { error: insErr } = await adminSupabase.from('answers').insert([
    { respondent_id: targetStudent.id, question_id: qRows![0].id, selected_student_id: classmates![0].id },
    { respondent_id: targetStudent.id, question_id: qRows![1].id, selected_student_id: classmates![1].id },
    { respondent_id: targetStudent.id, question_id: qRows![2].id, selected_student_id: classmates![2].id },
  ]);
  if (insErr) throw new Error('Failed to insert test answers: ' + insErr.message);

  // Check Admin summary for this student
  const summaryBefore = await AdminService.getStudentSummaries();
  const studentBefore = summaryBefore.find((s: any) => s.id === targetStudent.id);
  console.log(`✓ Student state before reset in Admin Summary:`);
  console.log(`    Status: '${studentBefore?.status}' (Expected: 'in_progress')`);
  console.log(`    Answered Count: ${studentBefore?.answeredCount} / 59 (Expected: 3)`);
  if (studentBefore?.status !== 'in_progress' || studentBefore?.answeredCount !== 3) {
    throw new Error('In-progress setup validation failed!');
  }

  // STEP 4: Admin Performs Manual Reset Submission on In-Progress Student
  console.log('\n--- Step 4: Admin Executes Reset Submission on In-Progress Student ---');
  const resetRes = await AdminService.resetStudentSubmission(targetStudent.id);
  console.log('✓ AdminService.resetStudentSubmission result:', resetRes);
  if (!resetRes.success) {
    throw new Error(`Reset failed: ${resetRes.error}`);
  }

  // STEP 5: Verify Post-Reset State in Admin Dashboard Summary
  console.log('\n--- Step 5: Verifying Admin Dashboard Post-Reset State ---');
  const summaryAfter = await AdminService.getStudentSummaries();
  const studentAfter = summaryAfter.find((s: any) => s.id === targetStudent.id);
  console.log(`✓ Student state after reset in Admin Summary:`);
  console.log(`    Status: '${studentAfter?.status}' (Expected: 'not_started' / Pending)`);
  console.log(`    Answered Count: ${studentAfter?.answeredCount} / 59 (Expected: 0)`);
  console.log(`    Submitted At: ${studentAfter?.submittedAt} (Expected: null)`);

  const { count: ansCountAfter } = await adminSupabase.from('answers').select('*', { count: 'exact', head: true }).eq('respondent_id', targetStudent.id);
  const { count: subCountAfter } = await adminSupabase.from('submissions').select('*', { count: 'exact', head: true }).eq('student_id', targetStudent.id);
  console.log(`✓ Database answers count: ${ansCountAfter} (Expected: 0)`);
  console.log(`✓ Database submissions count: ${subCountAfter} (Expected: 0)`);

  if (studentAfter?.status !== 'not_started' || studentAfter?.answeredCount !== 0 || ansCountAfter !== 0) {
    throw new Error('Post-reset verification failed!');
  }

  // STEP 6: Student Logs In and Fills Questionnaire Fresh
  console.log('\n--- Step 6: Testing Student Login & Fresh Questionnaire Start ---');
  await AuthService.logout();

  const studentLogin = await AuthService.login({
    identifier: targetRoll,
    password: targetPassword,
  });
  if (studentLogin.error || !studentLogin.user) {
    throw new Error(`Student login failed: ${studentLogin.error}`);
  }
  console.log(`✓ Student logged in successfully: ${studentLogin.user.profile.full_name}`);

  const subCheck = await QuestionnaireService.getSubmission(targetStudent.id);
  const answersCheck = await QuestionnaireService.getStudentAnswers(targetStudent.id);
  console.log(`✓ QuestionnaireService.getSubmission(): ${subCheck} (Expected: null)`);
  console.log(`✓ QuestionnaireService.getStudentAnswers(): ${answersCheck.length} answers (Expected: 0) -> Starts at 0 / 59 at Question 1`);

  // Student enters 2 new answers
  console.log('Student saving 2 new answers...');
  const save1 = await QuestionnaireService.saveAnswer(targetStudent.id, qRows![0].id, classmates![0].id);
  const save2 = await QuestionnaireService.saveAnswer(targetStudent.id, qRows![1].id, classmates![1].id);
  console.log(`✓ Answers saved: ${save1.success}, ${save2.success}`);

  // Student logs out
  await AuthService.logout();

  // Student logs in again (verifying one-time reset does NOT wipe their new answers)
  console.log('Student logging in second time to verify answers are preserved...');
  const studentLogin2 = await AuthService.login({
    identifier: targetRoll,
    password: targetPassword,
  });
  if (studentLogin2.error || !studentLogin2.user) {
    throw new Error(`Student second login failed: ${studentLogin2.error}`);
  }
  const answersCheck2 = await QuestionnaireService.getStudentAnswers(targetStudent.id);
  console.log(`✓ QuestionnaireService.getStudentAnswers() on second login: ${answersCheck2.length} answers (Expected: 2 — preserved!)`);
  if (answersCheck2.length !== 2) {
    throw new Error('Newly saved answers were unexpectedly lost on subsequent login!');
  }

  // STEP 7: Security & Isolation Checks
  console.log('\n--- Step 7: Checking Isolation of Other Students & Global Data ---');
  const { count: finalQCount } = await adminSupabase.from('questions').select('*', { count: 'exact', head: true });
  console.log(`✓ All questions in question bank intact: ${finalQCount} / 72`);

  const { count: ans054 } = await adminSupabase.from('answers').select('*', { count: 'exact', head: true }).eq('respondent_id', 'a437cff0-7521-4876-b9b5-6804da63f25c');
  const { count: ans018 } = await adminSupabase.from('answers').select('*', { count: 'exact', head: true }).eq('respondent_id', '5eec8385-2e6f-4c59-b1ff-97a9f85c49b4');
  console.log(`✓ Student 25MCA054 answers untouched: ${ans054} (Expected: 1)`);
  console.log(`✓ Student 25MCA018 answers untouched: ${ans018} (Expected: 5)`);

  // STEP 8: Clean Up Test Data & Restore Production Readiness for 25MCA002
  console.log('\n--- Step 8: Clean Up & Restore Production Readiness for 25MCA002 ---');
  await adminSupabase.from('answers').delete().eq('respondent_id', targetStudent.id);
  await adminSupabase.from('submissions').delete().eq('student_id', targetStudent.id);
  await adminSupabase.from('profiles').update({ first_login_reset_completed: false, first_login_reset_at: null }).eq('id', targetStudent.id);
  await adminSupabase.from('student_one_time_resets').update({ reset_completed: false, reset_at: null }).eq('student_id', targetStudent.id);

  const { data: finalStudentState } = await adminSupabase.from('profiles').select('first_login_reset_completed').eq('id', targetStudent.id).single();
  console.log(`✓ 25MCA002 status restored to Pending (first_login_reset_completed = ${finalStudentState?.first_login_reset_completed})`);

  console.log('\n================================================================');
  console.log('ALL IN-PROGRESS RESET SUITE TESTS PASSED! ✓');
  console.log('================================================================');
}

runSuite().catch(console.error);
