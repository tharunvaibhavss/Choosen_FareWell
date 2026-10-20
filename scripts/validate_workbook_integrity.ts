import ExcelJS from 'exceljs';

async function validate() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('scripts/test_output.xlsx');

  console.log('--- DETAILED WORKBOOK INTEGRITY AUDIT ---');

  // 1. Sheet 1: Student Details
  const s1 = wb.getWorksheet('Student Details')!;
  console.log('\n[Sheet 1: Student Details]');
  console.log('Headers:', s1.getRow(4).values);
  console.log('First student:', s1.getRow(5).values);
  console.log('Last student (row 64):', s1.getRow(64).values);
  console.log('Row 65 (should be empty):', s1.getRow(65).values);

  // Check all rolls are 25MCA001 to 25MCA060
  const s1Rolls: string[] = [];
  for (let r = 5; r <= 64; r++) {
    s1Rolls.push(String(s1.getRow(r).getCell(1).value));
  }
  console.log(`Student roll count: ${s1Rolls.length}, First: ${s1Rolls[0]}, Last: ${s1Rolls[59]}`);
  console.log(`Any duplicate rolls in Sheet 1: ${new Set(s1Rolls).size !== 60}`);

  // 2. Sheet 2: Question Bank
  const s2 = wb.getWorksheet('Question Bank')!;
  console.log('\n[Sheet 2: Question Bank]');
  console.log('Headers:', s2.getRow(4).values);
  console.log('First question (row 5):', s2.getRow(5).values);
  console.log('Last question (row 76):', s2.getRow(76).values);
  console.log('Row 77 (should be empty):', s2.getRow(77).values);

  // Check question numbers 1 to 72
  let qNumCheck = true;
  for (let r = 5; r <= 76; r++) {
    const qNum = s2.getRow(r).getCell(1).value;
    if (qNum !== r - 4) {
      qNumCheck = false;
      console.warn(`Mismatch in question number at row ${r}: got ${qNum}, expected ${r - 4}`);
    }
  }
  console.log(`Question numbers 1 to 72 sequential and complete: ${qNumCheck}`);

  // 3. Sheet 3: Answers - Memory Selections
  const s3 = wb.getWorksheet('Answers - Memory Selections')!;
  console.log('\n[Sheet 3: Answers - Memory Selections]');
  console.log('Headers:', s3.getRow(4).values);
  console.log('First answer (row 5):', s3.getRow(5).values);
  console.log('Last answer (row 1967):', s3.getRow(1967).values);
  console.log('Row 1968 (should be empty):', s3.getRow(1968).values);

  let selfSelectionFound = false;
  let blankCellFound = false;
  const answerIds = new Set<string>();

  for (let r = 5; r <= 1967; r++) {
    const row = s3.getRow(r);
    const respRoll = String(row.getCell(1).value);
    const chosenRoll = String(row.getCell(5).value);
    const ansId = String(row.getCell(7).value);
    const time = String(row.getCell(8).value);

    if (respRoll === chosenRoll) selfSelectionFound = true;
    if (!ansId || !respRoll || !chosenRoll || !time) blankCellFound = true;
    answerIds.add(ansId);
  }
  console.log(`Total answer records: ${1967 - 5 + 1} (Expected: 1963)`);
  console.log(`Unique answer IDs: ${answerIds.size} (Expected: 1963)`);
  console.log(`Any self selections: ${selfSelectionFound}`);
  console.log(`Any blank cells in mandatory fields: ${blankCellFound}`);

  // 4. Sheet 4: Submission Summary
  const s4 = wb.getWorksheet('Submission Summary')!;
  console.log('\n[Sheet 4: Submission Summary]');
  console.log('Headers:', s4.getRow(4).values);
  console.log('First student summary (row 5):', s4.getRow(5).values);
  console.log('Last student summary (row 64):', s4.getRow(64).values);

  let submittedCount = 0;
  let inProgressCount = 0;
  let notStartedCount = 0;

  for (let r = 5; r <= 64; r++) {
    const status = String(s4.getRow(r).getCell(5).value);
    if (status === 'SUBMITTED') submittedCount++;
    else if (status === 'IN PROGRESS') inProgressCount++;
    else if (status === 'NOT STARTED') notStartedCount++;
  }
  console.log(`Submitted: ${submittedCount}, In Progress: ${inProgressCount}, Not Started: ${notStartedCount}`);
  console.log(`Total students in summary: ${submittedCount + inProgressCount + notStartedCount} (Expected: 60)`);
}

validate().catch(console.error);
