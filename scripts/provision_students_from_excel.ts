import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';

// Zero-dependency local .env loader
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
loadLocalEnv('.env');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n❌ Missing Supabase URL or Service Role Key in .env.local');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface StudentExcelRecord {
  rowNumber: number;
  rollNumber: string;
  fullName: string;
  email: string;
  initialPassword: string;
  hasPassword: boolean;
  passwordLength: number;
}

export interface PlanItem {
  record: StudentExcelRecord;
  status: 'CREATE' | 'REUSE' | 'REPAIR_PROFILE' | 'CONFLICT';
  authUserId?: string;
  profileId?: string;
  details: string;
}

async function parseExcelFile(filePath: string): Promise<StudentExcelRecord[]> {
  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(fullPath);
  const worksheet = workbook.worksheets[0];

  let headerRowNumber = -1;
  let rollCol = -1;
  let nameCol = -1;
  let emailCol = -1;
  let passCol = -1;

  worksheet.eachRow((row, rNum) => {
    if (headerRowNumber !== -1) return;
    row.eachCell((cell, cNum) => {
      const val = String(cell.value || '').trim().toLowerCase();
      if (val === 'roll number') {
        headerRowNumber = rNum;
      }
    });
  });

  if (headerRowNumber === -1) {
    throw new Error('Could not find header row with "Roll Number" in Excel workbook.');
  }

  const hRow = worksheet.getRow(headerRowNumber);
  hRow.eachCell((cell, cNum) => {
    const val = String(cell.value || '').trim().toLowerCase();
    if (val.includes('roll number')) rollCol = cNum;
    else if (val.includes('full name') || val.includes('name')) nameCol = cNum;
    else if (val.includes('email')) emailCol = cNum;
    else if (val.includes('password')) passCol = cNum;
  });

  if (rollCol === -1 || nameCol === -1 || emailCol === -1 || passCol === -1) {
    throw new Error(`Failed to locate all required columns. Detected: roll=${rollCol}, name=${nameCol}, email=${emailCol}, pass=${passCol}`);
  }

  const records: StudentExcelRecord[] = [];
  const rollSet = new Set<string>();
  const emailSet = new Set<string>();

  worksheet.eachRow((row, rNum) => {
    if (rNum <= headerRowNumber) return;

    const rollRaw = row.getCell(rollCol).value;
    const nameRaw = row.getCell(nameCol).value;
    const emailRaw = row.getCell(emailCol).value;
    const passRaw = row.getCell(passCol).value;

    const rollNumber = String(rollRaw?.toString() || '').trim().toUpperCase();
    const fullName = String(nameRaw?.toString() || '').trim().replace(/\s+/g, ' ');

    let email = '';
    if (typeof emailRaw === 'object' && emailRaw !== null) {
      if ('text' in emailRaw) {
        email = String((emailRaw as any).text || '').trim().toLowerCase();
      } else if ('hyperlink' in emailRaw) {
        email = String((emailRaw as any).hyperlink || '').replace(/^mailto:/i, '').trim().toLowerCase();
      } else {
        email = String(emailRaw.toString() || '').trim().toLowerCase();
      }
    } else {
      email = String(emailRaw || '').trim().toLowerCase();
    }

    const password = String(passRaw?.toString() || '').trim();

    if (!rollNumber && !fullName && !email && !password) return; // Empty row

    if (!rollNumber) throw new Error(`Row ${rNum}: Missing roll number`);
    if (!fullName) throw new Error(`Row ${rNum}: Missing full name`);
    if (!email) throw new Error(`Row ${rNum}: Missing email address`);
    if (!password) throw new Error(`Row ${rNum}: Missing initial password`);
    if (password.length < 6) throw new Error(`Row ${rNum} (${rollNumber}): Password length is less than 6 characters`);

    if (rollSet.has(rollNumber)) throw new Error(`Duplicate roll number in Excel: ${rollNumber}`);
    if (emailSet.has(email)) throw new Error(`Duplicate email in Excel: ${email}`);

    rollSet.add(rollNumber);
    emailSet.add(email);

    records.push({
      rowNumber: rNum,
      rollNumber,
      fullName,
      email,
      initialPassword: password,
      hasPassword: true,
      passwordLength: password.length,
    });
  });

  return records;
}

