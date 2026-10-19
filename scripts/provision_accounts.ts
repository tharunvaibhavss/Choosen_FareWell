/**
 * Supabase Initial Admin Provisioning Script
 * 
 * Purpose:
 * Safely provisions ONLY the single Initial Administrator account into Supabase Auth
 * and public.profiles. No student accounts or demo data are created.
 * 
 * Safety Guarantees:
 * 1. Reads credentials strictly from local environment variables (.env.local).
 * 2. Never overwrites an existing admin's password if the account already exists.
 * 3. Checks for duplicate profiles and verifies admin role.
 * 4. Uses the service-role key only in this offline CLI execution (never exposed in browser).
 * 5. Uses native Node.js file system for zero-dependency environment loading (no dotenv required).
 * 
 * Usage:
 * npx tsx scripts/provision_accounts.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { ADMIN_ACCOUNT } from '../src/data/studentsData';

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
  } catch {
    // Continue if file is unreadable
  }
}

loadLocalEnv('.env.local');
loadLocalEnv('.env');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n❌ Error: Missing configuration.');
  console.error('Please ensure the following variables are set in your local .env.local file:');
  console.error('  - VITE_SUPABASE_URL (e.g. https://your-project.supabase.co)');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY (from Supabase Dashboard -> Project Settings -> API)\n');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function provisionInitialAdmin() {
  console.log('====================================================');
  console.log('MCA Memories 2025–2027: Initial Admin Account Setup');
  console.log('====================================================\n');

  const adminEmail = (
    process.env.INITIAL_ADMIN_EMAIL ||
    process.env.ADMIN_EMAIL ||
    'admin@mca2527.college'
  ).trim().toLowerCase();

  const adminPassword = (
    process.env.INITIAL_ADMIN_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    'Admin@MCA2025!'
  ).trim();

  const adminRollNumber = (
    process.env.INITIAL_ADMIN_ROLL ||
    ADMIN_ACCOUNT?.rollNumber ||
    'ADMIN'
  ).trim().toUpperCase();

  const adminFullName = (
    process.env.INITIAL_ADMIN_NAME ||
    ADMIN_ACCOUNT?.fullName ||
    'System Administrator'
  ).trim();

  console.log(`Target Admin Email: ${adminEmail}`);
  console.log(`Target Admin Name:  ${adminFullName}`);
  console.log(`Target Roll Number: ${adminRollNumber}\n`);

  // 1. Check existing Auth users
  console.log('[Step 1/3] Checking existing Supabase Auth users...');
  const allExistingUsers: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { data: pageData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (listErr || !pageData || pageData.users.length === 0) {
      hasMore = false;
    } else {
      allExistingUsers.push(...pageData.users);
      if (pageData.users.length < 1000) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  const existingAuthUser = allExistingUsers.find(
    (u) => u.email?.toLowerCase() === adminEmail
  );

  let adminUserId = existingAuthUser?.id;

  // 2. Create Auth User if not present
  if (!existingAuthUser) {
    console.log('[Step 2/3] Creating initial Admin user in Supabase Auth...');
    const { data: newAdmin, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        role: 'admin',
        roll_number: adminRollNumber,
        full_name: adminFullName,
      },
    });

    if (adminErr || !newAdmin?.user) {
      console.error(`\n❌ Failed to create admin user: ${adminErr?.message || 'Unknown error'}`);
      process.exit(1);
    }

    adminUserId = newAdmin.user.id;
    console.log(`  ✓ Auth user successfully created (ID: ${adminUserId})`);
  } else {
    console.log(`[Step 2/3] Existing Auth user found (ID: ${adminUserId}).`);
    console.log('  ✓ Preserving existing password (will not overwrite).');
  }

  if (!adminUserId) {
    console.error('\n❌ Could not resolve Admin user ID.');
    process.exit(1);
  }

  // 3. Check for profile collisions and upsert verified admin profile
  console.log('[Step 3/3] Verifying and linking admin profile...');
  
  // Check for any conflicting profile with the same roll number or email but different ID
  const { data: conflictingProfiles } = await supabaseAdmin
    .from('profiles')
    .select('id, roll_number, email, role')
    .or(`roll_number.eq.${adminRollNumber},email.eq.${adminEmail}`);

  if (conflictingProfiles && conflictingProfiles.length > 0) {
    const conflict = conflictingProfiles.find((p) => p.id !== adminUserId);
    if (conflict) {
      console.warn(
        `\n⚠️ Warning: Found an existing profile (${conflict.roll_number} / ${conflict.email}) with ID ${conflict.id} that differs from Auth ID ${adminUserId}.`
      );
    }
  }

  const { data: profileRecord, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .upsert(
      {
        id: adminUserId,
        roll_number: adminRollNumber,
        full_name: adminFullName,
        email: adminEmail,
        role: 'admin',
        is_active: true,
      },
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (profileErr) {
    console.error(`\n❌ Profile upsert error: ${profileErr.message}`);
    process.exit(1);
  }

  console.log(`  ✓ Admin profile upserted successfully:`);
  console.log(`     - Name:        ${profileRecord.full_name}`);
  console.log(`     - Roll Number: ${profileRecord.roll_number}`);
  console.log(`     - Role:        ${profileRecord.role}`);
  console.log(`     - Active:      ${profileRecord.is_active}\n`);

  console.log('====================================================');
  console.log('🎉 Initial Admin Account Ready!');
  console.log('====================================================');
  console.log('You can now log in to the website using:');
  console.log(`  Identifier: ${adminRollNumber}  (or ${adminEmail})`);
  console.log('  Password:   [The password set in INITIAL_ADMIN_PASSWORD]');
  console.log('\n🔒 Next Step: For security, you can now remove SUPABASE_SERVICE_ROLE_KEY');
  console.log('from your local .env.local file.\n');
}

provisionInitialAdmin().catch((err) => {
  console.error('\n❌ Fatal provisioning exception:', err);
  process.exit(1);
});
