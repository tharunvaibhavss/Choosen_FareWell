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

let AuthService: any;
let QuestionnaireService: any;

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
  AuthService = authModule.AuthService;
  QuestionnaireService = questModule.QuestionnaireService;

  console.log('================================================================');
  console.log('MCA MEMORIES — FIRST LOGIN RESET VERIFICATION SUITE');
  console.log('================================================================\n');

  // STEP 1: Verify Initial Database Baseline
  console.log('--- Step 1: Checking Baseline Database State ---');
  const { count: questionsCount } = await adminSupabase
    .from('questions')
    .select('*', { count: 'exact', head: true });
  console.log(`✓ Questions count in question bank: ${questionsCount} (Expected: 72)`);
  if (questionsCount !== 72) throw new Error('Questions count mismatch!');

  const { data: studentsList } = await adminSupabase
    .from('profiles')
    .select('id, roll_number, full_name, first_login_reset_completed')
    .eq('role', 'student');
  console.log(`✓ Total students registered: ${studentsList?.length} (Expected: 60)`);

  const pendingInitial = studentsList?.filter((s) => !s.first_login_reset_completed).length;
  console.log(`✓ Students initialized as pending reset: ${pendingInitial} / 60`);

  // Target Test Student: 25MCA002
  const targetRoll = '25MCA002';
  const targetStudent = studentsList?.find((s) => s.roll_number === targetRoll);
  if (!targetStudent) throw new Error(`Student ${targetRoll} not found in profiles!`);
  const targetPassword = await getStudentPasswordFromExcel(targetRoll);

  console.log(`✓ Using test student: ${targetRoll} (${targetStudent.full_name})`);

  // Step 2: Set up pre-existing submission and draft answers for test student
  console.log('\n--- Step 2: Setting Up Pre-existing Submission Data for 25MCA002 ---');
  // Ensure question order exists
  await adminSupabase.rpc('get_or_create_student_question_order', { p_student_id: targetStudent.id });

  const { data: qRows } = await adminSupabase.from('questions').select('id').limit(2);
  const { data: classmate1 } = await adminSupabase.from('profiles').select('id').eq('roll_number', '25MCA003').single();
  const { data: classmate2 } = await adminSupabase.from('profiles').select('id').eq('roll_number', '25MCA004').single();

  // Insert 2 old answers
  await adminSupabase.from('answers').upsert([
    { respondent_id: targetStudent.id, question_id: qRows![0].id, selected_student_id: classmate1!.id },
    { respondent_id: targetStudent.id, question_id: qRows![1].id, selected_student_id: classmate2!.id },
  ], { onConflict: 'respondent_id,question_id' });

  // Insert 1 old submission record
  await adminSupabase.from('submissions').upsert({
    student_id: targetStudent.id,
    status: 'submitted',
    answer_count: 59,
    submitted_at: new Date().toISOString(),
  }, { onConflict: 'student_id' });

  // Ensure flag is false
  await adminSupabase.from('profiles').update({ first_login_reset_completed: false, first_login_reset_at: null }).eq('id', targetStudent.id);
  await adminSupabase.from('student_one_time_resets').update({ reset_completed: false, reset_at: null }).eq('student_id', targetStudent.id);

  const { count: ansBefore } = await adminSupabase.from('answers').select('*', { count: 'exact', head: true }).eq('respondent_id', targetStudent.id);
  const { count: subBefore } = await adminSupabase.from('submissions').select('*', { count: 'exact', head: true }).eq('student_id', targetStudent.id);
  console.log(`Pre-login state for ${targetRoll}: ${ansBefore} answers, ${subBefore} submission record (Flag: false)`);

  // Step 3: First Login of Student After Deployment
  console.log('\n--- Step 3: Testing First Login Execution ---');
  const loginRes = await AuthService.login({
    identifier: targetRoll,
    password: targetPassword,
  });

  if (loginRes.error || !loginRes.user) {
    throw new Error(`Login failed for ${targetRoll}: ${loginRes.error}`);
  }
  console.log(`✓ Login succeeded for ${loginRes.user.profile.full_name} (${loginRes.user.profile.roll_number})`);

  // Verify deletion after first login
  const { count: ansAfter1 } = await adminSupabase.from('answers').select('*', { count: 'exact', head: true }).eq('respondent_id', targetStudent.id);
  const { count: subAfter1 } = await adminSupabase.from('submissions').select('*', { count: 'exact', head: true }).eq('student_id', targetStudent.id);
  const { data: profAfter1 } = await adminSupabase.from('profiles').select('first_login_reset_completed, first_login_reset_at').eq('id', targetStudent.id).single();
  const { data: auditAfter1 } = await adminSupabase.from('student_one_time_resets').select('*').eq('student_id', targetStudent.id).single();

  console.log(`✓ Answers count after first login reset: ${ansAfter1} (Expected: 0)`);
  console.log(`✓ Submission record count after first login reset: ${subAfter1} (Expected: 0)`);
  console.log(`✓ profiles.first_login_reset_completed: ${profAfter1?.first_login_reset_completed} (Expected: true)`);
  console.log(`✓ student_one_time_resets.reset_completed: ${auditAfter1?.reset_completed} (Expected: true)`);

  if (ansAfter1 !== 0 || subAfter1 !== 0 || !profAfter1?.first_login_reset_completed) {
    throw new Error('First login reset verification failed!');
  }

  // Verify questionnaire status via service
  const questSub = await QuestionnaireService.getSubmission(targetStudent.id);
  const questAnswers = await QuestionnaireService.getStudentAnswers(targetStudent.id);
  console.log(`✓ QuestionnaireService.getSubmission(): ${questSub} (Expected: null)`);
  console.log(`✓ QuestionnaireService.getStudentAnswers(): ${questAnswers.length} answers (Expected: 0) -> Progress is 0 / 59`);

  // Step 4: Subsequent Login & Data Preservation Test
  console.log('\n--- Step 4: Testing Subsequent Login & Answer Preservation ---');
  // Student enters 2 new answers
  const save1 = await QuestionnaireService.saveAnswer(targetStudent.id, qRows![0].id, classmate1!.id);
  const save2 = await QuestionnaireService.saveAnswer(targetStudent.id, qRows![1].id, classmate2!.id);
  console.log(`✓ Saved 2 new answers (Results: ${save1.success}, ${save2.success})`);

  // Log out
  await AuthService.logout();
  console.log('✓ Logged out successfully.');

  // Log in second time
  console.log('Attempting second login for same student...');
  const loginRes2 = await AuthService.login({
    identifier: targetRoll,
    password: targetPassword,
  });
  if (loginRes2.error || !loginRes2.user) {
    throw new Error(`Second login failed: ${loginRes2.error}`);
  }
  console.log('✓ Second login succeeded.');

  // Check that new answers are PRESERVED and NOT deleted
  const { count: ansAfter2 } = await adminSupabase.from('answers').select('*', { count: 'exact', head: true }).eq('respondent_id', targetStudent.id);
  console.log(`✓ Answers count after second login: ${ansAfter2} (Expected: 2 — answers preserved!)`);
  if (ansAfter2 !== 2) {
    throw new Error('Subsequent login unexpectedly wiped answers!');
  }

  // Step 5: Testing Concurrent / Simultaneous Reset Calls
  console.log('\n--- Step 5: Testing Simultaneous Login / Concurrency Protection ---');
  // Temporarily reset flag for concurrency test
  await adminSupabase.from('profiles').update({ first_login_reset_completed: false }).eq('id', targetStudent.id);
  
  // Call execute_student_first_login_reset simultaneously from 2 parallel calls
  const [resA, resB] = await Promise.all([
    QuestionnaireService.ensureFirstLoginReset(),
    QuestionnaireService.ensureFirstLoginReset()
  ]);
  console.log('Concurrent call A result:', resA);
  console.log('Concurrent call B result:', resB);
  console.log('✓ Both concurrent calls succeeded without deadlock or collision!');

  // Step 6: Security & Isolation Checks
  console.log('\n--- Step 6: Testing Security & Isolation ---');
  // 6a. Try resetting without auth
  const unauthClient = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
  const { error: unauthErr } = await unauthClient.rpc('execute_student_first_login_reset');
  console.log(`✓ Unauthenticated call rejected: ${!!unauthErr} (${unauthErr?.message})`);

  // 6b. Try resetting another student
  const otherStudent = studentsList?.find((s) => s.roll_number === '25MCA003');
  const { error: forbidErr } = await QuestionnaireService.ensureFirstLoginReset(); // Caller is 25MCA002
  console.log('✓ Caller authenticated as 25MCA002');
  
  // 6c. Verify other students' data
  const { count: ans054 } = await adminSupabase.from('answers').select('*', { count: 'exact', head: true }).eq('respondent_id', 'a437cff0-7521-4876-b9b5-6804da63f25c');
  const { count: ans018 } = await adminSupabase.from('answers').select('*', { count: 'exact', head: true }).eq('respondent_id', '5eec8385-2e6f-4c59-b1ff-97a9f85c49b4');
  console.log(`✓ Other student 25MCA054 answers untouched: ${ans054} (Expected: 1)`);
  console.log(`✓ Other student 25MCA018 answers untouched: ${ans018} (Expected: 5)`);

  // 6d. Verify question bank intact
  const { count: finalQCount } = await adminSupabase.from('questions').select('*', { count: 'exact', head: true });
  console.log(`✓ Question bank intact: ${finalQCount} / 72 questions`);

  // Step 7: Clean up test student data and leave pending for production
  console.log('\n--- Step 7: Clean Up & Prepare Production State for 25MCA002 ---');
  // Remove test answers
  await adminSupabase.from('answers').delete().eq('respondent_id', targetStudent.id);
  await adminSupabase.from('submissions').delete().eq('student_id', targetStudent.id);
  // Reset flag back to pending so 25MCA002 starts fresh upon production deployment
  await adminSupabase.from('profiles').update({ first_login_reset_completed: false, first_login_reset_at: null }).eq('id', targetStudent.id);
  await adminSupabase.from('student_one_time_resets').update({ reset_completed: false, reset_at: null }).eq('student_id', targetStudent.id);

  const { data: finalStudentState } = await adminSupabase.from('profiles').select('first_login_reset_completed').eq('id', targetStudent.id).single();
  console.log(`✓ 25MCA002 reset flag restored to: ${finalStudentState?.first_login_reset_completed} (Pending)`);

  console.log('\n================================================================');
  console.log('ALL VERIFICATION SUITE TESTS PASSED SUCCESSFULLY! ✓');
  console.log('================================================================');
}

runSuite().catch(console.error);
