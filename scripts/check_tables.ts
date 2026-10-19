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
  const { data, error } = await supabase.rpc('get_login_email_for_roll', { p_roll_number: '25MCA001' });
  console.log('RPC test:', data);

  // Check counts
  const { count: cProf } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  const { count: cQues } = await supabase.from('questions').select('*', { count: 'exact', head: true });
  const { count: cOrdr } = await supabase.from('student_question_order').select('*', { count: 'exact', head: true });
  const { count: cAnsw } = await supabase.from('answers').select('*', { count: 'exact', head: true });
  const { count: cSubm } = await supabase.from('submissions').select('*', { count: 'exact', head: true });

  console.log('Database row counts:');
  console.log('  profiles:', cProf);
  console.log('  questions:', cQues);
  console.log('  student_question_order:', cOrdr);
  console.log('  answers:', cAnsw);
  console.log('  submissions:', cSubm);
}

main().catch(console.error);
