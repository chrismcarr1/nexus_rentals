import "server-only";

import { getAppDateKey } from "@/lib/app-time";
import { buildOperationsTimeline } from "@/lib/operations-timeline";
import { getStripeConnectState } from "@/lib/stripe-connect";
import type { User } from "@/lib/store";
import { getPortalContext } from "@/services/portal";

type OperationsUser = User & {
  organization: { name: string };
};

export async function getOperationsTimeline(user: OperationsUser) {
  const portal = await getPortalContext(user);
  const stripe = user.role === "MANAGER" ? getStripeConnectState(user) : null;

  return buildOperationsTimeline({
    organizationId: user.organizationId,
    todayKey: getAppDateKey(),
    properties: portal.scope.properties,
    units: portal.scope.units,
    tenants: portal.scope.tenants,
    leases: portal.scope.leases,
    payments: portal.scope.payments,
    maintenance: portal.scope.maintenance,
    paymentSetup: stripe ? { ready: stripe.ready, detail: stripe.detail } : null
  });
}
