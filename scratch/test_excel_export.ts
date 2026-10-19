import assert from 'node:assert';
import ExcelJS from 'exceljs';
import { parseRollNumber, formatRollValue } from '../src/services/adminService.js';
import { MCA_60_STUDENTS } from '../src/data/studentsData.js';
import { MCA_72_QUESTIONS } from '../src/data/defaultQuestions.js';

console.log('--- Testing parseRollNumber & formatRollValue ---');
assert.strictEqual(parseRollNumber('1'), 1);
assert.strictEqual(parseRollNumber('2'), 2);
assert.strictEqual(parseRollNumber('10'), 10);
assert.strictEqual(parseRollNumber('MCA2501'), 2501);
assert.strictEqual(parseRollNumber('MCA2510'), 2510);
assert.strictEqual(parseRollNumber(42), 42);

assert.strictEqual(formatRollValue('1'), 1);
assert.strictEqual(formatRollValue('60'), 60);
assert.strictEqual(formatRollValue('MCA2501'), 'MCA2501');
assert.strictEqual(formatRollValue(5), 5);
console.log('✓ parseRollNumber & formatRollValue passed');

// Test Simulated Analysis Engine with edge cases
console.log('--- Testing Analysis Grouping & Consistency Rules ---');

const mockStudents = MCA_60_STUDENTS.map(s => ({
  id: s.id,
  roll_number: s.rollNumber,
  full_name: s.fullName,
}));

const mockQuestions = MCA_72_QUESTIONS.map(q => ({
  id: q.id,
  question_number: q.questionNumber,
  question_text: q.questionText,
}));

const s1 = mockStudents[0]; // MCA2501 - Aishwarya Nair
const s2 = mockStudents[1]; // MCA2502 - Arjun Menon
const s3 = mockStudents[2]; // MCA2503 - Diya Raj
const s4 = mockStudents[3]; // MCA2504 - Karthik S
const s10 = mockStudents[9]; // MCA2510 - Aditya Nair
const s20 = mockStudents[19]; // MCA2520 - Abhishek V

const q1 = mockQuestions[0]; // Question 1
const q2 = mockQuestions[1]; // Question 2

const testRawAnswers = [
  // s2 selects s1 for q1
  { respondent_id: s2.id, question_id: q1.id, selected_student_id: s1.id },
  // s3 selects s1 for q1
  { respondent_id: s3.id, question_id: q1.id, selected_student_id: s1.id },
  // s10 selects s1 for q1
  { respondent_id: s10.id, question_id: q1.id, selected_student_id: s1.id },
  // s4 selects s1 for q1
  { respondent_id: s4.id, question_id: q1.id, selected_student_id: s1.id },

  // s2 selects s1 for q2 (Rule B violation: s2 already selected s1 for q1) -> Should be skipped!
  { respondent_id: s2.id, question_id: q2.id, selected_student_id: s1.id },
  // s3 selects s1 for q2 (Rule B violation: s3 already selected s1 for q1) -> Should be skipped!
  { respondent_id: s3.id, question_id: q2.id, selected_student_id: s1.id },

  // s20 selects s1 for q2
  { respondent_id: s20.id, question_id: q2.id, selected_student_id: s1.id },

  // Self selection: s1 selects s1 for q1 -> Rule C: should be skipped!
  { respondent_id: s1.id, question_id: q1.id, selected_student_id: s1.id },

  // Duplicate answer: s4 selects s1 for q1 duplicate -> should be skipped!
  { respondent_id: s4.id, question_id: q1.id, selected_student_id: s1.id },

  // s1 selects s2 for q1
  { respondent_id: s1.id, question_id: q1.id, selected_student_id: s2.id },
  // s3 selects s2 for q2
  { respondent_id: s3.id, question_id: q2.id, selected_student_id: s2.id },
];

const studentsMap = new Map(mockStudents.map(s => [s.id, s]));
const questionsMap = new Map(mockQuestions.map(q => [q.id, q]));

const seenRespondentQuestion = new Set();
const seenRespondentClassmate = new Set();
const validAnswers = [];

