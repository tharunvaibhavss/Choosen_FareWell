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

interface StudentAudit {
  rollNumber: string;
  fullName: string;
  studentId: string;
  backendAnswersCount: number;
  backendDistinctClassmates: number;
  duplicateAnswers: number;
  selfSelections: number;
  submissionRecordExists: boolean;
  submissionStatus: string | null;
  submissionRecordedCount: number | null;
  submittedAt: string | null;
  statusCategory: 'SUBMITTED_VALID' | 'SUBMITTED_INCOMPLETE' | 'IN_PROGRESS' | 'NOT_STARTED' | 'INCONSISTENT';
  missingAnswersTo59: number;
}

async function main() {
  const { data: students, error: sErr } = await supabase
    .from('profiles')
    .select('id, roll_number, full_name, email')
    .eq('role', 'student')
    .order('roll_number', { ascending: true });

  if (sErr || !students) {
    console.error('Failed to load students:', sErr);
    return;
  }

  const { data: submissions } = await supabase.from('submissions').select('*');
  const subMap = new Map((submissions || []).map((s) => [s.student_id, s]));

  const audits: StudentAudit[] = [];

  for (const s of students) {
    const { data: studentAnswers } = await supabase
      .from('answers')
      .select('id, question_id, selected_student_id, created_at, updated_at')
      .eq('respondent_id', s.id);

    const answers = studentAnswers || [];
    const count = answers.length;
    const classmateIds = answers.map((a) => a.selected_student_id);
    const distinctClassmates = new Set(classmateIds).size;
    const duplicates = count - distinctClassmates;
    const selfSelections = classmateIds.filter((cid) => cid === s.id).length;

    const sub = subMap.get(s.id);
    const isSubmitted = sub && sub.status === 'submitted';

    let statusCategory: StudentAudit['statusCategory'] = 'NOT_STARTED';
    if (isSubmitted) {
      if (count === 59 && distinctClassmates === 59 && duplicates === 0 && selfSelections === 0) {
        statusCategory = 'SUBMITTED_VALID';
      } else {
        statusCategory = 'SUBMITTED_INCOMPLETE';
      }
    } else if (count > 0) {
      statusCategory = 'IN_PROGRESS';
    } else {
      statusCategory = 'NOT_STARTED';
    }

    audits.push({
      rollNumber: s.roll_number,
      fullName: s.full_name,
      studentId: s.id,
      backendAnswersCount: count,
      backendDistinctClassmates: distinctClassmates,
      duplicateAnswers: duplicates,
      selfSelections,
      submissionRecordExists: Boolean(sub),
      submissionStatus: sub ? sub.status : null,
      submissionRecordedCount: sub ? sub.answer_count : null,
      submittedAt: sub ? sub.submitted_at : null,
      statusCategory,
      missingAnswersTo59: Math.max(0, 59 - count),
    });
  }

  console.log('=== AUDIT SUMMARY ===');
  console.log('Total students:', audits.length);
  const validSubmitted = audits.filter((a) => a.statusCategory === 'SUBMITTED_VALID');
  const incompleteSubmitted = audits.filter((a) => a.statusCategory === 'SUBMITTED_INCOMPLETE');
  const inProgress = audits.filter((a) => a.statusCategory === 'IN_PROGRESS');
  const notStarted = audits.filter((a) => a.statusCategory === 'NOT_STARTED');

  console.log(`SUBMITTED (Complete & Valid 59/59): ${validSubmitted.length}`);
  console.log(`SUBMITTED (Incomplete < 59): ${incompleteSubmitted.length}`);
  console.log(`IN PROGRESS (< 59 answers, not submitted): ${inProgress.length}`);
  console.log(`NOT STARTED (0 answers): ${notStarted.length}`);

  if (incompleteSubmitted.length > 0) {
    console.log('\n--- INCOMPLETE SUBMISSIONS DETECTED ---');
    for (const a of incompleteSubmitted) {
      console.log(`  ${a.rollNumber} | ${a.fullName} | Answers: ${a.backendAnswersCount}/59 | Distinct: ${a.backendDistinctClassmates} | Missing: ${a.missingAnswersTo59}`);
    }
  } else {
    console.log('\nNo incomplete submissions detected in submissions table (0 students).');
  }

  console.log('\n--- IN PROGRESS STUDENTS (< 59 answers) ---');
  for (const a of inProgress) {
    console.log(`  ${a.rollNumber} | ${a.fullName.padEnd(25)} | Answers: ${String(a.backendAnswersCount).padStart(2)}/59 | Distinct: ${String(a.backendDistinctClassmates).padStart(2)} | Missing: ${String(a.missingAnswersTo59).padStart(2)} answers`);
  }

  // Save audit data to scratch
  fs.writeFileSync('scratch/recovery_audit.json', JSON.stringify({ audits, summary: { total: audits.length, validSubmitted: validSubmitted.length, incompleteSubmitted: incompleteSubmitted.length, inProgress: inProgress.length, notStarted: notStarted.length } }, null, 2));
}

main().catch(console.error);
