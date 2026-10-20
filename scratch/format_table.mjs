import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('scratch/audit_results.json', 'utf8'));

console.log('| Roll Number | Student Name | Valid Distinct Choices | Recorded Status | Expected Status | Issue |');
console.log('|:---|:---|---:|:---|:---|:---|');

for (const r of data.auditRows) {
  const recStatus = r.submissionStatus ? (r.submissionStatus === 'submitted' ? 'Submitted' : r.submissionStatus) : (r.actualAnswerCount > 0 ? 'Pending (In Progress)' : 'Pending (Not Started)');
  let issueDesc = r.issue;
  if (r.issue === 'None (Valid)') {
    issueDesc = 'None — Valid 59 distinct choices verified in database';
  } else if (r.issue.startsWith('Admin Dashboard truncation bug')) {
    issueDesc = `Admin UI display bug: Database has 59 valid choices, but Admin Dashboard renders ${r.adminDashboardCountWith1000Limit}/59 due to 1,000-row PostgREST query truncation`;
  } else if (r.issue.startsWith('In Progress')) {
    issueDesc = `Questionnaire in progress: ${r.actualAnswerCount}/59 answered (Pending submission)`;
  } else if (r.issue.startsWith('Not Started')) {
    issueDesc = 'Not started (0 answers recorded)';
  } else if (r.issue.startsWith('Has 59 answers but not submitted')) {
    issueDesc = 'All 59 distinct choices selected, but student has not yet clicked Final Submit';
  }

  console.log(`| ${r.rollNumber} | ${r.fullName} | ${r.distinctClassmates} / 59 | ${recStatus} | ${r.expectedStatus} | ${issueDesc} |`);
}
