import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)![1].trim();
const serv = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)![1].trim();
const admin = createClient(url, serv);

function parseRollNumber(roll: string | number | undefined | null): number {
  if (typeof roll === 'number') return roll;
  const str = String(roll || '').trim();
  const trailing = str.match(/(\d+)$/);
  if (trailing) return parseInt(trailing[1], 10);
  const match = str.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

function formatExportDateTime(dateVal: string | Date | null | undefined): string {
  if (!dateVal) return '—';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '—';
    const pad = (n: number) => n.toString().padStart(2, '0');
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const mins = pad(d.getMinutes());
    const secs = pad(d.getSeconds());
    return `${y}-${m}-${day} ${hours}:${mins}:${secs}`;
  } catch {
    return '—';
  }
}

async function generateTestWorkbook() {
  console.log('--- FETCHING DATA FROM SUPABASE ---');

  // 1. Students
  const { data: students, error: sErr } = await admin
    .from('profiles')
    .select('*')
    .eq('role', 'student')
    .order('roll_number', { ascending: true });
  if (sErr || !students) throw sErr;

  const sortedStudents = [...students].sort((a, b) => {
    const numA = parseRollNumber(a.roll_number);
    const numB = parseRollNumber(b.roll_number);
    if (numA !== numB) return numA - numB;
    return a.roll_number.localeCompare(b.roll_number);
  });

  // 2. Questions
  const { data: questions, error: qErr } = await admin
    .from('questions')
    .select('*')
    .order('question_number', { ascending: true });
  if (qErr || !questions) throw qErr;

  const sortedQuestions = [...questions].sort((a, b) => a.question_number - b.question_number);

  // 3. Paginated Answers
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

    if (aErr || !chunk) throw aErr;
    allAnswers.push(...chunk);
    if (chunk.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  // 4. Submissions
  const { data: submissions, error: subErr } = await admin
    .from('submissions')
    .select('*');
  if (subErr || !submissions) throw subErr;

  const submissionMap = new Map(submissions.map((s) => [s.student_id, s]));
  const studentsMap = new Map(sortedStudents.map((s) => [s.id, s]));
  const questionsMap = new Map(sortedQuestions.map((q) => [q.id, q]));

  // Validate answers
  const validAnswers: any[] = [];
  const seenRespQuestion = new Set<string>();
  const seenRespClassmate = new Set<string>();

  for (const ans of allAnswers) {
    if (!ans.respondent_id || !ans.question_id || !ans.selected_student_id) continue;
    if (ans.respondent_id === ans.selected_student_id) continue;

    const respondent = studentsMap.get(ans.respondent_id);
    const selected = studentsMap.get(ans.selected_student_id);
    const question = questionsMap.get(ans.question_id);

    if (!respondent || !selected || !question) continue;

    const qKey = `${ans.respondent_id}___${ans.question_id}`;
    if (seenRespQuestion.has(qKey)) continue;

    const cKey = `${ans.respondent_id}___${ans.selected_student_id}`;
    if (seenRespClassmate.has(cKey)) continue;

    seenRespQuestion.add(qKey);
    seenRespClassmate.add(cKey);

    validAnswers.push({
      id: ans.id,
      respondentRoll: respondent.roll_number,
      respondentName: respondent.full_name,
      questionNumber: question.question_number,
      questionText: question.question_text,
      selectedClassmateRoll: selected.roll_number,
      selectedClassmateName: selected.full_name,
      answeredAt: ans.updated_at || ans.created_at || new Date().toISOString(),
      respondentId: respondent.id,
      selectedStudentId: selected.id,
    });
  }

  // Sort answers
  validAnswers.sort((a, b) => {
    const rollDiff = parseRollNumber(a.respondentRoll) - parseRollNumber(b.respondentRoll);
    if (rollDiff !== 0) return rollDiff;
    return a.questionNumber - b.questionNumber;
  });

  // Calculate student answers count and distinct classmates
  const respAnswersCountMap = new Map<string, number>();
  const respDistinctClassmatesMap = new Map<string, Set<string>>();

  for (const a of validAnswers) {
    respAnswersCountMap.set(a.respondentId, (respAnswersCountMap.get(a.respondentId) || 0) + 1);
    let set = respDistinctClassmatesMap.get(a.respondentId);
    if (!set) {
      set = new Set<string>();
      respDistinctClassmatesMap.set(a.respondentId, set);
    }
    set.add(a.selectedStudentId);
  }

  console.log(`Fetched ${sortedStudents.length} students, ${sortedQuestions.length} questions, ${validAnswers.length} valid answers, ${submissions.length} submissions.`);

  // CREATE WORKBOOK
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MCA Memories 2025–2027 Yearbook System';
  workbook.lastModifiedBy = 'Administrator';
  workbook.created = new Date();
  workbook.modified = new Date();

  // =========================================================================
  // SHEET 1: Student Details
  // =========================================================================
  const s1 = workbook.addWorksheet('Student Details', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
    properties: { tabColor: { argb: 'FF581C3F' } },
  });

  s1.mergeCells('A1:F1');
  const s1Title = s1.getCell('A1');
  s1Title.value = 'MCA MEMORIES 2025–2027 • STUDENT DETAILS';
  s1Title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  s1Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF581C3F' } };
  s1Title.alignment = { vertical: 'middle', horizontal: 'center' };
  s1.getRow(1).height = 36;

  s1.mergeCells('A2:F2');
  const s1Sub = s1.getCell('A2');
  s1Sub.value = `Total Registered Students: ${sortedStudents.length} • Roll Numbers: ${sortedStudents[0].roll_number} to ${sortedStudents[sortedStudents.length - 1].roll_number} • Exported on ${formatExportDateTime(new Date())}`;
  s1Sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
  s1Sub.alignment = { vertical: 'middle', horizontal: 'center' };
  s1.getRow(2).height = 22;

  s1.getRow(4).values = [
    'Roll Number',
    'Student Full Name',
    'Email Address',
    'Account Status',
    'Password Status',
    'Student Profile ID',
  ];

  s1.columns = [
    { key: 'rollNumber', width: 16 },
    { key: 'fullName', width: 30 },
    { key: 'email', width: 32 },
    { key: 'accountStatus', width: 18 },
    { key: 'passwordStatus', width: 24 },
    { key: 'studentId', width: 40 },
  ];

  const s1Header = s1.getRow(4);
  s1Header.height = 26;
  s1Header.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF732A54' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD99CA5' } },
      bottom: { style: 'medium', color: { argb: 'FF42112D' } },
    };
  });

  sortedStudents.forEach((st, idx) => {
    const row = s1.getRow(5 + idx);
    const passStatus = st.password_changed_at || st.must_change_password === false ? 'Changed' : 'Default (Must Change)';
    row.values = [
      st.roll_number,
      st.full_name,
      st.email || `${st.roll_number.toLowerCase()}@mcafarewell.com`,
      st.is_active ? 'ACTIVE' : 'DISABLED',
      passStatus,
      st.id,
    ];
    row.height = 22;
    const isEven = idx % 2 === 0;
    const bgColor = isEven ? 'FFFFFFFF' : 'FFFDF8F5';

    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE6D5D8' } },
        right: { style: 'thin', color: { argb: 'FFE6D5D8' } },
        left: { style: 'thin', color: { argb: 'FFE6D5D8' } },
      };
      if (colNum === 1 || colNum === 4 || colNum === 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });
  s1.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + sortedStudents.length, column: 6 } };

  // =========================================================================
  // SHEET 2: Question Bank
  // =========================================================================
  const s2 = workbook.addWorksheet('Question Bank', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
    properties: { tabColor: { argb: 'FFC59B27' } },
  });

  s2.mergeCells('A1:D1');
  const s2Title = s2.getCell('A1');
  s2Title.value = 'MCA MEMORIES 2025–2027 • QUESTION BANK';
  s2Title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  s2Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8F6A0C' } };
  s2Title.alignment = { vertical: 'middle', horizontal: 'center' };
  s2.getRow(1).height = 36;

  s2.mergeCells('A2:D2');
  const s2Sub = s2.getCell('A2');
  const activeCount = sortedQuestions.filter((q) => q.is_active).length;
  s2Sub.value = `Total Questions: ${sortedQuestions.length} • Active Questions: ${activeCount} • Exported on ${formatExportDateTime(new Date())}`;
  s2Sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
  s2Sub.alignment = { vertical: 'middle', horizontal: 'center' };
  s2.getRow(2).height = 22;

  s2.getRow(4).values = [
    'Question #',
    'Yearbook Memory Question Prompt',
    'Active Status',
    'Question Record ID',
  ];

  s2.columns = [
    { key: 'qNum', width: 14 },
    { key: 'qText', width: 72 },
    { key: 'status', width: 16 },
    { key: 'qId', width: 40 },
  ];

  const s2Header = s2.getRow(4);
  s2Header.height = 26;
  s2Header.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC59B27' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE5C672' } },
      bottom: { style: 'medium', color: { argb: 'FF8F6A0C' } },
    };
  });

  sortedQuestions.forEach((q, idx) => {
    const row = s2.getRow(5 + idx);
    row.values = [
      q.question_number,
      q.question_text,
      q.is_active ? 'ACTIVE' : 'INACTIVE',
      q.id,
    ];
    row.height = 24;
    const isEven = idx % 2 === 0;
    const bgColor = isEven ? 'FFFFFFFF' : 'FFFDFBF7';

    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFEEDDC5' } },
        right: { style: 'thin', color: { argb: 'FFEEDDC5' } },
        left: { style: 'thin', color: { argb: 'FFEEDDC5' } },
      };
      if (colNum === 1 || colNum === 3) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: colNum === 2 };
      }
    });
  });
  s2.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + sortedQuestions.length, column: 4 } };

  // =========================================================================
  // SHEET 3: Answers - Memory Selections
  // =========================================================================
  const s3 = workbook.addWorksheet('Answers - Memory Selections', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
    properties: { tabColor: { argb: 'FF87426A' } },
  });

  s3.mergeCells('A1:H1');
  const s3Title = s3.getCell('A1');
  s3Title.value = 'MCA MEMORIES 2025–2027 • ANSWERS & MEMORY SELECTIONS';
  s3Title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  s3Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF581C3F' } };
  s3Title.alignment = { vertical: 'middle', horizontal: 'center' };
  s3.getRow(1).height = 36;

  s3.mergeCells('A2:H2');
  const s3Sub = s3.getCell('A2');
  s3Sub.value = `Total Recorded Selections: ${validAnswers.length} • Required per student: 59 • Confidential Yearbook Data • Exported on ${formatExportDateTime(new Date())}`;
  s3Sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
  s3Sub.alignment = { vertical: 'middle', horizontal: 'center' };
  s3.getRow(2).height = 22;

  s3.getRow(4).values = [
    'Respondent Roll Number',
    'Respondent Name',
    'Question #',
    'Yearbook Memory Question Prompt',
    'Selected Classmate Roll Number',
    'Selected Classmate Name',
    'Answer Record ID',
    'Answered Timestamp',
  ];

  s3.columns = [
    { key: 'respRoll', width: 22 },
    { key: 'respName', width: 28 },
    { key: 'qNum', width: 14 },
    { key: 'qText', width: 62 },
    { key: 'chosenRoll', width: 24 },
    { key: 'chosenName', width: 28 },
    { key: 'ansId', width: 40 },
    { key: 'timestamp', width: 24 },
  ];

  const s3Header = s3.getRow(4);
  s3Header.height = 26;
  s3Header.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF87426A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD99CA5' } },
      bottom: { style: 'medium', color: { argb: 'FF42112D' } },
    };
  });

  validAnswers.forEach((ans, idx) => {
    const row = s3.getRow(5 + idx);
    row.values = [
      ans.respondentRoll,
      ans.respondentName,
      ans.questionNumber,
      ans.questionText,
      ans.selectedClassmateRoll,
      ans.selectedClassmateName,
      ans.id,
      formatExportDateTime(ans.answeredAt),
    ];
    row.height = 22;
    const isEven = idx % 2 === 0;
    const bgColor = isEven ? 'FFFFFFFF' : 'FFFDF8F5';

    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE6D5D8' } },
        right: { style: 'thin', color: { argb: 'FFE6D5D8' } },
        left: { style: 'thin', color: { argb: 'FFE6D5D8' } },
      };
      if (colNum === 1 || colNum === 3 || colNum === 5 || colNum === 8) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: colNum === 4 };
      }
    });
  });
  s3.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + validAnswers.length, column: 8 } };

  // =========================================================================
  // SHEET 4: Submission Summary
  // =========================================================================
  const s4 = workbook.addWorksheet('Submission Summary', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
    properties: { tabColor: { argb: 'FF4A1525' } },
  });

  s4.mergeCells('A1:G1');
  const s4Title = s4.getCell('A1');
  s4Title.value = 'MCA MEMORIES 2025–2027 • SUBMISSION SUMMARY';
  s4Title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  s4Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A1525' } };
  s4Title.alignment = { vertical: 'middle', horizontal: 'center' };
  s4.getRow(1).height = 36;

  const submittedCount = submissions.filter((s) => s.status === 'submitted').length;
  s4.mergeCells('A2:G2');
  const s4Sub = s4.getCell('A2');
  s4Sub.value = `Batch of ${sortedStudents.length} Students • ${submittedCount} Completed • ${sortedStudents.length - submittedCount} Pending • 59 Required Selections • Exported on ${formatExportDateTime(new Date())}`;
  s4Sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
  s4Sub.alignment = { vertical: 'middle', horizontal: 'center' };
  s4.getRow(2).height = 22;

  s4.getRow(4).values = [
    'Roll Number',
    'Student Full Name',
    'Actual Valid Answer Count (of 59)',
    'Distinct-Classmate Count',
    'Submission Status',
    'Submission Timestamp',
    'Account Status',
  ];

  s4.columns = [
    { key: 'rollNumber', width: 16 },
    { key: 'fullName', width: 30 },
    { key: 'answerCount', width: 32 },
    { key: 'distinctCount', width: 26 },
    { key: 'status', width: 22 },
    { key: 'submittedAt', width: 26 },
    { key: 'accountStatus', width: 16 },
  ];

  const s4Header = s4.getRow(4);
  s4Header.height = 26;
  s4Header.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF581C3F' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD99CA5' } },
      bottom: { style: 'medium', color: { argb: 'FF2A0D15' } },
    };
  });

  sortedStudents.forEach((student, idx) => {
    const row = s4.getRow(5 + idx);
    const sub = submissionMap.get(student.id);
    const answeredCount = respAnswersCountMap.get(student.id) || 0;
    const distinctCount = respDistinctClassmatesMap.get(student.id)?.size || 0;

    let status = 'NOT STARTED';
    if (sub && sub.status === 'submitted' && answeredCount >= 59) {
      status = 'SUBMITTED';
    } else if (answeredCount > 0) {
      status = 'IN PROGRESS';
    }

    const timestamp = (sub && sub.status === 'submitted' && answeredCount >= 59)
      ? formatExportDateTime(sub.submitted_at)
      : '—';

    row.values = [
      student.roll_number,
      student.full_name,
      `${answeredCount} / 59`,
      distinctCount,
      status,
      timestamp,
      student.is_active ? 'ACTIVE' : 'DISABLED',
    ];

    row.height = 22;
    const isEven = idx % 2 === 0;
    const bgColor = isEven ? 'FFFFFFFF' : 'FFFDF8F5';

    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE6D5D8' } },
        right: { style: 'thin', color: { argb: 'FFE6D5D8' } },
        left: { style: 'thin', color: { argb: 'FFE6D5D8' } },
      };

      if (colNum === 1 || colNum === 3 || colNum === 4 || colNum === 6 || colNum === 7) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNum === 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (status === 'SUBMITTED') {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1B5E20' } };
        } else if (status === 'IN PROGRESS') {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB78103' } };
        } else {
          cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF888888' } };
        }
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });
  s4.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + sortedStudents.length, column: 7 } };

  // Write file to check
  const outPath = 'scripts/test_output.xlsx';
  await workbook.xlsx.writeFile(outPath);
  console.log(`Workbook successfully saved to ${outPath}!`);

  // Verify by reading back with ExcelJS
  const verifyWb = new ExcelJS.Workbook();
  await verifyWb.xlsx.readFile(outPath);
  console.log('\n--- VERIFICATION OF GENERATED WORKBOOK ---');
  console.log(`Worksheet count: ${verifyWb.worksheets.length}`);
  verifyWb.worksheets.forEach((ws) => {
    console.log(`Sheet name: "${ws.name}", Row count: ${ws.rowCount}, Column count: ${ws.columnCount}`);
  });
}

generateTestWorkbook().catch(console.error);
