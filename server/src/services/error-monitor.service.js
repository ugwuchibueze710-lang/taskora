import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAgencyItem } from './agency.service.js';
import { chatCompletion, groqConfigured } from './groq.service.js';
import { query } from '../lib/db.js';
import { isAgencyEnabled } from './settings.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.join(__dirname, '..', '..'); // .../server

/**
 * Called from index.js's central error handler for genuine 500s (never for
 * AppError 4xx branches -- those are expected client mistakes, not bugs).
 * Builds a complete, ready-to-paste breakdown for the software engineer
 * (you) up front, with NO Groq call required -- this is deliberately just
 * careful templating so it works reliably regardless of Groq plan/rate
 * limits. The optional "Diagnose with AI" button (diagnoseWithAI below)
 * enriches an existing item with Groq's own read of it, on demand.
 */
export async function captureServerError(err, req) {
  try {
    // Master switch, off by default -- see settings.service.js. This
    // particular capture is free (no Groq call), but it's gated too so the
    // Agency switch is one predictable on/off for the whole system rather
    // than a partial one.
    if (!(await isAgencyEnabled())) return;

    const route = `${req.method} ${req.route?.path || req.path}`;
    const dedupeKey = crypto.createHash('sha256').update(`${route}::${err.message}`).digest('hex');

    const engineerPrompt = buildEngineerPrompt({ err, route, body: req.body, params: req.params, query: req.query });

    await createAgencyItem({
      kind: 'error_diagnosis',
      severity: 'critical',
      title: `Server error: ${err.message.slice(0, 120)}`,
      summary: `Unhandled error on ${route}.`,
      detail: {
        route,
        message: err.message,
        stack: err.stack,
        body: safeJson(req.body),
        params: safeJson(req.params),
        query: safeJson(req.query),
      },
      engineerPrompt,
      dedupeKey,
    });
  } catch (captureErr) {
    // The monitor itself must never be able to take down error handling --
    // worst case here is just "this one error wasn't logged to the Agency
    // tab," which is strictly no worse than before this system existed.
    console.error('error-monitor failed to capture an error:', captureErr.message);
  }
}

function safeJson(v) {
  try {
    const s = JSON.stringify(v);
    return s && s.length > 2000 ? JSON.parse(s.slice(0, 2000)) : v;
  } catch {
    return null;
  }
}

function buildEngineerPrompt({ err, route, body, params, query: q }) {
  return `A production error was captured on Taskora (server/src/index.js's central error handler).

Route: ${route}
Error message: ${err.message}

Stack trace:
${err.stack || '(no stack trace available)'}

Request params: ${JSON.stringify(params || {})}
Request query: ${JSON.stringify(q || {})}
Request body (may be redacted/truncated): ${JSON.stringify(safeJson(body) || {})}

Please find the root cause in the codebase and fix it.`;
}

/**
 * On-demand only (admin clicks "Diagnose with AI" in the Agency tab) --
 * deliberately never called automatically from the capture path above, so
 * an incident that throws the same error repeatedly can't burn through the
 * Groq account's rate limit on its own; occurrence_count just climbs on the
 * one deduped item until a human asks for AI help or resolves it.
 */
export async function diagnoseWithAI(item) {
  if (!groqConfigured()) {
    throw new Error('GROQ_API_KEY is not configured -- AI diagnosis is unavailable.');
  }

  const snippet = readRelevantSnippet(item.detail?.stack);

  const message = await chatCompletion({
    messages: [
      {
        role: 'system',
        content: `You are helping diagnose a production error in Taskora, a Node/Express + Postgres +
React marketplace app. Given an error, its stack trace, and (if available) the
relevant source snippet, write a concise root-cause diagnosis and a suggested
fix. You cannot see the whole codebase, so be explicit about assumptions.
Respond with ONLY a JSON object: {"diagnosis": string, "suggestedFix": string}.`,
      },
      {
        role: 'user',
        content: `Route: ${item.detail?.route}
Error: ${item.detail?.message}
Stack:
${item.detail?.stack || '(none)'}
${snippet ? `\nRelevant source (${snippet.file}, around line ${snippet.line}):\n${snippet.code}` : ''}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const parsed = JSON.parse(message.content);
  const engineerPrompt = `${item.engineer_prompt}

--- AI diagnosis ---
${parsed.diagnosis}

--- AI-suggested fix ---
${parsed.suggestedFix}`;

  await query(
    `UPDATE agency_items SET summary = $2, engineer_prompt = $3 WHERE id = $1`,
    [item.id, parsed.diagnosis.slice(0, 500), engineerPrompt]
  );

  return { diagnosis: parsed.diagnosis, suggestedFix: parsed.suggestedFix, engineerPrompt };
}

// Best-effort only: parses the first stack frame that points inside this
// server's own source (skips node_modules/internal frames), and reads a few
// lines of context around it. Never throws -- a diagnosis without source
// context is still useful, just less precise.
function readRelevantSnippet(stack) {
  if (!stack) return null;
  try {
    const lines = stack.split('\n');
    for (const line of lines) {
      const match = line.match(/\((.*):(\d+):(\d+)\)/) || line.match(/at (.*):(\d+):(\d+)/);
      if (!match) continue;
      const [, filePath, lineNoStr] = match;
      if (!filePath.startsWith(SERVER_ROOT) || filePath.includes('node_modules')) continue;
      const lineNo = Number(lineNoStr);
      const content = fs.readFileSync(filePath, 'utf8').split('\n');
      const start = Math.max(0, lineNo - 8);
      const end = Math.min(content.length, lineNo + 7);
      return {
        file: path.relative(SERVER_ROOT, filePath),
        line: lineNo,
        code: content.slice(start, end).join('\n'),
      };
    }
  } catch {
    return null;
  }
  return null;
}
