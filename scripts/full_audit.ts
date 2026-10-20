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

interface AuditRow {
  rollNumber: string;
  fullName: string;
  studentId: string;
  submissionExists: boolean;
  submissionStatus: string | null;
  submissionAnswerCount: number | null;
  submittedAt: string | null;
  actualAnswerCount: number;
  distinctClassmates: number;
  duplicateChoicesCount: number;
  selfSelectCount: number;
  invalidClassmateCount: number;
  adminDashboardCountWith1000Limit: number;
  expectedStatus: string;
  issue: string;
}

async function main() {
  // 1. Fetch all students
  const { data: students, error: studErr } = await supabase
    .from('profiles')
    .select('id, roll_number, full_name, role')
    .eq('role', 'student')
    .order('roll_number', { ascending: true });

  if (studErr || !students) {
    console.error('Failed to fetch students:', studErr);
    return;
  }

  const validStudentIds = new Set(students.map((s) => s.id));

  // 2. Fetch all submissions
  const { data: subs } = await supabase.from('submissions').select('*');
  const subMap = new Map((subs || []).map((s) => [s.student_id, s]));

  // 3. Fetch answers with default 1000 limit (to replicate what Admin Dashboard currently calculates)
  const { data: limitedAnswers } = await supabase.from('answers').select('respondent_id');
  const limitedCountMap = new Map<string, number>();
  (limitedAnswers || []).forEach((a) => {
    limitedCountMap.set(a.respondent_id, (limitedCountMap.get(a.respondent_id) || 0) + 1);
  });

  const auditRows: AuditRow[] = [];

  for (const s of students) {
    // 4. Fetch actual answers per student specifically
    const { data: studentAnswers } = await supabase
      .from('answers')
      .select('id, question_id, selected_student_id, created_at')
      .eq('respondent_id', s.id);

    const sub = subMap.get(s.id);
    const actualCount = studentAnswers?.length || 0;
    
    // Classmate counts
    const classmateIds = (studentAnswers || []).map((a) => a.selected_student_id);
    const distinctSet = new Set(classmateIds);
    const distinctClassmates = distinctSet.size;
    const duplicateChoicesCount = actualCount - distinctClassmates;
    const selfSelectCount = classmateIds.filter((cid) => cid === s.id).length;
    const invalidClassmateCount = classmateIds.filter((cid) => !validStudentIds.has(cid)).length;

    const limitedCount = limitedCountMap.get(s.id) || 0;
    const isSubmitted = sub && sub.status === 'submitted';

    let expectedStatus = 'Pending';
    if (distinctClassmates === 59 && duplicateChoicesCount === 0 && selfSelectCount === 0 && invalidClassmateCount === 0 && isSubmitted) {
      expectedStatus = 'Submitted';
    } else if (distinctClassmates === 59 && duplicateChoicesCount === 0 && selfSelectCount === 0 && invalidClassmateCount === 0 && !isSubmitted) {
      expectedStatus = 'Eligible (Not Submitted)';
    } else if (actualCount > 0) {
      expectedStatus = 'In Progress';
    } else {
      expectedStatus = 'Not Started';
    }

    let issue = 'None (Valid)';
    if (isSubmitted && distinctClassmates < 59) {
      issue = `Submitted with only ${distinctClassmates} valid choices!`;
    } else if (isSubmitted && distinctClassmates === 59 && limitedCount < 59) {
      issue = `Admin Dashboard truncation bug: actual db has 59 choices, but admin displays ${limitedCount}/59 due to 1,000-row PostgREST limit`;
    } else if (!isSubmitted && actualCount >= 59) {
      issue = 'Has 59 answers but not submitted in submissions table';
    } else if (duplicateChoicesCount > 0) {
      issue = `Has ${duplicateChoicesCount} duplicate choices`;
    } else if (selfSelectCount > 0) {
      issue = `Has ${selfSelectCount} self-selections`;
    } else if (!isSubmitted) {
      issue = actualCount > 0 ? `In Progress (${actualCount}/59)` : 'Not Started (0/59)';
    }

    auditRows.push({
      rollNumber: s.roll_number,
      fullName: s.full_name,
      studentId: s.id,
      submissionExists: Boolean(sub),
      submissionStatus: sub ? sub.status : null,
      submissionAnswerCount: sub ? sub.answer_count : null,
      submittedAt: sub ? sub.submitted_at : null,
      actualAnswerCount: actualCount,
      distinctClassmates,
      duplicateChoicesCount,
      selfSelectCount,
      invalidClassmateCount,
      adminDashboardCountWith1000Limit: limitedCount,
      expectedStatus,
      issue,
    });
  }

  // Summary statistics
  const totalStudents = auditRows.length;
  const correctlyMarkedSubmitted = auditRows.filter((r) => r.submissionStatus === 'submitted' && r.distinctClassmates === 59 && r.duplicateChoicesCount === 0 && r.selfSelectCount === 0).length;
  const submittedWithFewerThan59 = auditRows.filter((r) => r.submissionStatus === 'submitted' && r.distinctClassmates < 59).length;
  const submittedWith59ButDuplicates = auditRows.filter((r) => r.submissionStatus === 'submitted' && (r.duplicateChoicesCount > 0 || r.selfSelectCount > 0)).length;
  const pendingWith59 = auditRows.filter((r) => r.submissionStatus !== 'submitted' && r.distinctClassmates >= 59).length;
  const affectedByTruncationDisplay = auditRows.filter((r) => r.submissionStatus === 'submitted' && r.distinctClassmates === 59 && r.adminDashboardCountWith1000Limit < 59).length;

  console.log('\n=== AUDIT SUMMARY ===');
  console.log(`Total students examined: ${totalStudents}`);
  console.log(`Students with recorded submission: ${auditRows.filter((r) => r.submissionExists).length}`);
  console.log(`Students correctly marked Submitted (59 valid distinct choices in db): ${correctlyMarkedSubmitted}`);
  console.log(`Students marked Submitted with fewer than 59 valid choices in db: ${submittedWithFewerThan59}`);
  console.log(`Students with 59+ choices but duplicates or self-selections: ${submittedWith59ButDuplicates}`);
  console.log(`Students marked Pending despite having 59 valid choices: ${pendingWith59}`);
  console.log(`Students whose Admin Dashboard display is corrupted by 1,000-row limit: ${affectedByTruncationDisplay}`);

  console.log('\n=== DETAILED BREAKDOWN OF STUDENTS WITH DISPLAY TRUNCATION OR SUBMISSION ISSUES ===');
  const problematicRows = auditRows.filter((r) => r.submissionExists || r.actualAnswerCount > 0);
  for (const r of problematicRows) {
    console.log(`${r.rollNumber} | ${r.fullName.padEnd(25)} | DB Answers: ${String(r.actualAnswerCount).padStart(2)} | Distinct: ${String(r.distinctClassmates).padStart(2)} | Sub Status: ${String(r.submissionStatus).padEnd(9)} | Admin Count: ${String(r.adminDashboardCountWith1000Limit).padStart(2)}/59 | Issue: ${r.issue}`);
  }

  // Also write full audit JSON to file for reporting
  fs.writeFileSync('scratch/audit_results.json', JSON.stringify({ auditRows, summary: { totalStudents, correctlyMarkedSubmitted, submittedWithFewerThan59, submittedWith59ButDuplicates, pendingWith59, affectedByTruncationDisplay } }, null, 2));
}

main().catch(console.error);