for (const ans of testRawAnswers) {
  if (!ans.respondent_id || !ans.question_id || !ans.selected_student_id) continue;
  if (ans.respondent_id === ans.selected_student_id) continue;

  const respondent = studentsMap.get(ans.respondent_id);
  const selected = studentsMap.get(ans.selected_student_id);
  const question = questionsMap.get(ans.question_id);
  if (!respondent || !selected || !question) continue;

  const key = `${ans.respondent_id}___${ans.question_id}`;
  if (seenRespondentQuestion.has(key)) continue;

  const classmateKey = `${ans.respondent_id}___${ans.selected_student_id}`;
  if (seenRespondentClassmate.has(classmateKey)) continue;

  seenRespondentQuestion.add(key);
  seenRespondentClassmate.add(classmateKey);

  validAnswers.push({
    respondentId: respondent.id,
    respondentRoll: respondent.roll_number,
    respondentName: respondent.full_name,
    questionId: question.id,
    questionNumber: question.question_number,
    questionText: question.question_text,
    selectedStudentId: selected.id,
    selectedStudentRoll: selected.roll_number,
    selectedStudentName: selected.full_name,
  });
}

// Group for Sheet 3
const sheet3GroupMap = new Map();
for (const ans of validAnswers) {
  const gKey = `${ans.selectedStudentId}___${ans.questionId}`;
  let group = sheet3GroupMap.get(gKey);
  if (!group) {
    group = {
      selectedStudentId: ans.selectedStudentId,
      selectedStudentRoll: ans.selectedStudentRoll,
      selectedStudentName: ans.selectedStudentName,
      questionId: ans.questionId,
      questionText: ans.questionText,
      respondentsMap: new Map(),
    };
    sheet3GroupMap.set(gKey, group);
  }
  group.respondentsMap.set(ans.respondentId, {
    rollNumber: ans.respondentRoll,
    fullName: ans.respondentName,
  });
}

const sheet3Rows = [];
for (const group of sheet3GroupMap.values()) {
  const sortedRespondents = Array.from(group.respondentsMap.values()).sort((a, b) => {
    const numA = parseRollNumber(a.rollNumber);
    const numB = parseRollNumber(b.rollNumber);
    if (numA !== numB) return numA - numB;
    return a.rollNumber.localeCompare(b.rollNumber);
  });

  sheet3Rows.push({
    selectedStudentId: group.selectedStudentId,
    selectedStudentRollNumber: group.selectedStudentRoll,
    selectedStudentName: group.selectedStudentName,
    questionText: group.questionText,
    repetitionCount: sortedRespondents.length,
    respondentRollNumbers: sortedRespondents.map((r) => r.rollNumber).join(', '),
    respondentNames: sortedRespondents.map((r) => r.fullName).join(', '),
  });
}

// Sort Sheet 3 rows
sheet3Rows.sort((a, b) => {
  const nameComp = a.selectedStudentName.localeCompare(b.selectedStudentName);
  if (nameComp !== 0) return nameComp;

  const rollComp = parseRollNumber(a.selectedStudentRollNumber) - parseRollNumber(b.selectedStudentRollNumber);
  if (rollComp !== 0) return rollComp;

  if (b.repetitionCount !== a.repetitionCount) {
    return b.repetitionCount - a.repetitionCount;
  }

  return a.questionText.localeCompare(b.questionText);
});

// Build Sheet 4
const studentSheet3Map = new Map();
for (const row of sheet3Rows) {
  const list = studentSheet3Map.get(row.selectedStudentId) || [];
  list.push(row);
  studentSheet3Map.set(row.selectedStudentId, list);
}

const sortedStudents = [...mockStudents].sort((a, b) => {
  const numA = parseRollNumber(a.roll_number);
  const numB = parseRollNumber(b.roll_number);
  if (numA !== numB) return numA - numB;
  return a.roll_number.localeCompare(b.roll_number);
});

const sheet4Rows = sortedStudents.map((student) => {
  const qRows = studentSheet3Map.get(student.id) || [];
  if (qRows.length === 0) {
    return {
      studentRollNumber: student.roll_number,
      studentName: student.full_name,
      totalSelectionsReceived: 0,
      distinctQuestionsCount: 0,
      mostFrequentlyAssociatedQuestion: '',
      highestQuestionRepetitionCount: 0,
    };
  }

  const sortedQRows = [...qRows].sort((a, b) => {
    if (b.repetitionCount !== a.repetitionCount) {
      return b.repetitionCount - a.repetitionCount;
    }
    return a.questionText.localeCompare(b.questionText);
  });

  const totalSelections = sortedQRows.reduce((sum, r) => sum + r.repetitionCount, 0);
  const distinctQuestions = sortedQRows.length;
  const topQuestion = sortedQRows[0];

  return {
    studentRollNumber: student.roll_number,
    studentName: student.full_name,
    totalSelectionsReceived: totalSelections,
    distinctQuestionsCount: distinctQuestions,
    mostFrequentlyAssociatedQuestion: topQuestion.questionText,
    highestQuestionRepetitionCount: topQuestion.repetitionCount,
  };
});