async function run() {
  const isExecute = process.argv.includes('--execute');
  const isDryRun = !isExecute;

  console.log('========================================================================');
  console.log(`MCA Memories: Student Provisioning from Excel [${isDryRun ? 'DRY-RUN MODE' : 'EXECUTE MODE'}]`);
  console.log('========================================================================\n');

  // 1. Read Excel
  console.log('[Step 1] Reading and validating student login.xlsx...');
  const excelRecords = await parseExcelFile('student login.xlsx');
  console.log(`✓ Successfully extracted ${excelRecords.length} validated student records from Excel.`);
  console.log(`  First record: ${excelRecords[0].rollNumber} - ${excelRecords[0].fullName} (${excelRecords[0].email})`);
  console.log(`  Last record:  ${excelRecords[excelRecords.length - 1].rollNumber} - ${excelRecords[excelRecords.length - 1].fullName} (${excelRecords[excelRecords.length - 1].email})\n`);

  // 2. Query live Supabase Auth and Profiles
  console.log('[Step 2] Fetching live Supabase Auth users and Profiles...');
  const allAuthUsers: any[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { data: pageData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (listErr || !pageData || pageData.users.length === 0) {
      hasMore = false;
    } else {
      allAuthUsers.push(...pageData.users);
      if (pageData.users.length < 1000) hasMore = false;
      else page++;
    }
  }

  const { data: allProfiles, error: profErr } = await supabaseAdmin
    .from('profiles')
    .select('*');

  if (profErr || !allProfiles) {
    throw new Error(`Failed to fetch profiles: ${profErr?.message}`);
  }

  console.log(`✓ Live Supabase state: ${allAuthUsers.length} Auth users, ${allProfiles.length} Profiles.`);

  const authByEmail = new Map<string, any>(
    allAuthUsers.map((u) => [String(u.email || '').trim().toLowerCase(), u])
  );
  const profileByRoll = new Map<string, any>(
    allProfiles.map((p) => [String(p.roll_number || '').trim().toUpperCase(), p])
  );
  const profileByEmail = new Map<string, any>(
    allProfiles.map((p) => [String(p.email || '').trim().toLowerCase(), p])
  );
  const profileById = new Map<string, any>(
    allProfiles.map((p) => [p.id, p])
  );

  // 3. Plan actions
  console.log('\n[Step 3] Analyzing records and building provisioning plan...');
  const plan: PlanItem[] = [];

  for (const record of excelRecords) {
    const cleanEmail = record.email.toLowerCase();
    const cleanRoll = record.rollNumber.toUpperCase();

    const existingAuth = authByEmail.get(cleanEmail);
    const existingProfileByRoll = profileByRoll.get(cleanRoll);
    const existingProfileByEmail = profileByEmail.get(cleanEmail);

    // Case 1: Both Auth user and matching profile exist
    if (existingAuth) {
      const matchedProfile = profileById.get(existingAuth.id);
      if (matchedProfile) {
        if (matchedProfile.roll_number.toUpperCase() === cleanRoll) {
          plan.push({
            record,
            status: 'REUSE',
            authUserId: existingAuth.id,
            profileId: matchedProfile.id,
            details: `Account and profile already exist and match (Auth ID: ${existingAuth.id}). Password preserved.`,
          });
          continue;
        } else {
          plan.push({
            record,
            status: 'CONFLICT',
            authUserId: existingAuth.id,
            profileId: matchedProfile.id,
            details: `Conflict: Auth email '${cleanEmail}' belongs to profile with roll number '${matchedProfile.roll_number}', expected '${cleanRoll}'.`,
          });
          continue;
        }
      } else {
        // Auth user exists, but profile with this Auth ID does not exist
        if (!existingProfileByRoll) {
          plan.push({
            record,
            status: 'REPAIR_PROFILE',
            authUserId: existingAuth.id,
            details: `Auth user exists (ID: ${existingAuth.id}) but profile is missing. Will repair by linking profile.`,
          });
          continue;
        } else {
          plan.push({
            record,
            status: 'CONFLICT',
            authUserId: existingAuth.id,
            profileId: existingProfileByRoll.id,
            details: `Conflict: Auth user ID (${existingAuth.id}) does not match existing profile ID (${existingProfileByRoll.id}) for roll ${cleanRoll}.`,
          });
          continue;
        }
      }
    }

    // Case 2: Auth user does NOT exist, but profile exists
    if (existingProfileByRoll || existingProfileByEmail) {
      const conf = existingProfileByRoll || existingProfileByEmail;
      plan.push({
        record,
        status: 'CONFLICT',
        profileId: conf.id,
        details: `Conflict: Profile exists for ${conf.roll_number} / ${conf.email} (ID: ${conf.id}) but no matching Auth user found.`,
      });
      continue;
    }

    // Case 3: Fresh account to create
    plan.push({
      record,
      status: 'CREATE',
      details: `New account to create: Auth user + profile (${cleanRoll} - ${record.fullName}).`,
    });
  }

  // Summary counts
  const toCreate = plan.filter((p) => p.status === 'CREATE');
  const toReuse = plan.filter((p) => p.status === 'REUSE');
  const toRepair = plan.filter((p) => p.status === 'REPAIR_PROFILE');
  const conflicts = plan.filter((p) => p.status === 'CONFLICT');

  console.log('\n========================================================================');
  console.log('PROVISIONING PLAN SUMMARY');
  console.log('========================================================================');
  console.log(`Total Excel records found:         ${excelRecords.length}`);
  console.log(`New accounts to create:             ${toCreate.length}`);
  console.log(`Already-existing accounts to reuse: ${toReuse.length}`);
  console.log(`Profile links to repair:            ${toRepair.length}`);
  console.log(`Conflicts requiring manual review:  ${conflicts.length}`);
  console.log('========================================================================\n');

  if (conflicts.length > 0) {
    console.error('⚠️ CONFLICTS DETECTED:');
    conflicts.forEach((c) => {
      console.error(`  - ${c.record.rollNumber} (${c.record.email}): ${c.details}`);
    });
    console.error('\nPlease resolve conflicts before executing account creation.');
  }

  if (isDryRun) {
    console.log('--- DRY-RUN REPORT: PLANNED ACTIONS PER RECORD ---');
    plan.forEach((item, idx) => {
      console.log(
        `[${String(idx + 1).padStart(2, '0')}/${excelRecords.length}] ${item.record.rollNumber} | ${item.record.fullName.padEnd(25, ' ')} | ${item.record.email.padEnd(28, ' ')} | Status: ${item.status}`
      );
    });

    console.log('\nDry-run complete. NO database or Auth changes were made.');
    console.log('To execute account creation after approval, run:');
    console.log('  npx tsx scripts/provision_students_from_excel.ts --execute\n');
    return;
  }

  // EXECUTE MODE
  if (conflicts.length > 0) {
    console.error('❌ Execution aborted due to detected conflicts.');
    process.exit(1);
  }

  console.log('\n========================================================================');
  console.log('EXECUTING ACCOUNT PROVISIONING');
  console.log('========================================================================\n');

  let createdCount = 0;
  let repairedCount = 0;
  const executionErrors: { roll: string; error: string }[] = [];

  // 1. Process Repairs
  for (const item of toRepair) {
    console.log(`[Repair] Linking profile for ${item.record.rollNumber} (Auth ID: ${item.authUserId})...`);
    const { error: insertErr } = await supabaseAdmin.from('profiles').insert({
      id: item.authUserId,
      roll_number: item.record.rollNumber,
      full_name: item.record.fullName,
      email: item.record.email,
      role: 'student',
      is_active: true,
    });

    if (insertErr) {
      console.error(`  ❌ Failed to repair profile for ${item.record.rollNumber}: ${insertErr.message}`);
      executionErrors.push({ roll: item.record.rollNumber, error: insertErr.message });
    } else {
      repairedCount++;
      console.log(`  ✓ Profile linked successfully.`);
    }
  }

  // 2. Process New Account Creations
  for (const item of toCreate) {
    const rec = item.record;
    process.stdout.write(`[Create ${createdCount + 1}/${toCreate.length}] ${rec.rollNumber} (${rec.email})... `);

    // Create user in Supabase Auth
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: rec.email,
      password: rec.initialPassword,
      email_confirm: true,
      user_metadata: {
        role: 'student',
        roll_number: rec.rollNumber,
        full_name: rec.fullName,
        email: rec.email,
      },
    });

    if (authErr || !authData?.user) {
      console.log(`FAILED (Auth: ${authErr?.message})`);
      executionErrors.push({ roll: rec.rollNumber, error: `Auth creation failed: ${authErr?.message}` });
      continue;
    }

    const newUserId = authData.user.id;

    // Create profile in public.profiles
    const { error: profileErr } = await supabaseAdmin.from('profiles').insert({
      id: newUserId,
      roll_number: rec.rollNumber,
      full_name: rec.fullName,
      email: rec.email,
      role: 'student',
      is_active: true,
    });

    if (profileErr) {
      console.log(`FAILED (Profile: ${profileErr.message}) -> Rolling back Auth user.`);
      // Rollback created Auth user to maintain strict 1-to-1 parity
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      executionErrors.push({ roll: rec.rollNumber, error: `Profile insert failed: ${profileErr.message}` });
      continue;
    }

    createdCount++;
    console.log(`SUCCESS (ID: ${newUserId})`);
  }

  console.log('\n========================================================================');
  console.log('EXECUTION SUMMARY');
  console.log('========================================================================');
  console.log(`Total Excel records processed:     ${excelRecords.length}`);
  console.log(`New accounts created:              ${createdCount} / ${toCreate.length}`);
  console.log(`Existing accounts reused:          ${toReuse.length}`);
  console.log(`Profile links repaired:            ${repairedCount} / ${toRepair.length}`);
  console.log(`Execution errors:                  ${executionErrors.length}`);
  console.log('========================================================================\n');

  if (executionErrors.length > 0) {
    console.error('Execution errors detail:', JSON.stringify(executionErrors, null, 2));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal script error:', err);
  process.exit(1);
});
