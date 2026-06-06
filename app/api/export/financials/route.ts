import { requireRoles } from "@/lib/auth";
import { escapeCsvCell } from "@/lib/csv";
import { appDateKeyFromValue, getAppDateKey } from "@/lib/app-time";
import { UserRole } from "@/lib/store";
import { getPortalContext } from "@/services/portal";

type ExportCell = string | number;

type ExportRow = {
  sortDate: string;
  cells: ExportCell[];
};

const headers = [
  "Record Type",
  "Date",
  "Property",
  "Unit",
  "Tenant",
  "Description",
  "Status",
  "Category",
  "Source Amount",
  "Ledger Amount",
  "Balance Due",
  "Paid Date",
  "Vendor",
  "Tags",
  "Record ID"
];

function dateLabel(value?: Date | string | null) {
  return appDateKeyFromValue(value);
}

function buildCsv(rows: ExportCell[][]) {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
}

function escapeXml(value: ExportCell) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index: number) {
  let name = "";
  let cursor = index + 1;

  while (cursor > 0) {
    const remainder = (cursor - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    cursor = Math.floor((cursor - 1) / 26);
  }

  return name;
}

function worksheetCell(value: ExportCell, rowIndex: number, columnIndex: number, header = false) {
  const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
  const numericColumns = new Set([8, 9, 10]);

  if (typeof value === "number") {
    const style = numericColumns.has(columnIndex) ? ' s="2"' : "";
    return `<c r="${reference}"${style}><v>${value}</v></c>`;
  }

  const style = header ? ' s="1"' : "";
  return `<c r="${reference}" t="inlineStr"${style}><is><t>${escapeXml(value)}</t></is></c>`;
}

function worksheetRow(cells: ExportCell[], rowIndex: number, header = false) {
  return `<row r="${rowIndex + 1}">${cells.map((cell, columnIndex) => worksheetCell(cell, rowIndex, columnIndex, header)).join("")}</row>`;
}

function worksheetXml(rows: ExportCell[][]) {
  const columnWidths = [14, 12, 24, 10, 22, 32, 12, 15, 14, 14, 14, 12, 20, 24, 22];
  const allRows = [headers, ...rows];
  const lastRow = allRows.length;
  const lastColumn = columnName(headers.length - 1);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft"/>
    </sheetView>
  </sheetViews>
  <cols>
    ${columnWidths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}
  </cols>
  <sheetData>
    ${allRows.map((row, index) => worksheetRow(row, index, index === 0)).join("")}
  </sheetData>
  <autoFilter ref="A1:${lastColumn}${lastRow}"/>
</worksheet>`;
}

function workbookXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Transactions and Expenses" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

function workbookRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function rootRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="$#,##0.00;[Red]-$#,##0.00"/></numFmts>
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F6B5F"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function corePropertiesXml() {
  const now = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Transactions and Expenses</dc:title>
  <dc:creator>Nexus Rentals</dc:creator>
  <cp:lastModifiedBy>Nexus Rentals</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function appPropertiesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Nexus Rentals</Application>
</Properties>`;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function zipDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = Math.max(date.getFullYear(), 1980) - 1980;

  return {
    time,
    date: (year << 9) | (month << 5) | day
  };
}

function createZip(files: Array<{ path: string; content: string }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  const timestamp = zipDateTime();
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path);
    const content = Buffer.from(file.content, "utf8");
    const checksum = crc32(content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(timestamp.time, 10);
    localHeader.writeUInt16LE(timestamp.date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(timestamp.time, 12);
    centralHeader.writeUInt16LE(timestamp.date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function buildXlsx(rows: ExportCell[][]) {
  return createZip([
    { path: "[Content_Types].xml", content: contentTypesXml() },
    { path: "_rels/.rels", content: rootRelationshipsXml() },
    { path: "docProps/app.xml", content: appPropertiesXml() },
    { path: "docProps/core.xml", content: corePropertiesXml() },
    { path: "xl/workbook.xml", content: workbookXml() },
    { path: "xl/_rels/workbook.xml.rels", content: workbookRelationshipsXml() },
    { path: "xl/styles.xml", content: stylesXml() },
    { path: "xl/worksheets/sheet1.xml", content: worksheetXml(rows) }
  ]);
}

async function getFinancialExportRows(
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    organizationId: string;
  },
  year?: number,
  taxReport = false
) {
  const portal = await getPortalContext(user);

  const paymentRows: ExportRow[] = portal.scope.payments
    .filter((payment) => !taxReport || payment.status === "PAID")
    .filter((payment) => {
      const date = dateLabel(payment.paidDate ?? payment.dueDate);
      return !year || date.startsWith(`${year}-`);
    })
    .map((payment) => {
      const unit = portal.scope.units.find((item) => item.id === payment.unitId);
      const property = unit ? portal.scope.properties.find((item) => item.id === unit.propertyId) : null;
      const lease = payment.leaseId ? portal.scope.leases.find((item) => item.id === payment.leaseId) : null;
      const tenant =
        (payment.tenantId ? portal.scope.tenants.find((item) => item.id === payment.tenantId) : null) ??
        (lease?.tenantIds?.[0] ? portal.scope.tenants.find((item) => item.id === lease.tenantIds[0]) : null) ??
        null;
      const dueDate = dateLabel(payment.dueDate) || "0000-00-00";

      return {
        sortDate: dateLabel(payment.paidDate) || dueDate,
        cells: [
          "Transaction",
          dateLabel(payment.paidDate ?? payment.dueDate),
          property?.name ?? "",
          unit?.unitNumber ?? "",
          tenant ? `${tenant.firstName} ${tenant.lastName}` : "",
          payment.description,
          payment.status,
          payment.categoryTag ?? "",
          payment.amount,
          payment.amount,
          payment.balanceDue,
          dateLabel(payment.paidDate),
          "",
          "",
          payment.id
        ]
      };
    });

  const expenseRows: ExportRow[] = portal.scope.expenses
    .filter((expense) => {
      const date = dateLabel(expense.incurredAt);
      return !year || date.startsWith(`${year}-`);
    })
    .map((expense) => {
      const property = portal.scope.properties.find((item) => item.id === expense.propertyId);
      const unit = expense.unitId ? portal.scope.units.find((item) => item.id === expense.unitId) : null;
      const incurredAt = dateLabel(expense.incurredAt) || "0000-00-00";

      return {
        sortDate: incurredAt,
        cells: [
          "Expense",
          dateLabel(expense.incurredAt),
          property?.name ?? "",
          unit?.unitNumber ?? "",
          "",
          expense.title,
          "",
          expense.category,
          expense.amount,
          -expense.amount,
          "",
          "",
          expense.vendor ?? "",
          expense.tags,
          expense.id
        ]
      };
    });

  return [...paymentRows, ...expenseRows]
    .sort((a, b) => b.sortDate.localeCompare(a.sortDate))
    .map((row) => row.cells);
}

export async function GET(request: Request) {
  const user = await requireRoles([UserRole.ADMIN, UserRole.MANAGER]);
  const searchParams = new URL(request.url).searchParams;
  const format = searchParams.get("format")?.toLowerCase();
  const year = Number(searchParams.get("year"));
  const taxReport = searchParams.get("report") === "tax";
  const rows = await getFinancialExportRows(user, Number.isFinite(year) && year > 0 ? year : undefined, taxReport);
  const filenameDate = getAppDateKey();

  if (format === "excel" || format === "xlsx") {
    return new Response(buildXlsx(rows), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="transactions-and-expenses-${filenameDate}.xlsx"`
      }
    });
  }

  return new Response(buildCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-and-expenses-${filenameDate}.csv"`
    }
  });
}
