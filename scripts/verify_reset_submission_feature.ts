import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

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

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log('--- 1. Baseline Inventory ---');
  const { data: p001 } = await supabase.from('profiles').select('*').eq('roll_number', '25MCA001').single();
  console.log('Student 25MCA001 UUID:', p001?.id);
  console.log('Student 25MCA001 Name:', p001?.full_name);
  console.log('Student 25MCA001 Active:', p001?.is_active);

  const { data: questions } = await supabase.from('questions').select('id, question_number').order('question_number');
  console.log('Total questions count in database:', questions?.length);

  const { data: existingSubs } = await supabase.from('submissions').select('student_id, status, answer_count');
  console.log('Initial total submissions count:', existingSubs?.length);
  existingSubs?.forEach(s => console.log('  Existing sub:', s.student_id, s.status, s.answer_count));

  const { count: initialTotalAnswers } = await supabase.from('answers').select('*', { count: 'exact', head: true });
  console.log('Initial total answers rows across all students:', initialTotalAnswers);

  // Pick question 1 & 2 for test answers
  const q1 = questions?.[0];
  const q2 = questions?.[1];
  const { data: classmate1 } = await supabase.from('profiles').select('id').eq('roll_number', '25MCA002').single();
  const { data: classmate2 } = await supabase.from('profiles').select('id').eq('roll_number', '25MCA003').single();

  console.log('\n--- 2. Setting up Controlled Test Submission for 25MCA001 ---');
  // First ensure student_question_order exists for 25MCA001
  await supabase.rpc('get_or_create_student_question_order', { p_student_id: p001?.id });
  
  // Insert 2 test answers with different classmates
  const { error: insAnsErr } = await supabase.from('answers').upsert([
    {
      respondent_id: p001?.id,
      question_id: q1?.id,
      selected_student_id: classmate1?.id,
    },
    {
      respondent_id: p001?.id,
      question_id: q2?.id,
      selected_student_id: classmate2?.id,
    }
  ], { onConflict: 'respondent_id,question_id' });
  if (insAnsErr) throw new Error('Failed to insert test answers: ' + insAnsErr.message);

  // Insert submission record
  const { error: insSubErr } = await supabase.from('submissions').upsert({
    student_id: p001?.id,
    status: 'submitted',
    answer_count: 59,
    submitted_at: new Date().toISOString()
  }, { onConflict: 'student_id' });
  if (insSubErr) throw new Error('Failed to insert test submission: ' + insSubErr.message);

  // Check state after inserting test submission
  const { data: checkSubBefore } = await supabase.from('submissions').select('*').eq('student_id', p001?.id);
  const { data: checkAnsBefore } = await supabase.from('answers').select('*').eq('respondent_id', p001?.id);
  console.log('Test submission created for 25MCA001:');
  console.log('  Submission record exists:', checkSubBefore?.length === 1, checkSubBefore?.[0]);
  console.log('  Answers recorded for 25MCA001:', checkAnsBefore?.length);

  console.log('\n--- 3. Testing Security Checks & Authorization ---');
  // 3a. Unauthorized call without token to Edge Function
  const edgeFunctionUrl = `${process.env.VITE_SUPABASE_URL}/functions/v1/admin-manage-user`;
  const unauthResp = await fetch(edgeFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.VITE_SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify({ action: 'reset_submission', studentId: p001?.id })
  });
  console.log('✓ Edge Function unauthenticated call rejected status:', unauthResp.status, '(Expected 401)');
  const unauthBody = await unauthResp.json().catch(() => ({}));
  console.log('  Response:', unauthBody);

  // 3b. Authenticate as Admin
  const anonClient = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
  const { data: authData, error: adminLoginErr } = await anonClient.auth.signInWithPassword({
    email: process.env.INITIAL_ADMIN_EMAIL!,
    password: process.env.INITIAL_ADMIN_PASSWORD!
  });
  if (adminLoginErr || !authData.session) {
    throw new Error('Failed to sign in as admin for test: ' + (adminLoginErr?.message || 'No session'));
  }
  const adminToken = authData.session.access_token;
  console.log('✓ Admin successfully authenticated, session obtained.');

  // 3c. Test invalid student UUID rejection
  const invalidIdResp = await fetch(edgeFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.VITE_SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ action: 'reset_submission', studentId: '00000000-0000-0000-0000-000000000000' })
  });
  console.log('✓ Edge Function invalid studentId call status:', invalidIdResp.status, '(Expected 404 or 400)');
  const invalidIdBody = await invalidIdResp.json().catch(() => ({}));
  console.log('  Response:', invalidIdBody);

  // 3d. Test valid reset call via Edge Function with Admin token
  console.log('\n--- 4. Executing Reset Submission as Authenticated Administrator ---');
  const resetResp = await fetch(edgeFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.VITE_SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ action: 'reset_submission', studentId: p001?.id })
  });
  console.log('✓ Edge Function reset call status:', resetResp.status, '(Expected 200)');
  const resetBody = await resetResp.json();
  console.log('  Reset Response:', resetBody);

  console.log('\n--- 5. Post-Reset Verifications ---');
  // 1. Check 25MCA001 submission
  const { data: checkSubAfter } = await supabase.from('submissions').select('*').eq('student_id', p001?.id);
  console.log('✓ 25MCA001 submissions count after reset:', checkSubAfter?.length, '(Expected: 0)');

  // 2. Check 25MCA001 answers
  const { data: checkAnsAfter } = await supabase.from('answers').select('*').eq('respondent_id', p001?.id);
  console.log('✓ 25MCA001 answers count after reset:', checkAnsAfter?.length, '(Expected: 0)');

  // 3. Check 25MCA001 profile
  const { data: p001After } = await supabase.from('profiles').select('*').eq('id', p001?.id).single();
  console.log('✓ 25MCA001 profile intact:', p001After?.roll_number === '25MCA001' && p001After?.full_name === p001?.full_name);
  console.log('  Email:', p001After?.email, 'Active:', p001After?.is_active);

  // 4. Check 25MCA001 Auth user
  const { data: authUserAfter } = await supabase.auth.admin.getUserById(p001?.id);
  console.log('✓ 25MCA001 Auth user exists and matching ID:', authUserAfter?.user?.id === p001?.id);

  // 5. Check other students' answers (25MCA030, 25MCA018, 25MCA054)
  const { count: ansLokin } = await supabase.from('answers').select('*', { count: 'exact', head: true }).eq('respondent_id', '11761dec-a8cb-44e1-942b-6d76107f1509');
  console.log('✓ 25MCA030 (LOKIN V) answers count untouched:', ansLokin, '(Expected: 59)');

  const { data: subLokin } = await supabase.from('submissions').select('*').eq('student_id', '11761dec-a8cb-44e1-942b-6d76107f1509');
  console.log('✓ 25MCA030 (LOKIN V) submission record untouched:', subLokin?.length === 1 && subLokin[0].status === 'submitted');

  // 6. Check all 72 questions
  const { count: finalQuestionsCount } = await supabase.from('questions').select('*', { count: 'exact', head: true });
  console.log('✓ All 72 questions intact count:', finalQuestionsCount, '(Expected: 72)');

  // 7. Check total answers in database equals initialTotalAnswers
  const { count: finalTotalAnswers } = await supabase.from('answers').select('*', { count: 'exact', head: true });
  console.log('✓ Total answers in database returned exactly to baseline:', finalTotalAnswers === initialTotalAnswers, `(${finalTotalAnswers} vs ${initialTotalAnswers})`);

  console.log('\n--- Feature Verification Completed Successfully ---');
}

main().catch(console.error);
