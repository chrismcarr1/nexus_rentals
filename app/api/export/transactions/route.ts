import { requireRoles } from "@/lib/auth";
import { buildCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { UserRole } from "@/lib/store";

export async function GET() {
  const user = await requireRoles([UserRole.ADMIN]);
  const payments = await db.payment.findMany({
    where: { unit: { property: { organizationId: user.organizationId } } },
    include: { unit: { include: { property: true } } },
    orderBy: { dueDate: "desc" }
  });

  const rows = [
    ["description", "property", "unit", "status", "amount", "dueDate", "paidDate"],
    ...payments.map((payment) => [
      payment.description,
      payment.unit.property.name,
      payment.unit.unitNumber,
      payment.status,
      String(payment.amount),
      payment.dueDate.toISOString(),
      payment.paidDate?.toISOString() ?? ""
    ])
  ];

  const csv = buildCsv(rows);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="transactions.csv"'
    }
  });
}
