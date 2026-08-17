const CHINA_OFFSET_MILLISECONDS = 8 * 60 * 60 * 1000;

export const BUSINESS_TIME_ZONE = "Asia/Shanghai";

export function chinaBusinessDate(instant = new Date()) {
  const local = new Date(instant.getTime() + CHINA_OFFSET_MILLISECONDS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
}

export function businessDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function parseBusinessDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return businessDateKey(date) === value ? date : null;
}

export function chinaDayInstantRange(serviceDate: Date) {
  const start = new Date(
    serviceDate.getTime() - CHINA_OFFSET_MILLISECONDS,
  );
  return {
    gte: start,
    lt: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
}
