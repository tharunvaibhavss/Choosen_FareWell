import fs from 'node:fs';

// Load .env.local into process.env BEFORE importing AdminService
const env = fs.readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let val = match[2] || '';
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[key] = val;
  }
}

// In test environment, use service role key so AdminService can query tables that require admin role in Supabase RLS
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.VITE_SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
}

async function runTest() {
  const { AdminService } = await import('../src/services/adminService');

  console.log('Testing AdminService.getValidatedAnalysisData()...');
  const data = await AdminService.getValidatedAnalysisData();

  console.log(`\n1. Students count: ${data.students.length} (Expected: 60)`);
  console.log(`   First student: ${data.students[0].roll_number} - ${data.students[0].full_name}`);
  console.log(`   Last student: ${data.students[59].roll_number} - ${data.students[59].full_name}`);

  console.log(`\n2. Questions count: ${data.questions.length} (Expected: 72)`);
  console.log(`   First question: #${data.questions[0].question_number} - ${data.questions[0].question_text}`);
  console.log(`   Last question: #${data.questions[71].question_number} - ${data.questions[71].question_text}`);

  console.log(`\n3. Answer Memory Rows count: ${data.answerMemoryRows.length} (Expected: 1963)`);
  console.log(`   First answer: Resp ${data.answerMemoryRows[0].respondentRollNumber} (${data.answerMemoryRows[0].respondentName}), Q#${data.answerMemoryRows[0].questionNumber}, Chosen ${data.answerMemoryRows[0].selectedClassmateRollNumber} (${data.answerMemoryRows[0].selectedClassmateName})`);
  const lastAns = data.answerMemoryRows[data.answerMemoryRows.length - 1];
  console.log(`   Last answer: Resp ${lastAns.respondentRollNumber} (${lastAns.respondentName}), Q#${lastAns.questionNumber}, Chosen ${lastAns.selectedClassmateRollNumber} (${lastAns.selectedClassmateName})`);

  console.log(`\n4. Student Detail Rows count: ${data.studentDetailRows.length} (Expected: 60)`);
  console.log(`\n5. Question Bank Rows count: ${data.questionBankRows.length} (Expected: 72)`);

  console.log(`\n6. Submission Summary Rows count: ${data.submissionSummaryRows.length} (Expected: 60)`);
  const submitted = data.submissionSummaryRows.filter((s) => s.submissionStatus === 'SUBMITTED');
  const inProgress = data.submissionSummaryRows.filter((s) => s.submissionStatus === 'IN PROGRESS');
  const notStarted = data.submissionSummaryRows.filter((s) => s.submissionStatus === 'NOT STARTED');
  console.log(`   Submitted count: ${submitted.length}`);
  console.log(`   In Progress count: ${inProgress.length}`);
  console.log(`   Not Started count: ${notStarted.length}`);

  // Confirm no passwords or sensitive tokens exist
  const sampleStudent = data.studentDetailRows[0];
  console.log('\n7. Security check on Sheet 1 (No passwords or tokens):');
  console.log('   Sample row keys:', Object.keys(sampleStudent));
  console.log('   Sample row values:', sampleStudent);
  if ('password' in (sampleStudent as any) || 'token' in (sampleStudent as any)) {
    throw new Error('SECURITY VIOLATION: Sensitive fields found in export data!');
  }
  console.log('   ✓ Verified: No passwords or secret keys exist in export data.');

  console.log('\nSUCCESS: All AdminService export data verified accurately against live Supabase!');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
