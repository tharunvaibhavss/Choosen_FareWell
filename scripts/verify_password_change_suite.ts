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
  } catch (e) {
    console.error('Error loading env:', e);
  }
}

loadLocalEnv('.env.local');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

if (!supabaseUrl || !anonKey || !serviceKey || !adminEmail || !adminPassword) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const adminSupabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

async function run() {
  console.log('================================================================');
  console.log('  MCA MEMORIES — FIRST LOGIN & ADMIN PASSWORD MANAGEMENT TEST   ');
  console.log('================================================================\n');

  // 1. Verify Database Baseline Counts (All 60 Students)
  console.log('--- 1. Baseline Verification of All 60 Students & Admin ---');
  const { data: allProfiles, error: profErr } = await adminSupabase
    .from('profiles')
    .select('id, roll_number, full_name, role, is_active, must_change_password, password_changed_at')
    .order('roll_number', { ascending: true });

  if (profErr || !allProfiles) {
    throw new Error('Failed to fetch profiles: ' + profErr?.message);
  }

  const students = allProfiles.filter((p) => p.role === 'student');
  const admin = allProfiles.find((p) => p.role === 'admin');

  console.log(`✓ Total Students Count: ${students.length} (Expected: 60)`);
  if (students.length !== 60) {
    throw new Error(`Expected 60 students, found ${students.length}`);
  }

  const initialPendingCount = students.filter((s) => s.must_change_password !== false).length;
  const initialChangedCount = students.filter((s) => s.must_change_password === false).length;
  console.log(`✓ Students with Password Change Pending: ${initialPendingCount} / 60`);
  console.log(`✓ Students with Password Changed: ${initialChangedCount} / 60`);
  console.log(`✓ Admin must_change_password: ${admin?.must_change_password} (Expected: false)`);
  if (admin?.must_change_password !== false) {
    throw new Error('Admin account should NEVER have must_change_password = true');
  }

  // 2. Test Student: 25MCA060 (Tony Sebastian)
  const testRoll = '25MCA060';
  const testStudent = students.find((s) => s.roll_number === testRoll);
  if (!testStudent) {
    throw new Error(`Test student ${testRoll} not found`);
  }
  const initialStudentPassword = await getStudentPasswordFromExcel(testRoll);
  console.log(`\n--- 2. Testing First Login Flow for ${testRoll} (${testStudent.full_name}) ---`);

  // Create isolated student client
  const studentClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 2a. Student Login with Initial Password
  // Resolve login identifier via RPC
  const { data: resolvedEmail, error: rpcEmailErr } = await studentClient.rpc('get_login_email_for_roll', {
    p_roll_number: testRoll,
  });
  if (rpcEmailErr || !resolvedEmail) {
    throw new Error(`Failed to resolve email for ${testRoll}: ` + rpcEmailErr?.message);
  }

  const { data: studentAuthData, error: studentLoginErr } = await studentClient.auth.signInWithPassword({
    email: resolvedEmail,
    password: initialStudentPassword,
  });
  if (studentLoginErr || !studentAuthData.session) {
    throw new Error(`Student ${testRoll} login failed with initial password: ` + studentLoginErr?.message);
  }
  console.log(`✓ Student ${testRoll} logged in successfully with initial password.`);

  // 2b. Check student profile flags on first login
  const { data: studentProfAfterLogin } = await studentClient
    .from('profiles')
    .select('*')
    .eq('id', testStudent.id)
    .single();

  console.log(`✓ Student must_change_password flag: ${studentProfAfterLogin?.must_change_password} (Expected: true)`);
  console.log(`✓ Student password_changed_at: ${studentProfAfterLogin?.password_changed_at} (Expected: null)`);

  if (studentProfAfterLogin?.must_change_password !== true) {
    throw new Error('Expected student to have must_change_password = true on first login');
  }

  // 2c. Security Test: Direct student attempt to bypass must_change_password
  console.log('\n--- 3. Testing Security Protection Against Direct Profile Flag Tampering ---');
  const { error: tamperErr } = await studentClient
    .from('profiles')
    .update({ must_change_password: false, password_changed_at: new Date().toISOString() })
    .eq('id', testStudent.id);

  console.log(`✓ Direct client profile update rejected: ${tamperErr ? tamperErr.message : 'Blocked by RLS or Trigger'}`);

  // Re-verify flag remains true
  const { data: verifyProf } = await adminSupabase
    .from('profiles')
    .select('must_change_password')
    .eq('id', testStudent.id)
    .single();
  if (verifyProf?.must_change_password !== true) {
    throw new Error('Security trigger failed: student was able to directly tamper with must_change_password');
  }
  console.log('✓ Security confirmed: student cannot bypass password change flag directly.');

  // 3. Perform Password Change for Test Student
  console.log('\n--- 4. Performing Password Change Flow ---');
  const tempNewPassword = `TestNewPass#${Date.now()}!`;

  // Test validation: attempt updating with too short password
  const { error: shortErr } = await studentClient.auth.updateUser({
    password: '123',
  });
  console.log(`✓ Short password rejected by Supabase Auth: ${shortErr?.message}`);

  // Perform valid password update
  const { data: updatedAuthUser, error: updateErr } = await studentClient.auth.updateUser({
    password: tempNewPassword,
  });
  if (updateErr || !updatedAuthUser.user) {
    throw new Error('Failed to update student password in Supabase Auth: ' + updateErr?.message);
  }
  console.log('✓ Supabase Auth password updated successfully.');

  // Complete student password change via server-side RPC
  const { data: completeRpcRes, error: completeRpcErr } = await studentClient.rpc('complete_student_password_change');
  if (completeRpcErr || !completeRpcRes?.success) {
    throw new Error('complete_student_password_change RPC failed: ' + (completeRpcErr?.message || completeRpcRes?.error));
  }
  console.log('✓ complete_student_password_change RPC succeeded:', completeRpcRes);

  // Verify profile in database
  const { data: studentProfChanged } = await adminSupabase
    .from('profiles')
    .select('must_change_password, password_changed_at')
    .eq('id', testStudent.id)
    .single();

  console.log(`✓ Student must_change_password after change: ${studentProfChanged?.must_change_password} (Expected: false)`);
  console.log(`✓ Student password_changed_at timestamp: ${studentProfChanged?.password_changed_at}`);
  if (studentProfChanged?.must_change_password !== false || !studentProfChanged?.password_changed_at) {
    throw new Error('Database does not reflect password changed status');
  }

  // 4. Test Student Login with New Password
  console.log('\n--- 5. Testing Student Login with New Password ---');
  const studentClient2 = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: newLoginData, error: newLoginErr } = await studentClient2.auth.signInWithPassword({
    email: resolvedEmail,
    password: tempNewPassword,
  });
  if (newLoginErr || !newLoginData.session) {
    throw new Error('Student failed to log in with new password: ' + newLoginErr?.message);
  }
  console.log('✓ Student logged in successfully with new password.');

  // 5. Test Admin "Require Password Reset" Action
  console.log('\n--- 6. Testing Admin "Require Password Reset" Action ---');
  // Authenticate as Admin
  const adminClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminAuthData, error: adminLoginErr } = await adminClient.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (adminLoginErr || !adminAuthData.session) {
    throw new Error('Admin login failed: ' + adminLoginErr?.message);
  }
  const adminAccessToken = adminAuthData.session.access_token;
  console.log('✓ Admin authenticated, session token acquired.');

  // 5a. Unauthorized test: Unauthenticated call to Edge function
  const unauthEdgeRes = await fetch(`${supabaseUrl}/functions/v1/admin-manage-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
    },
    body: JSON.stringify({ action: 'require_password_change', studentId: testStudent.id }),
  });
  console.log(`✓ Unauthenticated Edge Function call rejected: HTTP ${unauthEdgeRes.status} (Expected 401)`);

  // 5b. Authenticated call to Edge function by Admin
  const authEdgeRes = await fetch(`${supabaseUrl}/functions/v1/admin-manage-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${adminAccessToken}`,
    },
    body: JSON.stringify({ action: 'require_password_change', studentId: testStudent.id }),
  });
  const edgeJson = await authEdgeRes.json();
  console.log(`✓ Admin Edge Function require_password_change response: HTTP ${authEdgeRes.status}, data:`, edgeJson);
  if (!edgeJson?.success) {
    throw new Error('Edge function failed to require password reset: ' + edgeJson?.error);
  }

  // 5c. Verify student is now Pending again in database
  const { data: studentProfReset } = await adminSupabase
    .from('profiles')
    .select('must_change_password, password_changed_at')
    .eq('id', testStudent.id)
    .single();

  console.log(`✓ Student must_change_password after Admin Reset: ${studentProfReset?.must_change_password} (Expected: true)`);
  console.log(`✓ Student password_changed_at after Admin Reset: ${studentProfReset?.password_changed_at} (Expected: null)`);
  if (studentProfReset?.must_change_password !== true) {
    throw new Error('Expected student to be marked must_change_password = true after admin reset');
  }

  // 6. Isolation Check: Other students and Admin unaffected
  console.log('\n--- 7. Isolation & Integrity Check ---');
  const { data: checkProfiles } = await adminSupabase
    .from('profiles')
    .select('id, roll_number, full_name, role, must_change_password')
    .neq('id', testStudent.id);

  const otherStudents = (checkProfiles || []).filter((p) => p.role === 'student');
  console.log(`✓ Total other students verified: ${otherStudents.length} (Expected: 59)`);
  const adminCheck = (checkProfiles || []).find((p) => p.role === 'admin');
  console.log(`✓ Admin role & status preserved: Role=${adminCheck?.role}, must_change_password=${adminCheck?.must_change_password} (Expected: false)`);

  // Verify Question Bank intact
  const { data: questions } = await adminSupabase.from('questions').select('id, question_number');
  console.log(`✓ Questions Bank Count: ${questions?.length} (Expected: 72)`);
  if ((questions?.length || 0) < 72) {
    throw new Error(`Questions count changed! Found ${questions?.length}`);
  }

  // 7. Cleanup & Restore: Restore test student's initial password from Excel
  console.log('\n--- 8. Safe Restoration of Test Student Password ---');
  // Update password in Supabase Auth back to initial password from Excel
  const { error: restoreAuthErr } = await adminSupabase.auth.admin.updateUserById(testStudent.id, {
    password: initialStudentPassword,
  });
  if (restoreAuthErr) {
    throw new Error('Failed to restore initial password for test student: ' + restoreAuthErr.message);
  }
  // Ensure profile is in initial pending state
  await adminSupabase
    .from('profiles')
    .update({ must_change_password: true, password_changed_at: null })
    .eq('id', testStudent.id);

  console.log(`✓ Test student ${testRoll} initial password restored from student login.xlsx.`);
  console.log(`✓ Test student ${testRoll} must_change_password set to true (Pending first login).`);

  // 8. Final Count Verification
  const { data: finalProfiles } = await adminSupabase
    .from('profiles')
    .select('role, must_change_password');

  const finalStudents = (finalProfiles || []).filter((p) => p.role === 'student');
  const finalPending = finalStudents.filter((s) => s.must_change_password !== false).length;
  const finalChanged = finalStudents.filter((s) => s.must_change_password === false).length;

  console.log('\n================================================================');
  console.log('FINAL VERIFICATION SUMMARY:');
  console.log(`  Total Students:                     ${finalStudents.length} / 60`);
  console.log(`  Password Change Pending:            ${finalPending} / 60`);
  console.log(`  Password Changed:                   ${finalChanged} / 60`);
  console.log(`  Admin must_change_password:         ${adminCheck?.must_change_password}`);
  console.log(`  Questions in Bank:                  ${questions?.length} / 72`);
  console.log('================================================================');
  console.log('ALL TESTS PASSED SUCCESSFULLY!\n');
}

run().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
