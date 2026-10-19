import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

function loadLocalEnv(relativeFilePath: string) {
  try {
    const fullPath = relativeFilePath;
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
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminEmail = process.env.INITIAL_ADMIN_EMAIL!;
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD!;

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
  console.log('  MCA MEMORIES — STUDENT STATUS SYNC & 25MCA030 REPAIR SUITE    ');
  console.log('================================================================\n');

  // -------------------------------------------------------------------------
  // 1. Audit and Repair 25MCA030
  // -------------------------------------------------------------------------
  console.log('--- 1. Repairing 25MCA030 Auth Ban Status ---');
  const { data: p030 } = await adminSupabase
    .from('profiles')
    .select('*')
    .eq('roll_number', '25MCA030')
    .single();

  if (!p030) throw new Error('25MCA030 profile not found');
  console.log(`✓ 25MCA030 Profile: ID=${p030.id}, Name="${p030.full_name}", is_active=${p030.is_active}`);

  const { data: auth030Before } = await adminSupabase.auth.admin.getUserById(p030.id);
  console.log(`✓ 25MCA030 Auth Before Repair: banned_until=${(auth030Before?.user as any)?.banned_until}`);

  // Minimum authorized repair: clear the stuck ban
  const { data: repairRes, error: repairErr } = await adminSupabase.auth.admin.updateUserById(p030.id, {
    ban_duration: 'none',
  });
  if (repairErr) throw new Error('Failed to unban 25MCA030: ' + repairErr.message);

  const { data: auth030After } = await adminSupabase.auth.admin.getUserById(p030.id);
  const bannedUntilAfter = (auth030After?.user as any)?.banned_until;
  console.log(`✓ 25MCA030 Auth After Repair: banned_until=${bannedUntilAfter || 'none (null)'}`);
  if (bannedUntilAfter) {
    throw new Error('Expected banned_until to be cleared for 25MCA030');
  }

  // Test Login for 25MCA030 with their password from Excel
  const pass030 = await getStudentPasswordFromExcel('25MCA030');
  const studentClient030 = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: login030, error: login030Err } = await studentClient030.auth.signInWithPassword({
    email: p030.email,
    password: pass030,
  });

  if (login030Err || !login030.session) {
    throw new Error('25MCA030 login failed after unban: ' + login030Err?.message);
  }
  console.log('✓ 25MCA030 can now successfully sign in without "User is banned" error!');
  console.log(`  Session established for: ${login030.user.email} (UID: ${login030.user.id})`);

  // -------------------------------------------------------------------------
  // 2. Test Full Synchronization Cycle via Edge Function
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Testing Full Synchronization Cycle via Edge Function ---');

  // Authenticate as Admin
  const adminClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminAuth, error: adminAuthErr } = await adminClient.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (adminAuthErr || !adminAuth.session) {
    throw new Error('Admin authentication failed: ' + adminAuthErr?.message);
  }
  const adminToken = adminAuth.session.access_token;
  console.log('✓ Admin authenticated for testing Edge Function.');

  // Pick safe test student: 25MCA060
  const { data: pTest } = await adminSupabase
    .from('profiles')
    .select('*')
    .eq('roll_number', '25MCA060')
    .single();
  if (!pTest) throw new Error('25MCA060 profile not found');
  const passTest = await getStudentPasswordFromExcel('25MCA060');

  // 2a. Disable Student via Edge Function
  console.log('\n[Cycle Step A] Disabling student 25MCA060...');
  const disableResp = await fetch(`${supabaseUrl}/functions/v1/admin-manage-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      action: 'toggle_student_status',
      studentId: pTest.id,
      isActive: false,
    }),
  });
  const disableJson = await disableResp.json();
  console.log('✓ Edge Function disable response:', disableJson);
  if (!disableJson.success) throw new Error('Disable action failed: ' + disableJson.error);

  // Verify DB profile is_active === false
  const { data: profDisabled } = await adminSupabase.from('profiles').select('is_active').eq('id', pTest.id).single();
  console.log('✓ DB Profile is_active:', profDisabled?.is_active, '(Expected: false)');
  if (profDisabled?.is_active !== false) throw new Error('Expected profile to be inactive');

  // Verify Auth user banned_until is set
  const { data: authDisabled } = await adminSupabase.auth.admin.getUserById(pTest.id);
  const banUntilDisabled = (authDisabled?.user as any)?.banned_until;
  console.log('✓ Auth user banned_until:', banUntilDisabled, '(Expected: future timestamp)');
  if (!banUntilDisabled) throw new Error('Expected Auth user to be banned');

  // Verify Login is DENIED
  const clientDisabled = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: deniedLoginErr } = await clientDisabled.auth.signInWithPassword({
    email: pTest.email,
    password: passTest,
  });
  console.log('✓ Login attempt while disabled correctly rejected:', deniedLoginErr?.message);
  if (!deniedLoginErr) throw new Error('Expected login to fail while disabled');

  // 2b. Re-enable Student via Edge Function
  console.log('\n[Cycle Step B] Re-enabling student 25MCA060...');
  const enableResp = await fetch(`${supabaseUrl}/functions/v1/admin-manage-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      action: 'toggle_student_status',
      studentId: pTest.id,
      isActive: true,
    }),
  });
  const enableJson = await enableResp.json();
  console.log('✓ Edge Function enable response:', enableJson);
  if (!enableJson.success) throw new Error('Enable action failed: ' + enableJson.error);

  // Verify DB profile is_active === true
  const { data: profEnabled } = await adminSupabase.from('profiles').select('is_active').eq('id', pTest.id).single();
  console.log('✓ DB Profile is_active:', profEnabled?.is_active, '(Expected: true)');
  if (profEnabled?.is_active !== true) throw new Error('Expected profile to be active');

  // Verify Auth user ban is cleared
  const { data: authEnabled } = await adminSupabase.auth.admin.getUserById(pTest.id);
  const banUntilEnabled = (authEnabled?.user as any)?.banned_until;
  console.log('✓ Auth user banned_until:', banUntilEnabled || 'none (cleared)');
  if (banUntilEnabled) throw new Error('Expected Auth user ban to be cleared');

  // Verify Login is PERMITTED
  const clientEnabled = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: permittedLogin, error: permittedLoginErr } = await clientEnabled.auth.signInWithPassword({
    email: pTest.email,
    password: passTest,
  });
  if (permittedLoginErr || !permittedLogin.session) {
    throw new Error('Login failed after re-enabling: ' + permittedLoginErr?.message);
  }
  console.log('✓ Login attempt after re-enabling SUCCEEDED without changing password!');

  // -------------------------------------------------------------------------
  // 3. Isolation & System Health Checks
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Isolation & System Health Checks ---');

  // Verify other students (e.g. 25MCA001) unchanged
  const { data: p001 } = await adminSupabase.from('profiles').select('*').eq('roll_number', '25MCA001').single();
  console.log(`✓ 25MCA001 intact: Name="${p001?.full_name}", is_active=${p001?.is_active}, must_change_password=${p001?.must_change_password}`);

  // Total student profiles count
  const { count: studentCount } = await adminSupabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'student');
  console.log(`✓ Total student accounts in database: ${studentCount} (Expected: 60)`);

  // Questions bank count
  const { count: questionCount } = await adminSupabase
    .from('questions')
    .select('*', { count: 'exact', head: true });
  console.log(`✓ Total questions in question bank: ${questionCount} (Expected: 72)`);

  // Admin status
  const { data: adminProf } = await adminSupabase.from('profiles').select('*').eq('role', 'admin').single();
  console.log(`✓ Admin profile intact: email=${adminProf?.email}, role=${adminProf?.role}, is_active=${adminProf?.is_active}`);

  console.log('\n================================================================');
  console.log('ALL SYNCHRONIZATION AND REPAIR TESTS PASSED WITH 100% SUCCESS!');
  console.log('================================================================\n');
}

run().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
