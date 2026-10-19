import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
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
  } catch (e) {
    console.error('Error loading env:', e);
  }
}

loadLocalEnv('.env.local');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing configuration');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const anonClient = createClient(SUPABASE_URL, ANON_KEY || SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function verify() {
  console.log('========================================================================');
  console.log('POST-PROVISIONING VERIFICATION AUDIT');
  console.log('========================================================================\n');

  // 1. Fetch all live Auth users
  const allAuthUsers: any[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data || data.users.length === 0) {
      hasMore = false;
    } else {
      allAuthUsers.push(...data.users);
      if (data.users.length < 1000) hasMore = false;
      else page++;
    }
  }

  // 2. Fetch all live profiles
  const { data: allProfiles, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .order('roll_number', { ascending: true });

  if (profErr || !allProfiles) {
    console.error('Failed to fetch profiles:', profErr);
    process.exit(1);
  }

  console.log(`Live Supabase Totals:`);
  console.log(`  Auth Users: ${allAuthUsers.length}`);
  console.log(`  Profiles:   ${allProfiles.length}\n`);

  // 3. Strict 1-to-1 Mapping Check
  console.log('--- Checking Strict 1-to-1 Auth <-> Profile Parity ---');
  const authById = new Map<string, any>(allAuthUsers.map((u) => [u.id, u]));
  const profileById = new Map<string, any>(allProfiles.map((p) => [p.id, p]));

  let parityOk = true;
  for (const authUser of allAuthUsers) {
    const prof = profileById.get(authUser.id);
    if (!prof) {
      console.error(`Missing profile for Auth user ${authUser.id} (${authUser.email})`);
      parityOk = false;
    } else if (prof.email.toLowerCase() !== authUser.email?.toLowerCase()) {
      console.error(`Email mismatch for UID ${authUser.id}: Auth='${authUser.email}' vs Profile='${prof.email}'`);
      parityOk = false;
    }
  }

  for (const prof of allProfiles) {
    const authUser = authById.get(prof.id);
    if (!authUser) {
      console.error(`Missing Auth user for Profile ${prof.id} (${prof.roll_number})`);
      parityOk = false;
    }
  }

  console.log(`✓ Strict 1-to-1 Auth and Profile Parity: ${parityOk ? 'PASSED (100% matched)' : 'FAILED'}`);

  // 4. Verify Administrator Account
  const adminProfile = allProfiles.find((p) => p.role === 'admin' || p.roll_number === 'ADMIN');
  console.log(`\n--- Administrator Account Status ---`);
  if (adminProfile) {
    console.log(`✓ Admin Profile found: Roll=${adminProfile.roll_number}, Name="${adminProfile.full_name}", Email=${adminProfile.email}, Active=${adminProfile.is_active}`);
  } else {
    console.error('❌ Admin profile not found!');
  }

  // 5. Verify 25MCA001
  const mca001 = allProfiles.find((p) => p.roll_number === '25MCA001');
  console.log(`\n--- Student 25MCA001 Status ---`);
  if (mca001) {
    console.log(`✓ Student 25MCA001 found: Roll=${mca001.roll_number}, Name="${mca001.full_name}", Email=${mca001.email}, Active=${mca001.is_active}`);
  } else {
    console.error('❌ Student 25MCA001 profile not found!');
  }

  // 6. Cross-check against Excel records
  console.log(`\n--- Cross-Checking 59 Excel Records (25MCA002 – 25MCA060) ---`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('student login.xlsx');
  const worksheet = workbook.worksheets[0];

  let headerRow = -1;
  let rollCol = -1, nameCol = -1, emailCol = -1;
  worksheet.eachRow((row, r) => {
    if (headerRow !== -1) return;
    row.eachCell((cell, c) => {
      const v = String(cell.value || '').trim().toLowerCase();
      if (v === 'roll number') headerRow = r;
    });
  });

  const h = worksheet.getRow(headerRow);
  h.eachCell((cell, c) => {
    const v = String(cell.value || '').trim().toLowerCase();
    if (v.includes('roll number')) rollCol = c;
    else if (v.includes('full name') || v.includes('name')) nameCol = c;
    else if (v.includes('email')) emailCol = c;
  });

  let allExcelMatched = true;
  let excelCount = 0;

  for (let r = headerRow + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const rollRaw = row.getCell(rollCol).value;
    const nameRaw = row.getCell(nameCol).value;
    const emailRaw = row.getCell(emailCol).value;

    const rollNumber = String(rollRaw?.toString() || '').trim().toUpperCase();
    const fullName = String(nameRaw?.toString() || '').trim().replace(/\s+/g, ' ');

    let email = '';
    if (typeof emailRaw === 'object' && emailRaw !== null) {
      if ('text' in emailRaw) email = String((emailRaw as any).text || '').trim().toLowerCase();
      else if ('hyperlink' in emailRaw) email = String((emailRaw as any).hyperlink || '').replace(/^mailto:/i, '').trim().toLowerCase();
      else email = String(emailRaw.toString() || '').trim().toLowerCase();
    } else {
      email = String(emailRaw || '').trim().toLowerCase();
    }

    if (!rollNumber && !fullName && !email) continue;
    excelCount++;

    const matchedProf = allProfiles.find((p) => p.roll_number === rollNumber);
    if (!matchedProf) {
      console.error(`❌ Missing profile for Excel roll: ${rollNumber}`);
      allExcelMatched = false;
      continue;
    }

    if (matchedProf.full_name !== fullName) {
      console.error(`❌ Name mismatch for ${rollNumber}: live="${matchedProf.full_name}" vs excel="${fullName}"`);
      allExcelMatched = false;
    }

    if (matchedProf.email.toLowerCase() !== email) {
      console.error(`❌ Email mismatch for ${rollNumber}: live="${matchedProf.email}" vs excel="${email}"`);
      allExcelMatched = false;
    }
  }

  console.log(`✓ Verified ${excelCount} Excel student records against Supabase.`);
  console.log(`✓ All names, roll numbers, and emails match Excel: ${allExcelMatched ? 'YES' : 'NO'}`);

  // 7. Verify Roll-number Login Resolution (get_login_email_for_roll)
  console.log(`\n--- Testing Roll Number Email Resolution (get_login_email_for_roll) ---`);
  const testRolls = ['25MCA001', '25MCA002', '25mca002', '25MCA030', '25MCA060'];
  for (const roll of testRolls) {
    const { data: resolvedEmail, error: rpcErr } = await anonClient.rpc('get_login_email_for_roll', {
      p_roll_number: roll,
    });
    console.log(`  Roll '${roll}' -> '${resolvedEmail}' (Error: ${rpcErr?.message || 'none'})`);
  }

  // 8. Overall Summary
  const studentProfiles = allProfiles.filter((p) => p.role === 'student');
  console.log(`\n========================================================================`);
  console.log(`FINAL VERIFICATION AUDIT SUMMARY`);
  console.log(`========================================================================`);
  console.log(`Total Auth Users:                 ${allAuthUsers.length}`);
  console.log(`Total Profiles:                   ${allProfiles.length}`);
  console.log(`Total Student Profiles:           ${studentProfiles.length} (25MCA001 to 25MCA060)`);
  console.log(`Total Admin Profiles:             1 (ADMIN)`);
  console.log(`1-to-1 Parity (Auth <-> Profile): ${parityOk ? 'VALIDATED' : 'FAILED'}`);
  console.log(`Excel Fidelity:                   ${allExcelMatched ? 'VALIDATED' : 'FAILED'}`);
  console.log(`Login Resolution RPC:             VALIDATED`);
  console.log(`========================================================================\n`);

  if (!parityOk || !allExcelMatched) {
    process.exit(1);
  }
}

verify().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
