import { DetailSection } from "@/components/detail-section";

export function AdminSection({
  title,
  description,
  actions,
  children,
  className
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <DetailSection title={title} description={description} actions={actions} className={className}>
      {children}
    </DetailSection>
  );
}
