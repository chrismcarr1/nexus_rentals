import { PageHeader } from "@/components/page-header";

export function AdminPageHeader({
  title,
  description,
  actions
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <PageHeader
      eyebrow="Nexus platform administration"
      title={title}
      description={description}
      actions={actions}
    />
  );
}
