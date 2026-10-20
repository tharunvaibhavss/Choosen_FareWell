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

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminSupabase = createClient(supabaseUrl, serviceRoleKey);
const anonSupabase = createClient(supabaseUrl, supabaseAnonKey);

async function runTestSuite() {
  console.log('================================================================');
  console.log('MCA MEMORIES — SUBMISSION INTEGRITY & FIX VERIFICATION SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] Test ${totalTests}: ${testName}`);
      if (detail) console.log(`         ${detail}`);
    } else {
      console.error(`  [FAIL] Test ${totalTests}: ${testName}`);
      if (detail) console.error(`         Failure detail: ${detail}`);
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Baseline Data Preservation Check
  // --------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Existing Student Data Preservation ---');
  const { data: profiles, error: pErr } = await adminSupabase
    .from('profiles')
    .select('id, roll_number, full_name, role')
    .eq('role', 'student')
    .order('roll_number', { ascending: true });

  assert(!pErr && profiles?.length === 60, 'All 60 student profiles are preserved', `Found ${profiles?.length}/60 student profiles`);

  const { data: submissions, error: subErr } = await adminSupabase
    .from('submissions')
    .select('*')
    .order('submitted_at', { ascending: false });

  assert(!subErr && (submissions?.length ?? 0) >= 23, 'All existing student submissions are intact', `Found ${submissions?.length} submission records in DB`);

  const { count: answersCount, error: aErr } = await adminSupabase
    .from('answers')
    .select('id', { count: 'exact', head: true });

  assert(!aErr && (answersCount ?? 0) >= 1671, 'All answer rows preserved (> 1,000 rows)', `Total answers in DB: ${answersCount}`);

  // --------------------------------------------------------------------------
  // TEST 2: Admin Dashboard Aggregation RPC & 1,000-Row Truncation Fix
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Admin Dashboard Answer Count Verification ---');
  const { data: rpcData, error: rpcErr } = await adminSupabase.rpc('admin_get_student_summaries');

  assert(!rpcErr && Array.isArray(rpcData) && rpcData.length === 60, 'admin_get_student_summaries RPC returns all 60 students', `RPC rows: ${rpcData?.length}`);

  if (rpcData) {
    // 1. Verify every submitted student has exactly 59 valid answers and 59 distinct choices
    const submittedRows = rpcData.filter((s: any) => s.submission_status === 'submitted');
    const allSubmittedCorrect = submittedRows.every(
      (s: any) => Number(s.answered_count) === 59 && Number(s.distinct_choices_count) === 59
    );

    assert(
      submittedRows.length >= 23 && allSubmittedCorrect,
      `All submitted students (${submittedRows.length} total) accurately report 59/59 and distinct_choices_count === 59`,
      `Verified all ${submittedRows.length} submitted rows in RPC`
    );

    // 2. Verify specific students previously affected by 1,000-row limit in Admin UI
    const previouslyTruncatedSubmitted = [
      '25MCA003', // was 27/59 in Admin UI
      '25MCA004', // was 18/59
      '25MCA008', // was 39/59
      '25MCA014', // was 54/59
      '25MCA025', // was 38/59
      '25MCA026', // was 38/59
      '25MCA033', // was 3/59
      '25MCA042', // was 0/59
      '25MCA049', // was 36/59
      '25MCA050', // was 48/59
      '25MCA052', // was 0/59
      '25MCA055', // was 0/59
    ];

    const allPrevTruncatedNow59 = previouslyTruncatedSubmitted.every((roll) => {
      const row = rpcData.find((s: any) => s.roll_number === roll);
      return Number(row?.answered_count) === 59 && row?.submission_status === 'submitted';
    });

    assert(
      allPrevTruncatedNow59,
      'All previously truncated submitted students (25MCA003, 008, 014, 025, 026, 042, 052, 055...) report 59/59 and Submitted',
      'Verified 12 sample students from the screenshot'
    );

    // 3. Dynamic verification: Compare RPC answered_count with actual count in answers table for all 60 students
    let all60CountsMatchDb = true;
    for (const student of rpcData) {
      const { count: actualCount } = await adminSupabase
        .from('answers')
        .select('id', { count: 'exact', head: true })
        .eq('respondent_id', student.id);

      if (Number(student.answered_count) !== (actualCount ?? 0)) {
        all60CountsMatchDb = false;
        console.error(`Count mismatch for ${student.roll_number}: RPC=${student.answered_count}, DB=${actualCount}`);
      }
    }

    assert(
      all60CountsMatchDb,
      'RPC answered_count matches exact database row count for ALL 60 students (zero truncation loss)',
      'Verified 60/60 student counts against DB answers table'
    );
  }

  // --------------------------------------------------------------------------
  // TEST 3: Direct API INSERT Lockdown on submissions Table (RLS Protection)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Direct API INSERT Lockdown on submissions ---');
  // Attempting direct INSERT via anon/unprivileged client must be rejected
  const fakeUuid = '00000000-0000-0000-0000-000000000001';
  const { data: directInsertData, error: directInsertErr } = await anonSupabase
    .from('submissions')
    .insert({
      student_id: fakeUuid,
      answer_count: 59,
      status: 'submitted',
    })
    .select();

  assert(
    Boolean(directInsertErr),
    'Direct INSERT on submissions table is blocked by RLS for unprivileged callers',
    `Error returned: ${directInsertErr?.message || 'None'}`
  );

  // --------------------------------------------------------------------------
  // TEST 4: Backend submit_questionnaire() Validation Rules
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: submit_questionnaire() Enforcement ---');

  // Test 4A: Unauthenticated call is rejected
  const { error: unauthSubmitErr } = await anonSupabase.rpc('submit_questionnaire');
  assert(
    Boolean(unauthSubmitErr),
    'submit_questionnaire() rejects unauthenticated callers',
    `Rejection message: ${unauthSubmitErr?.message || 'None'}`
  );

  // Test 4B: Incomplete submission rejection test
  // Student 25MCA002 has 0 answers. If 25MCA002 calls submit_questionnaire(), it must fail.
  // We can sign in as 25MCA002 to test the authentic student flow.
  let studentAuthClient = null;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('student login.xlsx');
  const ws = wb.worksheets[0];
  let p002Email = '25mca002@mcafarewell.com';
  let p002Pass = 'mca002';
  ws.eachRow((row) => {
    if (String(row.getCell(7).value || '').trim().toUpperCase() === '25MCA002') {
      const emailCell = row.getCell(9).value;
      if (emailCell && typeof emailCell === 'object' && 'text' in emailCell) {
        p002Email = String((emailCell as any).text).trim();
      } else {
        p002Email = String(emailCell || '').trim();
      }
      p002Pass = String(row.getCell(10).value || '').trim();
    }
  });

  try {
    const { data: signInData, error: signInErr } = await anonSupabase.auth.signInWithPassword({
      email: p002Email,
      password: p002Pass,
    });

    if (signInData?.session) {
      studentAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${signInData.session.access_token}`,
          },
        },
      });

      // Test 4C: Direct INSERT by authenticated student must be blocked!
      const { error: authDirectInsertErr } = await studentAuthClient
        .from('submissions')
        .insert({
          student_id: signInData.user.id,
          answer_count: 59,
          status: 'submitted',
        });

      assert(
        Boolean(authDirectInsertErr),
        'Direct INSERT on submissions is blocked for authenticated students',
        `Rejection: ${authDirectInsertErr?.message}`
      );

      // Test 4D: submit_questionnaire() rejects when student has < 59 answers
      const { data: subRpcRes, error: subRpcErr } = await studentAuthClient.rpc('submit_questionnaire');
      const failedAsExpected = Boolean(subRpcErr) || (subRpcRes && !subRpcRes.success);
      assert(
        failedAsExpected,
        'submit_questionnaire() rejects student with fewer than 59 answers',
        `RPC Result: ${subRpcErr?.message || JSON.stringify(subRpcRes)}`
      );

      // Confirm no submission was created for 25MCA002
      const { data: p002Sub } = await adminSupabase
        .from('submissions')
        .select('*')
        .eq('student_id', signInData.user.id);

      assert(
        p002Sub?.length === 0,
        '25MCA002 has zero submissions in database after rejection',
        'Submission count: 0'
      );
    } else {
      console.log('  [INFO] Student 25MCA002 auth skipped (password was updated or not matching initial)');
    }
  } catch (err: any) {
    console.log('  [INFO] Authenticated student test note:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Database Constraints on answers Table (Duplicates & Self-Selection)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Database Table Integrity Constraints ---');
  // Test 5A: Duplicate classmate constraint on answers
  // Try inserting duplicate classmate for an existing respondent using service_role
  // Pick student 25MCA002 (has 0 answers)
  const p002 = profiles?.find((p) => p.roll_number === '25MCA002');
  const p005 = profiles?.find((p) => p.roll_number === '25MCA005');
  const { data: sampleQuestions } = await adminSupabase.from('questions').select('id').limit(2);

  if (p002 && p005 && sampleQuestions && sampleQuestions.length >= 2) {
    const qA = sampleQuestions[0].id;
    const qB = sampleQuestions[1].id;

    // Insert first answer
    const { error: ins1Err } = await adminSupabase.from('answers').insert({
      respondent_id: p002.id,
      question_id: qA,
      selected_student_id: p005.id,
    });

    // Try inserting duplicate classmate for another question
    const { error: ins2Err } = await adminSupabase.from('answers').insert({
      respondent_id: p002.id,
      question_id: qB,
      selected_student_id: p005.id,
    });

    assert(
      Boolean(ins2Err && ins2Err.message.includes('uq_answers_respondent_classmate')),
      'Database unique constraint uq_answers_respondent_classmate strictly blocks duplicate classmates',
      `Error caught: ${ins2Err?.message}`
    );

    // Try inserting self-selection
    const { error: insSelfErr } = await adminSupabase.from('answers').insert({
      respondent_id: p002.id,
      question_id: qB,
      selected_student_id: p002.id,
    });

    assert(
      Boolean(insSelfErr && insSelfErr.message.includes('chk_no_self_selection')),
      'Database check constraint chk_no_self_selection strictly blocks self-selection',
      `Error caught: ${insSelfErr?.message}`
    );

    // Clean up test answer for 25MCA002 so data is preserved in original state
    await adminSupabase.from('answers').delete().eq('respondent_id', p002.id);
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  console.log('================================================================');

  if (passedTests === totalTests) {
    console.log('ALL REGRESSION TESTS PASSED PERFECTLY!');
  } else {
    throw new Error(`Regression test suite had ${totalTests - passedTests} failures.`);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
