import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminSupabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function audit() {
  console.log('=== AUDITING STUDENT 25MCA030 STATUS ===');

  // 1. Fetch Profile
  const { data: profile, error: profErr } = await adminSupabase
    .from('profiles')
    .select('*')
    .eq('roll_number', '25MCA030')
    .single();

  if (profErr || !profile) {
    console.error('Profile fetch error:', profErr);
    return;
  }

  console.log('Profile Data:');
  console.log('  ID (UUID):', profile.id);
  console.log('  Roll Number:', profile.roll_number);
  console.log('  Full Name:', profile.full_name);
  console.log('  Email:', profile.email);
  console.log('  Role:', profile.role);
  console.log('  is_active:', profile.is_active);
  console.log('  must_change_password:', profile.must_change_password);
  console.log('  password_changed_at:', profile.password_changed_at);
  console.log('  created_at:', profile.created_at);
  console.log('  updated_at:', profile.updated_at);

  // 2. Fetch Auth User
  const { data: authUser, error: authErr } = await adminSupabase.auth.admin.getUserById(profile.id);
  if (authErr || !authUser.user) {
    console.error('Auth User fetch error:', authErr);
    return;
  }

  const u = authUser.user;
  console.log('\nAuth User Data:');
  console.log('  ID:', u.id);
  console.log('  Email:', u.email);
  console.log('  Email Confirmed At:', u.email_confirmed_at);
  console.log('  Banned Until:', (u as any).banned_until);
  console.log('  Ban Duration:', (u as any).ban_duration);
  console.log('  App Metadata:', u.app_metadata);
  console.log('  User Metadata:', u.user_metadata);
  console.log('  Last Sign In:', u.last_sign_in_at);
  console.log('  Created At:', u.created_at);
  console.log('  Updated At:', u.updated_at);

  // 3. Check Submissions / Answers
  const { data: subs } = await adminSupabase.from('submissions').select('*').eq('student_id', profile.id);
  const { data: answers } = await adminSupabase.from('answers').select('id').eq('respondent_id', profile.id);
  console.log('\nData state:');
  console.log('  Submissions count:', subs?.length);
  console.log('  Answers count:', answers?.length);
}

audit();