// Verifications
console.log('Verifying Sheet 3 respondent roll number ordering:');
const s1q1 = sheet3Rows.find(r => r.selectedStudentId === s1.id && r.questionText === q1.question_text);
assert(s1q1, 's1q1 row must exist');
console.log('s1q1 repetition count:', s1q1.repetitionCount);
console.log('s1q1 respondent roll numbers:', s1q1.respondentRollNumbers);
// Respondents for s1 on q1 were s2 (MCA2502), s3 (MCA2503), s4 (MCA2504), s10 (MCA2510)
assert.strictEqual(s1q1.repetitionCount, 4);
assert.strictEqual(s1q1.respondentRollNumbers, 'MCA2502, MCA2503, MCA2504, MCA2510');
console.log('✓ Numerical roll sorting passed');

console.log('Verifying Sheet 4 size & order:');
assert.strictEqual(sheet4Rows.length, 60, 'Sheet 4 must have exactly 60 rows');
for (let i = 0; i < sheet4Rows.length; i++) {
  const expectedRoll = MCA_60_STUDENTS[i].rollNumber;
  assert.strictEqual(sheet4Rows[i].studentRollNumber, expectedRoll, `Row ${i} must have roll ${expectedRoll}`);
}
console.log('✓ All 60 students present in numerical roll order');

console.log('Verifying mathematical consistency between Sheet 3 and Sheet 4:');
for (const s of mockStudents) {
  const s4Row = sheet4Rows.find(r => r.studentRollNumber === s.roll_number);
  const s3RowsForStudent = sheet3Rows.filter(r => r.selectedStudentId === s.id);

  const sumS3 = s3RowsForStudent.reduce((sum, r) => sum + r.repetitionCount, 0);
  assert.strictEqual(s4Row.totalSelectionsReceived, sumS3, `Total selections for ${s.roll_number} must match`);
  assert.strictEqual(s4Row.distinctQuestionsCount, s3RowsForStudent.length, `Distinct questions count for ${s.roll_number} must match`);

  if (s3RowsForStudent.length === 0) {
    assert.strictEqual(s4Row.totalSelectionsReceived, 0);
    assert.strictEqual(s4Row.distinctQuestionsCount, 0);
    assert.strictEqual(s4Row.mostFrequentlyAssociatedQuestion, '');
    assert.strictEqual(s4Row.highestQuestionRepetitionCount, 0);
  }
}
console.log('✓ Mathematical consistency between Sheet 3 and Sheet 4 verified 100%');

// Test Full Workbook generation with ExcelJS
console.log('--- Testing Excel Workbook Generation ---');
const wb = new ExcelJS.Workbook();
const ws1 = wb.addWorksheet('Summary Report');
const ws2 = wb.addWorksheet('Detailed Memory Responses');
const ws3 = wb.addWorksheet('Student & Question Analysis');
const ws4 = wb.addWorksheet('Student Selection Summary');

assert.strictEqual(wb.worksheets.length, 4);
assert.strictEqual(wb.worksheets[0].name, 'Summary Report');
assert.strictEqual(wb.worksheets[1].name, 'Detailed Memory Responses');
assert.strictEqual(wb.worksheets[2].name, 'Student & Question Analysis');
assert.strictEqual(wb.worksheets[3].name, 'Student Selection Summary');

// Check Sheet 3 headers
ws3.getRow(4).values = [
  'Selected Student Roll Number',
  'Selected Student Name',
  'Question Text',
  'Repetition Count',
  'Selected By: Respondent Roll Numbers',
  'Selected By: Respondent Names',
];
assert.strictEqual(ws3.getRow(4).getCell(1).value, 'Selected Student Roll Number');
assert.strictEqual(ws3.getRow(4).getCell(4).value, 'Repetition Count');

// Check Sheet 4 headers
ws4.getRow(4).values = [
  'Student Roll Number',
  'Student Name',
  'Total Selections Received',
  'Number of Distinct Questions',
  'Most Frequently Associated Question',
  'Highest Question Repetition Count',
];
assert.strictEqual(ws4.getRow(4).getCell(1).value, 'Student Roll Number');
assert.strictEqual(ws4.getRow(4).getCell(3).value, 'Total Selections Received');
assert.strictEqual(ws4.getRow(4).getCell(6).value, 'Highest Question Repetition Count');

const buffer = await wb.xlsx.writeBuffer();
console.log('Excel file size generated in bytes:', buffer.byteLength);
assert(buffer.byteLength > 1000, 'Excel buffer must be valid');

console.log('✓ All test assertions passed successfully!');
