import { requireRoles } from "@/lib/auth";
import { buildCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { UserRole } from "@/lib/store";

export async function GET() {
  const user = await requireRoles([UserRole.ADMIN]);
  const expenses = await db.expense.findMany({
    where: { property: { organizationId: user.organizationId } },
    include: { property: true, unit: true },
    orderBy: { incurredAt: "desc" }
  });

  const rows = [
    ["title", "property", "unit", "category", "amount", "incurredAt", "vendor", "tags"],
    ...expenses.map((expense) => [
      expense.title,
      expense.property.name,
      expense.unit?.unitNumber ?? "",
      expense.category,
      String(expense.amount),
      expense.incurredAt.toISOString(),
      expense.vendor ?? "",
      expense.tags
    ])
  ];

  const csv = buildCsv(rows);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="expenses.csv"'
    }
  });
}
