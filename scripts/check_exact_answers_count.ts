import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)![1].trim();
const serv = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)![1].trim();
const admin = createClient(url, serv);

async function run() {
  const { count, error } = await admin.from('answers').select('*', { count: 'exact', head: true });
  console.log('Database answers total count right now:', count);
}

run();
