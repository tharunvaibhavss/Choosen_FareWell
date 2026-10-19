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
  const { data: students, error: sErr } = await supabase
    .from('profiles')
    .select('id, roll_number, first_login_reset_completed, first_login_reset_at')
    .eq('role', 'student');

  if (sErr) throw sErr;

  console.log(`Total students in profiles: ${students?.length}`);
  const completedCount = students?.filter(s => s.first_login_reset_completed === true).length;
  const pendingCount = students?.filter(s => s.first_login_reset_completed === false).length;
  console.log(`Pending reset count: ${pendingCount} (Expected: 60)`);
  console.log(`Completed reset count: ${completedCount} (Expected: 0)`);

  const { data: auditRows, error: aErr } = await supabase
    .from('student_one_time_resets')
    .select('*');

  if (aErr) throw aErr;
  console.log(`Total rows in student_one_time_resets: ${auditRows?.length} (Expected: 60)`);
  const auditPending = auditRows?.filter(r => r.reset_completed === false).length;
  console.log(`Audit rows pending: ${auditPending} (Expected: 60)`);
}

main().catch(console.error);
