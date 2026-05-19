import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { requireRouteAccess } from "@/lib/auth";

const sections = [
  {
    title: "Pay And Plan",
    tips: [
      "Know the rent due date, grace period, and preferred payment method.",
      "Report payment problems early so the conversation starts before fees stack up.",
      "Keep receipts, confirmations, and important lease messages in one place."
    ]
  },
  {
    title: "Care For The Home",
    tips: [
      "Report leaks, electrical issues, pests, and safety concerns right away.",
      "Use appliances, drains, walls, and flooring in the way the lease expects.",
      "Take move-in and move-out photos so condition is clear."
    ]
  },
  {
    title: "Be Easy To Work With",
    tips: [
      "Give complete details when submitting maintenance requests.",
      "Respond to scheduling messages and keep pets, keys, or access notes clear.",
      "Read notices carefully and ask questions before small issues become disputes."
    ]
  }
];

export default async function RenterGuidePage() {
  await requireRouteAccess("/renter-guide");

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Renter guide"
        title="Tips to being a good renter."
        description="Simple habits that help protect your home, your deposit, and your relationship with property management."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {sections.map((section) => (
          <Card key={section.title} className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">{section.title}</p>
            <div className="mt-5 space-y-3">
              {section.tips.map((tip) => (
                <div key={tip} className="rounded-2xl border border-[var(--line)] bg-white/70 p-4 text-sm leading-6 text-[var(--muted)]">
                  {tip}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
