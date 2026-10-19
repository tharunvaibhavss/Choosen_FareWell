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
  const { data: subs } = await supabase.from('submissions').select('*');
  console.log('Existing submissions count:', subs?.length);
  for (const s of subs || []) {
    const { data: prof } = await supabase.from('profiles').select('roll_number, full_name').eq('id', s.student_id).single();
    console.log(`  Submission: ${prof?.roll_number} (${prof?.full_name}) - status: ${s.status}, count: ${s.answer_count}`);
  }

  const { data: answers } = await supabase.from('answers').select('respondent_id');
  const countMap: Record<string, number> = {};
  (answers || []).forEach((a) => {
    countMap[a.respondent_id] = (countMap[a.respondent_id] || 0) + 1;
  });

  console.log('\nAnswer count by respondent:');
  for (const [respId, cnt] of Object.entries(countMap)) {
    const { data: p } = await supabase.from('profiles').select('roll_number, full_name').eq('id', respId).single();
    console.log(`  Respondent ${p?.roll_number} (${p?.full_name}): ${cnt} answers`);
  }
}

main().catch(console.error);
