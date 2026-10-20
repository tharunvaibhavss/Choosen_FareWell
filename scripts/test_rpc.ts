import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)![1].trim();
const serv = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)![1].trim();
const admin = createClient(url, serv);

async function run() {
  const { data, error } = await admin.rpc('admin_get_student_summaries');
  console.log('RPC error:', error?.message);
  console.log('RPC data count:', data?.length);
  if (data && data.length > 0) {
    console.log('First row sample:', data[0]);
  }
}

run();
