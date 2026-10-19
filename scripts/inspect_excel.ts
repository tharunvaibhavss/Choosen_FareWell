import ExcelJS from 'exceljs';
import path from 'node:path';

async function inspectExcel() {
  const filePath = path.resolve(process.cwd(), 'student login.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  console.log(`Worksheets in workbook: ${workbook.worksheets.map(w => w.name).join(', ')}`);

  const worksheet = workbook.worksheets[0];
  console.log(`Using worksheet: "${worksheet.name}" (Row count: ${worksheet.rowCount})`);

  let headerRowNumber = -1;
  let rollCol = -1;
  let nameCol = -1;
  let emailCol = -1;
  let passCol = -1;

  worksheet.eachRow((row, rNum) => {
    if (headerRowNumber !== -1) return;
    row.eachCell((cell, cNum) => {
      const val = String(cell.value || '').trim().toLowerCase();
      if (val === 'roll number') {
        headerRowNumber = rNum;
      }
    });
  });

  if (headerRowNumber === -1) {
    console.error('Could not find header row with "Roll Number"');
    process.exit(1);
  }

  const hRow = worksheet.getRow(headerRowNumber);
  hRow.eachCell((cell, cNum) => {
    const val = String(cell.value || '').trim().toLowerCase();
    if (val.includes('roll number')) rollCol = cNum;
    else if (val.includes('full name') || val.includes('name')) nameCol = cNum;
    else if (val.includes('email')) emailCol = cNum;
    else if (val.includes('password')) passCol = cNum;
  });

  console.log(`Found header on row ${headerRowNumber}:`);
  console.log(`  Roll Col: ${rollCol}, Name Col: ${nameCol}, Email Col: ${emailCol}, Pass Col: ${passCol}`);

  interface StudentRow {
    rowNumber: number;
    rollNumber: string;
    fullName: string;
    email: string;
    hasPassword: boolean;
    passwordLength: number;
  }

  const records: StudentRow[] = [];
  const rollSet = new Set<string>();
  const emailSet = new Set<string>();
  const duplicateRolls: string[] = [];
  const duplicateEmails: string[] = [];
  const invalidRows: { row: number; reason: string }[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return; // Skip headers and before

    const rollRaw = row.getCell(rollCol).value;
    const nameRaw = row.getCell(nameCol).value;
    const emailRaw = row.getCell(emailCol).value;
    const passRaw = row.getCell(passCol).value;

    const rollNumber = String(rollRaw?.toString() || '').trim().toUpperCase();
    const fullName = String(nameRaw?.toString() || '').trim().replace(/\s+/g, ' ');

    let email = '';
    if (typeof emailRaw === 'object' && emailRaw !== null) {
      if ('text' in emailRaw) {
        email = String((emailRaw as any).text || '').trim().toLowerCase();
      } else if ('hyperlink' in emailRaw) {
        email = String((emailRaw as any).hyperlink || '').replace(/^mailto:/i, '').trim().toLowerCase();
      } else {
        email = String(emailRaw.toString() || '').trim().toLowerCase();
      }
    } else {
      email = String(emailRaw || '').trim().toLowerCase();
    }

    const password = String(passRaw?.toString() || '').trim();

    if (!rollNumber && !fullName && !email && !password) return;

    if (!rollNumber) invalidRows.push({ row: rowNumber, reason: 'Missing roll number' });
    if (!fullName) invalidRows.push({ row: rowNumber, reason: 'Missing full name' });
    if (!email) invalidRows.push({ row: rowNumber, reason: 'Missing email' });
    if (!password) invalidRows.push({ row: rowNumber, reason: 'Missing password' });

    if (rollNumber) {
      if (rollSet.has(rollNumber)) duplicateRolls.push(rollNumber);
      rollSet.add(rollNumber);
    }

    if (email) {
      if (emailSet.has(email)) duplicateEmails.push(email);
      emailSet.add(email);
    }

    records.push({
      rowNumber,
      rollNumber,
      fullName,
      email,
      hasPassword: Boolean(password),
      passwordLength: password.length,
    });
  });

  console.log(`Total data rows extracted: ${records.length}`);
  console.log(`Unique roll numbers: ${rollSet.size}`);
  console.log(`Unique email addresses: ${emailSet.size}`);
  console.log(`Duplicate roll numbers: ${duplicateRolls.length > 0 ? duplicateRolls.join(', ') : 'None'}`);
  console.log(`Duplicate email addresses: ${duplicateEmails.length > 0 ? duplicateEmails.join(', ') : 'None'}`);
  console.log(`Invalid rows: ${invalidRows.length > 0 ? JSON.stringify(invalidRows) : 'None'}`);

  console.log('\nFirst 5 records:');
  console.log(records.slice(0, 5));

  console.log('\nLast 5 records:');
  console.log(records.slice(-5));
}

inspectExcel().catch(console.error);
