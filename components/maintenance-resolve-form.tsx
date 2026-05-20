import { resolveMaintenanceAction } from "@/lib/maintenance-actions";

import { Button } from "@/components/ui/button";

export function MaintenanceResolveForm({ maintenanceId }: { maintenanceId: string }) {
  return (
    <form action={resolveMaintenanceAction} className="mt-4 flex justify-end">
      <input type="hidden" name="maintenanceId" value={maintenanceId} />
      <Button type="submit" variant="secondary">
        Resolve
      </Button>
    </form>
  );
}
