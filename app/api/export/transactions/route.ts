import { requireRoles } from "@/lib/auth";
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

  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="transactions.csv"'
    }
  });
}
