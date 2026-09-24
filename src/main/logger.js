import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

const MAX_LOG_BYTES = 10 * 1024 * 1024;
const LOG_FILE_COUNT = 5;
const SENSITIVE_KEY = /^(api[-_]?key|authorization|password|secret|access[-_]?token|refresh[-_]?token|id[-_]?token)$/i;
const PRIVATE_CONTENT_KEY = /^(audio|prompt|response|systemMessage|text|transcript|transformPrompt|clarityPrompt|userMessage|rawText|rawTranscript|refinedText|output)$/i;

let logStream = null;
let activeLogPath = null;
let includePrivateContent = true;
let captureRendererMessages = true;

export function redactSensitive(value, { includeContent = true } = {}, seen = new WeakSet()) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: value.cause ? redactSensitive(value.cause, { includeContent }, seen) : undefined,
    };
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(item => redactSensitive(item, { includeContent }, seen));
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_KEY.test(key) || (!includeContent && PRIVATE_CONTENT_KEY.test(key))
      ? '[REDACTED]'
      : redactSensitive(item, { includeContent }, seen),
  ]));
}

function renderArgument(value) {
  if (typeof value === 'string') return value;
  return util.inspect(redactSensitive(value, { includeContent: includePrivateContent }), {
    breakLength: Infinity,
    depth: 8,
    maxArrayLength: 200,
    maxStringLength: null,
  });
}

function rotateLogs(logPath) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size < MAX_LOG_BYTES) return;
    fs.rmSync(`${logPath}.${LOG_FILE_COUNT}`, { force: true });
    for (let index = LOG_FILE_COUNT - 1; index >= 1; index -= 1) {
      const source = `${logPath}.${index}`;
      if (fs.existsSync(source)) fs.renameSync(source, `${logPath}.${index + 1}`);
    }
    fs.renameSync(logPath, `${logPath}.1`);
  } catch (err) {
    process.stderr.write(`[logger] Could not rotate logs: ${err.message}\n`);
  }
}

function writeLine(level, source, args) {
  if (!logStream) return;
  const message = args.map(renderArgument).join(' ');
  logStream.write(`${new Date().toISOString()} [${level}] [${source}] ${message}\n`);
}

export function initializeFileLogging(logsDirectory, options = {}) {
  if (logStream) return activeLogPath;
  includePrivateContent = options.includePrivateContent !== false;
  captureRendererMessages = options.captureRendererMessages !== false;
  fs.mkdirSync(logsDirectory, { recursive: true });
  activeLogPath = path.join(logsDirectory, 'voicerefine.log');
  rotateLogs(activeLogPath);
  logStream = fs.createWriteStream(activeLogPath, { flags: 'a' });

  for (const level of ['log', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      writeLine(level.toUpperCase(), 'main', args);
    };
  }

  process.on('uncaughtExceptionMonitor', err => writeLine('ERROR', 'process', ['uncaught exception', err]));
  process.on('unhandledRejection', reason => writeLine('ERROR', 'process', ['unhandled rejection', reason]));
  console.log('[logger] Persistent logging enabled', {
    path: activeLogPath,
    privateContent: includePrivateContent,
    rendererMessages: captureRendererMessages,
  });
  return activeLogPath;
}

export function attachRendererLogging(webContents, source) {
  webContents.on('console-message', (details, ...legacyArguments) => {
    if (!captureRendererMessages) return;
    const [legacyLevel, legacyMessage, legacyLine, legacySourceId] = legacyArguments;
    const level = details?.level ?? legacyLevel;
    const label = typeof level === 'string'
      ? level.toUpperCase()
      : (['VERBOSE', 'INFO', 'WARN', 'ERROR'][level] ?? `LEVEL-${level}`);
    writeLine(label, source, [
      details?.message ?? legacyMessage,
      {
        line: details?.lineNumber ?? legacyLine,
        sourceId: details?.sourceId ?? legacySourceId,
      },
    ]);
  });
}
