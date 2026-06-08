import "server-only";

import {
  createId,
  nowIso,
  updateStore,
  type PlatformEvent,
  type PlatformEventType
} from "@/lib/store";

const MAX_PLATFORM_EVENTS = 2_000;

export type PlatformEventInput = Omit<PlatformEvent, "id" | "createdAt"> & {
  type: PlatformEventType;
};

export async function recordPlatformEvent(input: PlatformEventInput) {
  const event: PlatformEvent = {
    id: createId("event"),
    createdAt: nowIso(),
    ...input
  };

  try {
    await updateStore((store) => ({
      ...store,
      platformEvents: [...(store.platformEvents ?? []), event].slice(-MAX_PLATFORM_EVENTS)
    }));
  } catch (error) {
    console.warn("[platform-events] Could not persist operational event", {
      type: input.type,
      category: input.category,
      error: error instanceof Error ? error.message : "Unknown event persistence error"
    });
  }

  return event;
}
