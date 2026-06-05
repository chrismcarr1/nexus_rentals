const FALLBACK_TIME_ZONE = "America/Denver";
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STORED_DATE_ONLY_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T(?:00|12):00:00(?:\.000)?Z$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MS_PER_DAY = 86_400_000;

export const DEFAULT_RENT_DUE_TIME = "09:00";

export type AppDateLike = string | Date | null | undefined;

export function getAppTimeZone() {
  const candidate = process.env.NEXT_PUBLIC_APP_TIME_ZONE || process.env.APP_TIME_ZONE || FALLBACK_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

export function getAppDateTimeParts(date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: getAppTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const second = Number(parts.second);

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateKey: `${year}-${pad2(month)}-${pad2(day)}`,
    monthKey: `${year}-${pad2(month)}`
  };
}

export function getAppDateKey(date: Date = new Date()) {
  return getAppDateTimeParts(date).dateKey;
}

export function getAppMonthKey(date: Date = new Date()) {
  return getAppDateTimeParts(date).monthKey;
}

export function getAppYear(date: Date = new Date()) {
  return getAppDateTimeParts(date).year;
}

export function appDateKeyFromValue(value: AppDateLike) {
  if (!value) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const isStoredDateOnly =
      (value.getUTCHours() === 0 || value.getUTCHours() === 12) &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0;
    if (isStoredDateOnly) {
      return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
    }
    return getAppDateKey(value);
  }

  const raw = String(value).trim();
  if (!raw) return "";
  const match = raw.match(DATE_KEY_PATTERN);
  if (match && (DATE_ONLY_PATTERN.test(raw) || STORED_DATE_ONLY_ISO_PATTERN.test(raw))) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return getAppDateKey(parsed);
}

export function monthKeyFromValue(value: AppDateLike) {
  return appDateKeyFromValue(value).slice(0, 7);
}

export function dateOnlyToUtcNoonIso(value: string) {
  const key = appDateKeyFromValue(value);
  if (!key) return new Date(value).toISOString();
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0)).toISOString();
}

export function toDateInputValue(value: AppDateLike) {
  return appDateKeyFromValue(value);
}

export function formatAppDate(value: AppDateLike) {
  const key = appDateKeyFromValue(value);
  if (!key) return "Not set";
  const { year, month, day } = parseDateKey(key);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatShortAppDate(value: AppDateLike) {
  const key = appDateKeyFromValue(value);
  if (!key) return "Not set";
  const { year, month, day } = parseDateKey(key);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatAppDateTime(value: AppDateLike) {
  if (!value) return "Not set";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: getAppTimeZone()
  }).format(date);
}

export function addDaysToDateKey(value: AppDateLike, days: number) {
  const key = appDateKeyFromValue(value);
  if (!key) return "";
  const { year, month, day } = parseDateKey(key);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0, 0));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function addMonthsToDateKey(value: AppDateLike, months: number) {
  const key = appDateKeyFromValue(value);
  if (!key) return "";
  const { year, month, day } = parseDateKey(key);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  date.setUTCMonth(date.getUTCMonth() + months);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function differenceInAppCalendarDays(later: AppDateLike, earlier: AppDateLike) {
  const laterKey = appDateKeyFromValue(later);
  const earlierKey = appDateKeyFromValue(earlier);
  if (!laterKey || !earlierKey) return 0;
  return dateKeyToDayNumber(laterKey) - dateKeyToDayNumber(earlierKey);
}

export function appDateIsBefore(left: AppDateLike, right: AppDateLike) {
  const leftKey = appDateKeyFromValue(left);
  const rightKey = appDateKeyFromValue(right);
  return Boolean(leftKey && rightKey && leftKey < rightKey);
}

export function appDateIsAfter(left: AppDateLike, right: AppDateLike) {
  const leftKey = appDateKeyFromValue(left);
  const rightKey = appDateKeyFromValue(right);
  return Boolean(leftKey && rightKey && leftKey > rightKey);
}

export function appDateIsOnOrAfter(left: AppDateLike, right: AppDateLike) {
  const leftKey = appDateKeyFromValue(left);
  const rightKey = appDateKeyFromValue(right);
  return Boolean(leftKey && rightKey && leftKey >= rightKey);
}

export function appDateIsOnOrBefore(left: AppDateLike, right: AppDateLike) {
  const leftKey = appDateKeyFromValue(left);
  const rightKey = appDateKeyFromValue(right);
  return Boolean(leftKey && rightKey && leftKey <= rightKey);
}

export function normalizeRentDueTime(value?: string | null) {
  const time = String(value ?? "").trim();
  return TIME_PATTERN.test(time) ? time : DEFAULT_RENT_DUE_TIME;
}

export function isValidRentDueTime(value?: string | null) {
  return TIME_PATTERN.test(String(value ?? "").trim());
}

export function appTimeHasReached(dueTime: string, parts = getAppDateTimeParts()) {
  const [hour, minute] = normalizeRentDueTime(dueTime).split(":").map(Number);
  return parts.hour > hour || (parts.hour === hour && parts.minute >= minute);
}

export function formatRentDueTime(value?: string | null) {
  const [hour, minute] = normalizeRentDueTime(value).split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

function dateKeyToDayNumber(key: string) {
  const { year, month, day } = parseDateKey(key);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
