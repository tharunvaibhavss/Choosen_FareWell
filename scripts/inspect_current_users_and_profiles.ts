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
  } catch (e) {
    console.error('Error loading env:', e);
  }
}

loadLocalEnv('.env.local');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase URL or Service Role Key in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log('--- Inspecting live Supabase Auth and Profiles ---');

  // 1. List all auth users
  const authUsers: any[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data || data.users.length === 0) {
      hasMore = false;
    } else {
      authUsers.push(...data.users);
      if (data.users.length < 1000) hasMore = false;
      else page++;
    }
  }

  console.log(`Total Supabase Auth users: ${authUsers.length}`);
  authUsers.forEach((u) => {
    console.log(`  Auth User: ID=${u.id} | Email=${u.email} | Confirmed=${u.email_confirmed_at ? 'YES' : 'NO'}`);
  });

  // 2. List all profiles
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('*')
    .order('role', { ascending: true })
    .order('roll_number', { ascending: true });

  if (profErr) {
    console.error('Error fetching profiles:', profErr);
    process.exit(1);
  }

  console.log(`\nTotal Profiles in public.profiles: ${profiles?.length || 0}`);
  profiles?.forEach((p) => {
    console.log(`  Profile: ID=${p.id} | Roll=${p.roll_number} | Name=${p.full_name} | Email=${p.email} | Role=${p.role} | Active=${p.is_active}`);
  });

  // 3. Check for any submissions, answers, student_question_order
  const { count: ansCount } = await supabase.from('answers').select('*', { count: 'exact', head: true });
  const { count: subCount } = await supabase.from('submissions').select('*', { count: 'exact', head: true });
  const { count: ordCount } = await supabase.from('student_question_order').select('*', { count: 'exact', head: true });

  console.log(`\nCurrent Database Records:`);
  console.log(`  Answers: ${ansCount || 0}`);
  console.log(`  Submissions: ${subCount || 0}`);
  console.log(`  Question Orders: ${ordCount || 0}`);
}

main().catch(console.error);
