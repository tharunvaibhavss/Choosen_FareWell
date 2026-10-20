import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)![1].trim();
const anon = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)![1].trim();
const serv = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)![1].trim();

const admin = createClient(url, serv);

async function runAudit() {
  console.log('====================================================');
  console.log('READ-ONLY AUDIT FOR EXCEL EXPORT INTEGRITY');
  console.log('====================================================\n');

  // 1. Audit Profiles (Students)
  const { data: students, error: studErr } = await admin
    .from('profiles')
    .select('*')
    .eq('role', 'student')
    .order('roll_number', { ascending: true });

  if (studErr || !students) {
    console.error('Error fetching students:', studErr);
    process.exit(1);
  }

  console.log(`1. Total Student Profiles: ${students.length} (Expected: 60)`);
  const rolls = students.map((s) => s.roll_number);
  const minRoll = rolls[0];
  const maxRoll = rolls[rolls.length - 1];
  console.log(`   Roll range: ${minRoll} to ${maxRoll}`);
  const duplicateRolls = rolls.filter((r, i) => rolls.indexOf(r) !== i);
  console.log(`   Duplicate rolls: ${duplicateRolls.length === 0 ? 'None (Clean)' : duplicateRolls.join(', ')}`);

  // 2. Audit Questions
  const { data: questions, error: qErr } = await admin
    .from('questions')
    .select('*')
    .order('question_number', { ascending: true });

  if (qErr || !questions) {
    console.error('Error fetching questions:', qErr);
    process.exit(1);
  }

  console.log(`\n2. Total Questions in Bank: ${questions.length} (Expected: 72)`);
  const activeQuestions = questions.filter((q) => q.is_active);
  console.log(`   Active questions: ${activeQuestions.length}`);

  // 3. Paginated Audit of All Answers
  const allAnswers: any[] = [];
  const pageSize = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: chunk, error: aErr } = await admin
      .from('answers')
      .select('id, respondent_id, question_id, selected_student_id, created_at, updated_at')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (aErr || !chunk || chunk.length === 0) {
      hasMore = false;
      break;
    }

    allAnswers.push(...chunk);
    if (chunk.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  console.log(`\n3. Total Answers Retrieved via Pagination: ${allAnswers.length}`);

  // Verify answer integrity
  const studentsMap = new Map(students.map((s) => [s.id, s]));
  const questionsMap = new Map(questions.map((q) => [q.id, q]));

  let orphanRespondent = 0;
  let orphanClassmate = 0;
  let orphanQuestion = 0;
  let selfSelections = 0;
  let duplicatePerRespQuestion = 0;

  const seenRespQuestion = new Set<string>();

  for (const a of allAnswers) {
    if (!studentsMap.has(a.respondent_id)) orphanRespondent++;
    if (!studentsMap.has(a.selected_student_id)) orphanClassmate++;
    if (!questionsMap.has(a.question_id)) orphanQuestion++;
    if (a.respondent_id === a.selected_student_id) selfSelections++;

    const key = `${a.respondent_id}___${a.question_id}`;
    if (seenRespQuestion.has(key)) duplicatePerRespQuestion++;
    seenRespQuestion.add(key);
  }

  console.log(`   Orphan respondent IDs: ${orphanRespondent}`);
  console.log(`   Orphan classmate IDs: ${orphanClassmate}`);
  console.log(`   Orphan question IDs: ${orphanQuestion}`);
  console.log(`   Self-selections (respondent == classmate): ${selfSelections}`);
  console.log(`   Duplicate (respondent, question) pairs: ${duplicatePerRespQuestion}`);

  // 4. Audit Submissions
  const { data: submissions, error: subErr } = await admin
    .from('submissions')
    .select('*')
    .order('submitted_at', { ascending: true });

  if (subErr || !submissions) {
    console.error('Error fetching submissions:', subErr);
    process.exit(1);
  }

  console.log(`\n4. Total Submissions: ${submissions.length}`);
  const submittedSubmissions = submissions.filter((s) => s.status === 'submitted');
  console.log(`   Submitted count: ${submittedSubmissions.length}`);

  // Compare answer counts per student vs submission records
  const respAnswersMap = new Map<string, any[]>();
  for (const a of allAnswers) {
    const list = respAnswersMap.get(a.respondent_id) || [];
    list.push(a);
    respAnswersMap.set(a.respondent_id, list);
  }

  console.log('\n5. Student Submission & Answers Verification Sample:');
  const subMap = new Map(submissions.map((s) => [s.student_id, s]));

  let mismatchCount = 0;
  for (const student of students) {
    const sub = subMap.get(student.id);
    const answersList = respAnswersMap.get(student.id) || [];
    const distinctClassmates = new Set(answersList.map((a) => a.selected_student_id)).size;

    if (sub && sub.status === 'submitted') {
      if (answersList.length < 59 || distinctClassmates < 59) {
        console.warn(`   MISMATCH: ${student.roll_number} is SUBMITTED but has only ${answersList.length} answers, ${distinctClassmates} distinct!`);
        mismatchCount++;
      }
    }
  }

  if (mismatchCount === 0) {
    console.log('   All submitted students have at least 59 answers and 59 distinct classmates!');
  }

  console.log('\n====================================================');
  console.log('AUDIT COMPLETE');
  console.log('====================================================');
}

runAudit().catch(console.error);
