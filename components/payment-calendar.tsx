"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type CalendarEvent = {
  id: string;
  label: string;
  date: string | null | undefined;
  note?: string;
  kind?: string;
  status?: string;
  amount?: number;
  paymentId?: string;
};

function parseDateKey(value: string) {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function dateKeyFromEvent(event: CalendarEvent): string {
  const raw = event.date ?? "";
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

function formatMonthTitle(year: number, month: number) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function firstDayOfWeek(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

function eventChipClass(kind?: string, status?: string) {
  if (status === "LATE") return "cal-chip cal-chip-late";
  if (kind === "deposit") return "cal-chip cal-chip-deposit";
  if (kind === "late-fee") return "cal-chip cal-chip-late";
  return "cal-chip cal-chip-rent";
}

export function PaymentCalendar({
  events,
  defaultCollapsed = false
}: {
  events: CalendarEvent[];
  defaultCollapsed?: boolean;
}) {
  const today = new Date();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [year, setYear] = useState(today.getUTCFullYear());
  const [month, setMonth] = useState(today.getUTCMonth() + 1);
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
    setActiveEvent(null);
  }

  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
    setActiveEvent(null);
  }

  const days = daysInMonth(year, month);
  const startOffset = firstDayOfWeek(year, month);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  const eventsByDay = new Map<number, CalendarEvent[]>();
  for (const event of events) {
    const key = dateKeyFromEvent(event);
    if (!key.startsWith(monthKey)) continue;
    const parsed = parseDateKey(key);
    if (!parsed) continue;
    const d = parsed.day;
    if (!eventsByDay.has(d)) eventsByDay.set(d, []);
    eventsByDay.get(d)!.push(event);
  }

  const todayKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 text-left transition hover:bg-[var(--surface-hover)]"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Payment Calendar</p>
          <p className="mt-0.5 text-sm text-[var(--muted)]">Rent due dates, deposits, and late fees</p>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-[var(--muted)]" /> : <ChevronUp className="h-4 w-4 text-[var(--muted)]" />}
      </button>

      {!collapsed && (
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={prevMonth} className="rounded-md p-1.5 hover:bg-[var(--surface-hover)]" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold">{formatMonthTitle(year, month)}</span>
            <button type="button" onClick={nextMonth} className="rounded-md p-1.5 hover:bg-[var(--surface-hover)]" aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="cal-grid">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d} className="cal-day-label">{d}</div>
            ))}

            {Array.from({ length: startOffset }, (_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {Array.from({ length: days }, (_, i) => {
              const day = i + 1;
              const dayKey = `${monthKey}-${String(day).padStart(2, "0")}`;
              const dayEvents = eventsByDay.get(day) ?? [];
              const isToday = dayKey === todayKey;

              return (
                <div key={day} className={`cal-day ${isToday ? "cal-day-today" : ""}`}>
                  <span className="cal-day-number">{day}</span>
                  <div className="cal-chips">
                    {dayEvents.slice(0, 3).map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        className={eventChipClass(event.kind, event.status)}
                        onClick={() => setActiveEvent(activeEvent?.id === event.id ? null : event)}
                        title={event.label}
                      >
                        <span className="truncate">{event.label}</span>
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] text-[var(--muted)]">+{dayEvents.length - 3} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {activeEvent && (
            <div className="mt-3 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">{activeEvent.label}</p>
                  {activeEvent.note && (
                    <p className="mt-0.5 text-xs text-[var(--muted)]">{activeEvent.note}</p>
                  )}
                  {activeEvent.amount != null && activeEvent.amount > 0 && (
                    <p className="mt-1 text-sm font-semibold text-[var(--brand)]">
                      ${activeEvent.amount.toFixed(2)}
                    </p>
                  )}
                </div>
                {activeEvent.status && (
                  <Badge tone={
                    activeEvent.status === "PAID" ? "success" :
                    activeEvent.status === "LATE" ? "danger" : "warning"
                  }>{activeEvent.status}</Badge>
                )}
              </div>
              <button
                type="button"
                className="mt-2 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                onClick={() => setActiveEvent(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {events.filter((e) => dateKeyFromEvent(e).startsWith(monthKey)).length === 0 && (
            <p className="mt-3 text-center text-xs text-[var(--muted)]">No payment events this month.</p>
          )}
        </div>
      )}
    </Card>
  );
}
