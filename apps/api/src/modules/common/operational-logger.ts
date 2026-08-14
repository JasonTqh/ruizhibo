export type OperationalLogLevel = "debug" | "info" | "warn" | "error";

type OperationalLogFields = Record<string, unknown>;

const LOG_LEVEL_PRIORITY: Record<OperationalLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getConfiguredLogLevel(): OperationalLogLevel {
  const value = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return value in LOG_LEVEL_PRIORITY ? (value as OperationalLogLevel) : "info";
}

function normalizeLogValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeLogValue);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, normalizeLogValue(item)])
        .filter(([, item]) => item !== undefined),
    );
  }
  return String(value);
}

export function writeOperationalLog(
  level: OperationalLogLevel,
  event: string,
  fields: OperationalLogFields = {},
) {
  if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[getConfiguredLogLevel()]) {
    return;
  }

  const record = normalizeLogValue({
    timestamp: new Date().toISOString(),
    level,
    service: "ruizhibo-api",
    event,
    ...fields,
  });
  const line = `${JSON.stringify(record)}\n`;

  if (level === "error") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}
