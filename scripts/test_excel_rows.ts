import ExcelJS from 'exceljs';
import path from 'node:path';

async function testRows() {
  const filePath = path.resolve(process.cwd(), 'student login.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];

  for (let r = 1; r <= 15; r++) {
    const row = worksheet.getRow(r);
    const values: any[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      values.push({ col: colNumber, val: cell.value });
    });
    console.log(`Row ${r} (actualRowNumber=${row.number}, cellCount=${values.length}):`, JSON.stringify(values));
  }
}

testRows().catch(console.error);
