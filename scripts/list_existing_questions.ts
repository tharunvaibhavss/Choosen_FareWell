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

const supabase = createClient(supabaseUrl!, serviceKey!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function run() {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .order('question_number', { ascending: true });

  if (error) {
    console.error('Supabase error:', error);
    process.exit(1);
  }

  console.log(`Current questions count: ${data.length}`);
  console.log('Columns on record 0:', Object.keys(data[0] || {}));
  data.forEach((q) => {
    console.log(`Q${q.question_number}: id=${q.id} text="${q.question_text}" desc="${q.description}" active=${q.is_active}`);
  });
}

run();
