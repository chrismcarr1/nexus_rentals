import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const user = await requireUser();
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

  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="expenses.csv"'
    }
  });
}
