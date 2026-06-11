"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseDateKey(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function dateKeyFromEvent(event: CalendarEvent): string {
  const raw = event.date ?? "";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatMonthTitle(year: number, month: number) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
}

function formatEventDate(value?: string | null) {
  const parsed = value ? parseDateKey(value) : null;
  if (!parsed) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)));
}

function eventTone(event: CalendarEvent) {
  if (event.status === "LATE" || event.kind === "late-fee") return "late";
  if (event.kind === "deposit") return "deposit";
  if (event.status === "PAID") return "paid";
  return "rent";
}

function eventChipClass(event: CalendarEvent) {
  return `calendar-event calendar-event-${eventTone(event)}`;
}

function eventKindLabel(event: CalendarEvent) {
  if (event.kind === "late-fee") return "Late fee";
  if (event.kind === "deposit") return "Deposit";
  if (event.status === "PAID") return "Paid";
  return "Rent";
}

function badgeTone(status?: string): "default" | "success" | "warning" | "danger" {
  if (status === "PAID") return "success";
  if (status === "LATE") return "danger";
  if (status) return "warning";
  return "default";
}

export function PaymentCalendar({
  events,
  defaultCollapsed = false
}: {
  events: CalendarEvent[];
  defaultCollapsed?: boolean;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = dateKeyFromEvent(event);
      if (!key) continue;
      const existing = grouped.get(key) ?? [];
      existing.push(event);
      grouped.set(key, existing);
    }
    return grouped;
  }, [events]);

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const monthEvents = events.filter((event) => dateKeyFromEvent(event).startsWith(monthKey));
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - firstOfMonth.getUTCDay()));
  const cells = Array.from({ length: 42 }, (_, index) => {
    const value = new Date(gridStart);
    value.setUTCDate(gridStart.getUTCDate() + index);
    const cellYear = value.getUTCFullYear();
    const cellMonth = value.getUTCMonth() + 1;
    const day = value.getUTCDate();
    const key = dateKey(cellYear, cellMonth, day);
    return {
      key,
      day,
      events: eventsByDate.get(key) ?? [],
      isCurrentMonth: cellYear === year && cellMonth === month,
      isToday: cellYear === currentYear && cellMonth === currentMonth && day === currentDay
    };
  });

  function previousMonth() {
    if (month === 1) {
      setYear((value) => value - 1);
      setMonth(12);
    } else {
      setMonth((value) => value - 1);
    }
    setActiveEvent(null);
  }

  function nextMonth() {
    if (month === 12) {
      setYear((value) => value + 1);
      setMonth(1);
    } else {
      setMonth((value) => value + 1);
    }
    setActiveEvent(null);
  }

  function showCurrentMonth() {
    setYear(currentYear);
    setMonth(currentMonth);
    setActiveEvent(null);
  }

  return (
    <Card className="payment-calendar">
      <div className="calendar-card-header">
        <div className="calendar-heading">
          <span className="calendar-heading-icon" aria-hidden="true">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div>
            <h2>Payment Calendar</h2>
            <p>{monthEvents.length} scheduled {monthEvents.length === 1 ? "event" : "events"} in {formatMonthTitle(year, month)}</p>
          </div>
        </div>
        <button
          type="button"
          className="calendar-collapse-button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand payment calendar" : "Collapse payment calendar"}
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {!collapsed ? (
        <div className="calendar-body">
          <div className="calendar-toolbar">
            <div className="calendar-month-navigation">
              <button type="button" onClick={previousMonth} className="calendar-nav-button" aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h3>{formatMonthTitle(year, month)}</h3>
              <button type="button" onClick={nextMonth} className="calendar-nav-button" aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="calendar-toolbar-actions">
              <div className="calendar-legend" aria-label="Calendar event legend">
                <span><i className="calendar-legend-dot calendar-legend-rent" />Rent</span>
                <span><i className="calendar-legend-dot calendar-legend-deposit" />Deposit</span>
                <span><i className="calendar-legend-dot calendar-legend-late" />Late</span>
              </div>
              <button type="button" onClick={showCurrentMonth} className="calendar-today-button">
                Today
              </button>
            </div>
          </div>

          <div className="calendar-scroll">
            <div className="calendar-grid" role="grid" aria-label={formatMonthTitle(year, month)}>
              {dayLabels.map((label) => (
                <div key={label} className="calendar-weekday" role="columnheader">{label}</div>
              ))}

              {cells.map((cell) => (
                <div
                  key={cell.key}
                  className={cn(
                    "calendar-day",
                    !cell.isCurrentMonth && "calendar-day-outside",
                    cell.isToday && "calendar-day-today"
                  )}
                  role="gridcell"
                  aria-label={`${cell.key}, ${cell.events.length} events`}
                >
                  <div className="calendar-day-header">
                    <span className="calendar-day-number">{cell.day}</span>
                    {cell.events.length ? <span className="calendar-day-count">{cell.events.length}</span> : null}
                  </div>
                  <div className="calendar-events">
                    {cell.events.slice(0, 3).map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        className={cn(eventChipClass(event), activeEvent?.id === event.id && "calendar-event-active")}
                        onClick={() => setActiveEvent(activeEvent?.id === event.id ? null : event)}
                        title={event.label}
                      >
                        <span className="calendar-event-dot" aria-hidden="true" />
                        <span className="truncate">{event.label}</span>
                      </button>
                    ))}
                    {cell.events.length > 3 ? (
                      <span className="calendar-more-events">+{cell.events.length - 3} more</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {activeEvent ? (
            <div className={cn("calendar-event-detail", `calendar-event-detail-${eventTone(activeEvent)}`)}>
              <div className="calendar-event-detail-main">
                <div className="calendar-event-detail-labels">
                  <span>{eventKindLabel(activeEvent)}</span>
                  <strong>{activeEvent.label}</strong>
                </div>
                <p>{formatEventDate(activeEvent.date)}</p>
                {activeEvent.note ? <p>{activeEvent.note}</p> : null}
              </div>
              <div className="calendar-event-detail-side">
                {activeEvent.amount != null && activeEvent.amount > 0 ? (
                  <strong>
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(activeEvent.amount)}
                  </strong>
                ) : null}
                {activeEvent.status ? <Badge tone={badgeTone(activeEvent.status)}>{activeEvent.status}</Badge> : null}
                <button type="button" className="calendar-detail-close" onClick={() => setActiveEvent(null)} aria-label="Close event details">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : monthEvents.length === 0 ? (
            <div className="calendar-empty">
              <CalendarDays className="h-5 w-5" />
              <span>No payment events scheduled for this month.</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
