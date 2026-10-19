/**
 * Supabase Account Provisioning Script
 * 
 * Provisions:
 * - 1 Administrator Account (admin@mca2527.college)
 * - 60 Student Accounts (mca2501@mca2527.college through mca2560@mca2527.college)
 * 
 * Uses Supabase Admin API with service_role key to safely create auth users
 * and populate the profiles table.
 * 
 * Usage:
 * npx tsx scripts/provision_accounts.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { MCA_60_STUDENTS, ADMIN_ACCOUNT } from '../src/data/studentsData';

dotenv.config({ path: '.env.local' });
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  console.log('Please set these variables in .env.local to run the live provisioning script.');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function provisionAccounts() {
  console.log('=== Starting MCA Memories 2025-2027 Provisioning ===');

  // 1. Provision Admin
  const adminEmail = 'admin@mca2527.college';
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Admin@MCA2025!';

  console.log(`\n[1/2] Provisioning Admin: ${adminEmail}...`);
  const { data: existingAdminList } = await supabaseAdmin.auth.admin.listUsers();
  const existingAdmin = existingAdminList?.users.find((u) => u.email === adminEmail);

  let adminUserId = existingAdmin?.id;

  if (!existingAdmin) {
    const { data: newAdmin, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        role: 'admin',
        roll_number: ADMIN_ACCOUNT.rollNumber,
        full_name: ADMIN_ACCOUNT.fullName,
      },
    });

    if (adminErr) {
      console.error(`Failed to create admin user: ${adminErr.message}`);
    } else {
      adminUserId = newAdmin.user.id;
      console.log(`✓ Admin user created with ID: ${adminUserId}`);
    }
  } else {
    console.log(`✓ Admin user already exists: ${adminUserId}`);
  }

  if (adminUserId) {
    await supabaseAdmin.from('profiles').upsert({
      id: adminUserId,
      roll_number: ADMIN_ACCOUNT.rollNumber,
      full_name: ADMIN_ACCOUNT.fullName,
      role: 'admin',
    });
    console.log('✓ Admin profile upserted');
  }

  // 2. Provision 60 Students
  console.log('\n[2/2] Provisioning 60 Students...');
  let successCount = 0;

  for (const student of MCA_60_STUDENTS) {
    const rollLower = student.rollNumber.toLowerCase();
    const studentEmail = `${rollLower}@mca2527.college`;
    const studentPassword = process.env.INITIAL_STUDENT_PASSWORD || `mca2527@${rollLower}`;

    const existingStudent = existingAdminList?.users.find((u) => u.email === studentEmail);
    let studentUserId = existingStudent?.id;

    if (!existingStudent) {
      const { data: newStudent, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: studentEmail,
        password: studentPassword,
        email_confirm: true,
        user_metadata: {
          role: 'student',
          roll_number: student.rollNumber,
          full_name: student.fullName,
        },
      });

      if (createErr) {
        console.error(`Failed to create ${student.rollNumber} (${student.fullName}): ${createErr.message}`);
        continue;
      }
      studentUserId = newStudent.user.id;
    }

    if (studentUserId) {
      const { error: profileErr } = await supabaseAdmin.from('profiles').upsert({
        id: studentUserId,
        roll_number: student.rollNumber,
        full_name: student.fullName,
        role: 'student',
      });

      if (profileErr) {
        console.error(`Profile upsert error for ${student.rollNumber}:`, profileErr.message);
      } else {
        successCount++;
        process.stdout.write(`\rProvisioned: ${successCount}/60 students (${student.rollNumber})`);
      }
    }
  }

  console.log(`\n\n🎉 Successfully completed! 1 Admin and ${successCount} Students provisioned.`);
}

provisionAccounts().catch(console.error);
