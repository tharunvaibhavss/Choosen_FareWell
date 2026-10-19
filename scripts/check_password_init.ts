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
    .select('id, roll_number, must_change_password, password_changed_at')
    .eq('role', 'student');

  if (sErr) throw sErr;

  console.log(`Total students: ${students?.length}`);
  const pendingCount = students?.filter(s => s.must_change_password === true).length;
  const changedCount = students?.filter(s => s.must_change_password === false).length;
  console.log(`Password change pending: ${pendingCount} (Expected: 60)`);
  console.log(`Password changed: ${changedCount} (Expected: 0)`);

  const { data: adminProf } = await supabase
    .from('profiles')
    .select('id, roll_number, must_change_password, password_changed_at')
    .eq('role', 'admin')
    .single();

  console.log(`Admin must_change_password: ${adminProf?.must_change_password} (Expected: false)`);
}

main().catch(console.error);
