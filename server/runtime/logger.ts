export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type LogValue = unknown;
export type LogFields = Readonly<Record<string, LogValue>>;
export type LogRecord = Readonly<{ timestamp: string; level: Exclude<LogLevel, "silent">; service: string; event: string } & Record<string, LogValue>>;
export type LogSink = (record: LogRecord) => void;

const priority: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 50 };

export interface Logger {
  enabled(level: Exclude<LogLevel, "silent">): boolean;
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
  timer(event: string, fields?: LogFields): { end(fields?: LogFields, level?: Exclude<LogLevel, "silent">): void };
}

function clean(fields: LogFields): Record<string, LogValue> {
  return Object.fromEntries(Object.entries(fields).filter((entry) => entry[1] !== undefined));
}

export const jsonConsoleSink: LogSink = (record) => {
  const line = JSON.stringify(record);
  if (record.level === "error") console.error(line);
  else if (record.level === "warn") console.warn(line);
  else if (record.level === "debug") console.debug(line);
  else console.info(line);
};

export function createLogger(options: { level?: LogLevel; service?: string; sink?: LogSink; now?: () => Date; monotonicNow?: () => number; bindings?: LogFields } = {}): Logger {
  const level = options.level ?? "info";
  const service = options.service ?? "dorothy-ann";
  const sink = options.sink ?? jsonConsoleSink;
  const now = options.now ?? (() => new Date());
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const bindings = clean(options.bindings ?? {});
  const enabled = (candidate: Exclude<LogLevel, "silent">) => priority[candidate] >= priority[level];
  const write = (candidate: Exclude<LogLevel, "silent">, event: string, fields: LogFields = {}) => {
    if (!enabled(candidate)) return;
    try { sink({ timestamp: now().toISOString(), level: candidate, service, event, ...bindings, ...clean(fields) }); } catch { /* Logging must never alter application behavior. */ }
  };
  return {
    enabled,
    debug: (event, fields) => write("debug", event, fields),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
    child: (extra) => createLogger({ ...options, level, service, sink, now, monotonicNow, bindings: { ...bindings, ...clean(extra) } }),
    timer: (event, fields = {}) => {
      const started = monotonicNow();
      let ended = false;
      return { end(extra = {}, candidate = "debug") {
        if (ended) return;
        ended = true;
        write(candidate, event, { ...fields, ...extra, elapsed_ms: Math.max(0, Math.round(monotonicNow() - started)) });
      } };
    },
  };
}
