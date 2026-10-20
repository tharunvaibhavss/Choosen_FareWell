import fs from 'node:fs';
import ExcelJS from 'exceljs';

// Setup environment
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
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.VITE_SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
}

async function run() {
  const { AdminService, formatExportDateTime } = await import('../src/services/adminService');

  console.log('Fetching analysis data via AdminService...');
  const analysisData = await AdminService.getValidatedAnalysisData();
  const { students, questions, answerMemoryRows, submissionSummaryRows } = analysisData;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MCA Memories 2025–2027 Yearbook System';
  workbook.lastModifiedBy = 'Administrator';
  workbook.created = new Date();
  workbook.modified = new Date();

  const exportTimestamp = formatExportDateTime(new Date());

  // Sheet 1: Student Details
  const studentSheet = workbook.addWorksheet('Student Details', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
    properties: { tabColor: { argb: 'FF581C3F' } },
  });

  studentSheet.mergeCells('A1:F1');
  const s1Title = studentSheet.getCell('A1');
  s1Title.value = 'MCA MEMORIES 2025–2027 • STUDENT DETAILS';
  s1Title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  s1Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF581C3F' } };
  s1Title.alignment = { vertical: 'middle', horizontal: 'center' };
  studentSheet.getRow(1).height = 36;

  studentSheet.mergeCells('A2:F2');
  const s1Sub = studentSheet.getCell('A2');
  const minRoll = students.length > 0 ? students[0].roll_number : '—';
  const maxRoll = students.length > 0 ? students[students.length - 1].roll_number : '—';
  s1Sub.value = `Total Registered Students: ${students.length} • Roll Numbers: ${minRoll} to ${maxRoll} • Exported on ${exportTimestamp}`;
  s1Sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
  s1Sub.alignment = { vertical: 'middle', horizontal: 'center' };
  studentSheet.getRow(2).height = 22;

  studentSheet.getRow(4).values = [
    'Roll Number',
    'Student Full Name',
    'Email Address',
    'Account Status',
    'Password Status',
    'Student Profile ID',
  ];

  studentSheet.columns = [
    { key: 'rollNumber', width: 16 },
    { key: 'fullName', width: 30 },
    { key: 'email', width: 32 },
    { key: 'accountStatus', width: 18 },
    { key: 'passwordStatus', width: 24 },
    { key: 'studentId', width: 40 },
  ];

  const s1HeaderRow = studentSheet.getRow(4);
  s1HeaderRow.height = 26;
  s1HeaderRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF732A54' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD99CA5' } },
      bottom: { style: 'medium', color: { argb: 'FF42112D' } },
    };
  });

  students.forEach((student, index) => {
    const row = studentSheet.getRow(5 + index);
    const passStatus = student.password_changed_at || student.must_change_password === false ? 'Changed' : 'Default (Must Change)';
    row.values = [
      student.roll_number,
      student.full_name,
      student.email || `${student.roll_number.toLowerCase()}@mcafarewell.com`,
      student.is_active ? 'ACTIVE' : 'DISABLED',
      passStatus,
      student.id,
    ];
    row.height = 22;
    const isEven = index % 2 === 0;
    const bgColor = isEven ? 'FFFFFFFF' : 'FFFDF8F5';

    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE6D5D8' } },
        right: { style: 'thin', color: { argb: 'FFE6D5D8' } },
        left: { style: 'thin', color: { argb: 'FFE6D5D8' } },
      };
      if (colNumber === 1 || colNumber === 4 || colNumber === 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });
  studentSheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + students.length, column: 6 } };

  // Sheet 2: Question Bank
  const questionSheet = workbook.addWorksheet('Question Bank', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
    properties: { tabColor: { argb: 'FFC59B27' } },
  });

  questionSheet.mergeCells('A1:D1');
  const s2Title = questionSheet.getCell('A1');
  s2Title.value = 'MCA MEMORIES 2025–2027 • QUESTION BANK';
  s2Title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  s2Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8F6A0C' } };
  s2Title.alignment = { vertical: 'middle', horizontal: 'center' };
  questionSheet.getRow(1).height = 36;

  questionSheet.mergeCells('A2:D2');
  const s2Sub = questionSheet.getCell('A2');
  const activeQuestionsCount = questions.filter((q) => q.is_active).length;
  s2Sub.value = `Total Questions: ${questions.length} • Active Questions: ${activeQuestionsCount} • Exported on ${exportTimestamp}`;
  s2Sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
  s2Sub.alignment = { vertical: 'middle', horizontal: 'center' };
  questionSheet.getRow(2).height = 22;

  questionSheet.getRow(4).values = [
    'Question #',
    'Yearbook Memory Question Prompt',
    'Active Status',
    'Question Record ID',
  ];

  questionSheet.columns = [
    { key: 'qNum', width: 14 },
    { key: 'qText', width: 72 },
    { key: 'status', width: 16 },
    { key: 'qId', width: 40 },
  ];

  const s2HeaderRow = questionSheet.getRow(4);
  s2HeaderRow.height = 26;
  s2HeaderRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC59B27' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE5C672' } },
      bottom: { style: 'medium', color: { argb: 'FF8F6A0C' } },
    };
  });

  questions.forEach((q, index) => {
    const row = questionSheet.getRow(5 + index);
    row.values = [
      q.question_number,
      q.question_text,
      q.is_active ? 'ACTIVE' : 'INACTIVE',
      q.id,
    ];
    row.height = 24;
    const isEven = index % 2 === 0;
    const bgColor = isEven ? 'FFFFFFFF' : 'FFFDFBF7';

    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFEEDDC5' } },
        right: { style: 'thin', color: { argb: 'FFEEDDC5' } },
        left: { style: 'thin', color: { argb: 'FFEEDDC5' } },
      };
      if (colNumber === 1 || colNumber === 3) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: colNumber === 2 };
      }
    });
  });
  questionSheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + questions.length, column: 4 } };

  // Sheet 3: Answers - Memory Selections
  const answersSheet = workbook.addWorksheet('Answers - Memory Selections', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
    properties: { tabColor: { argb: 'FF87426A' } },
  });

  answersSheet.mergeCells('A1:H1');
  const s3Title = answersSheet.getCell('A1');
  s3Title.value = 'MCA MEMORIES 2025–2027 • ANSWERS & MEMORY SELECTIONS';
  s3Title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  s3Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF581C3F' } };
  s3Title.alignment = { vertical: 'middle', horizontal: 'center' };
  answersSheet.getRow(1).height = 36;

  answersSheet.mergeCells('A2:H2');
  const s3Sub = answersSheet.getCell('A2');
  s3Sub.value = `Total Recorded Selections: ${answerMemoryRows.length} • Required per student: 59 • Confidential Yearbook Data • Exported on ${exportTimestamp}`;
  s3Sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
  s3Sub.alignment = { vertical: 'middle', horizontal: 'center' };
  answersSheet.getRow(2).height = 22;

  answersSheet.getRow(4).values = [
    'Respondent Roll Number',
    'Respondent Name',
    'Question #',
    'Yearbook Memory Question Prompt',
    'Selected Classmate Roll Number',
    'Selected Classmate Name',
    'Answer Record ID',
    'Answered Timestamp',
  ];

  answersSheet.columns = [
    { key: 'respRoll', width: 22 },
    { key: 'respName', width: 28 },
    { key: 'qNum', width: 14 },
    { key: 'qText', width: 62 },
    { key: 'chosenRoll', width: 24 },
    { key: 'chosenName', width: 28 },
    { key: 'ansId', width: 40 },
    { key: 'timestamp', width: 24 },
  ];

  const s3HeaderRow = answersSheet.getRow(4);
  s3HeaderRow.height = 26;
  s3HeaderRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF87426A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD99CA5' } },
      bottom: { style: 'medium', color: { argb: 'FF42112D' } },
    };
  });

  answerMemoryRows.forEach((rowItem, index) => {
    const row = answersSheet.getRow(5 + index);
    row.values = [
      rowItem.respondentRollNumber,
      rowItem.respondentName,
      rowItem.questionNumber,
      rowItem.questionText,
      rowItem.selectedClassmateRollNumber,
      rowItem.selectedClassmateName,
      rowItem.answerId,
      formatExportDateTime(rowItem.answeredAt),
    ];
    row.height = 22;
    const isEven = index % 2 === 0;
    const bgColor = isEven ? 'FFFFFFFF' : 'FFFDF8F5';

    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE6D5D8' } },
        right: { style: 'thin', color: { argb: 'FFE6D5D8' } },
        left: { style: 'thin', color: { argb: 'FFE6D5D8' } },
      };
      if (colNumber === 1 || colNumber === 3 || colNumber === 5 || colNumber === 8) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: colNumber === 4 };
      }
    });
  });
  answersSheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + answerMemoryRows.length, column: 8 } };

  // Sheet 4: Submission Summary
  const summarySheet = workbook.addWorksheet('Submission Summary', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
    properties: { tabColor: { argb: 'FF4A1525' } },
  });

  summarySheet.mergeCells('A1:G1');
  const s4Title = summarySheet.getCell('A1');
  s4Title.value = 'MCA MEMORIES 2025–2027 • SUBMISSION SUMMARY';
  s4Title.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  s4Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A1525' } };
  s4Title.alignment = { vertical: 'middle', horizontal: 'center' };
  summarySheet.getRow(1).height = 36;

  summarySheet.mergeCells('A2:G2');
  const s4Sub = summarySheet.getCell('A2');
  const submittedCount = submissionSummaryRows.filter((s) => s.submissionStatus === 'SUBMITTED').length;
  s4Sub.value = `Batch of ${submissionSummaryRows.length} Students • ${submittedCount} Completed • ${submissionSummaryRows.length - submittedCount} Pending • 59 Required Answers Denominator • Exported on ${exportTimestamp}`;
  s4Sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } };
  s4Sub.alignment = { vertical: 'middle', horizontal: 'center' };
  summarySheet.getRow(2).height = 22;

  summarySheet.getRow(4).values = [
    'Roll Number',
    'Student Full Name',
    'Actual Valid Answer Count (of 59)',
    'Distinct-Classmate Count',
    'Submission Status',
    'Submission Timestamp',
    'Account Status',
  ];

  summarySheet.columns = [
    { key: 'rollNumber', width: 16 },
    { key: 'fullName', width: 30 },
    { key: 'answerCount', width: 32 },
    { key: 'distinctCount', width: 26 },
    { key: 'status', width: 22 },
    { key: 'submittedAt', width: 26 },
    { key: 'accountStatus', width: 16 },
  ];

  const s4HeaderRow = summarySheet.getRow(4);
  s4HeaderRow.height = 26;
  s4HeaderRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF581C3F' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD99CA5' } },
      bottom: { style: 'medium', color: { argb: 'FF2A0D15' } },
    };
  });

  submissionSummaryRows.forEach((student, index) => {
    const row = summarySheet.getRow(5 + index);
    const formattedTime = student.submittedAt
      ? formatExportDateTime(student.submittedAt)
      : '—';

    row.values = [
      student.rollNumber,
      student.studentName,
      `${student.answeredCount} / 59`,
      student.distinctClassmatesCount,
      student.submissionStatus,
      formattedTime,
      student.accountStatus,
    ];

    row.height = 22;
    const isEven = index % 2 === 0;
    const bgColor = isEven ? 'FFFFFFFF' : 'FFFDF8F5';

    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE6D5D8' } },
        right: { style: 'thin', color: { argb: 'FFE6D5D8' } },
        left: { style: 'thin', color: { argb: 'FFE6D5D8' } },
      };

      if (colNumber === 1 || colNumber === 3 || colNumber === 4 || colNumber === 6 || colNumber === 7) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (student.submissionStatus === 'SUBMITTED') {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1B5E20' } };
        } else if (student.submissionStatus === 'IN PROGRESS') {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB78103' } };
        } else {
          cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF888888' } };
        }
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });
  summarySheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + submissionSummaryRows.length, column: 7 } };

  const testFile = 'scripts/final_export_validation.xlsx';
  await workbook.xlsx.writeFile(testFile);
  console.log(`Saved workbook to ${testFile}`);

  // Re-read and inspect
  const reReadWb = new ExcelJS.Workbook();
  await reReadWb.xlsx.readFile(testFile);

  console.log('\n--- FINAL EXPORT VALIDATION RESULTS ---');
  console.log(`Total sheets: ${reReadWb.worksheets.length}`);
  reReadWb.worksheets.forEach((ws, idx) => {
    console.log(`Sheet ${idx + 1}: "${ws.name}"`);
    console.log(`  - Total Rows: ${ws.rowCount} (Header row: 4, Data rows: ${ws.rowCount - 4})`);
    console.log(`  - Total Columns: ${ws.columnCount}`);
    console.log(`  - Sample Data Row 5:`, ws.getRow(5).values);
  });
}

run().catch(console.error);
