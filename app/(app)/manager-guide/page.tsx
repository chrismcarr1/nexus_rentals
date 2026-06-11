import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { requireRouteAccess } from "@/lib/auth";

const sections = [
  {
    title: "Communicate Early",
    tips: [
      "Set clear expectations before problems become urgent.",
      "Acknowledge resident requests quickly, even when the fix will take longer.",
      "Keep notes on calls, inspections, vendors, and decisions."
    ]
  },
  {
    title: "Protect The Asset",
    tips: [
      "Walk properties regularly and document what changed.",
      "Prioritize water, safety, access, and habitability issues first.",
      "Keep photos, invoices, and work order history attached to the right unit."
    ]
  },
  {
    title: "Run A Fair Process",
    tips: [
      "Apply lease rules consistently across residents.",
      "Separate normal wear from chargeable damage with photos and timestamps.",
      "Use calm, specific language when discussing rent, repairs, or move-out costs."
    ]
  }
];

export default async function ManagerGuidePage() {
  await requireRouteAccess("/manager-guide");

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Manager guide"
        title="Manager Guide"
        description="A practical operating checklist for keeping residents informed, properties cared for, and decisions easy to defend."
      />
      <div className="card-grid-3">
        {sections.map((section) => (
          <Card key={section.title} className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">{section.title}</p>
            <div className="mt-5 space-y-3">
              {section.tips.map((tip) => (
                <div key={tip} className="guide-tip">
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
