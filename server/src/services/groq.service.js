import 'dotenv/config';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export function groqConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

/** Low-level call to Groq's OpenAI-compatible chat completions endpoint. */
export async function chatCompletion({ messages, tools, tool_choice, response_format, temperature = 0.2 }) {
  if (!groqConfigured()) {
    throw new Error('GROQ_API_KEY is not configured.');
  }
  const resp = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages,
      tools,
      tool_choice,
      response_format,
      temperature,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Groq API error (${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  return data.choices[0].message;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Turns free text into structured search filters. The database remains the
 * source of truth: Groq only ever picks from the *actual* category/service
 * names it's given here — it never invents a category that doesn't exist,
 * and everything it returns is re-validated against the real DB before use.
 */
export async function parseSearchIntent(text, categories) {
  if (!groqConfigured()) {
    return naiveParse(text);
  }

  const categoryList = categories.map((c) => c.name).join(', ');
  const system = `You are Taskora's search interpreter for a local services marketplace.
Given a customer's free-text request, extract structured search filters as JSON.
Only choose a category from this exact list (or null if none clearly fits): ${categoryList}.
Never invent providers, prices, availability, or ratings — you are only extracting search intent.
Respond with strict JSON: { "categoryName": string|null, "keywords": string[], "locationText": string|null, "dayOfWeek": number|null (0=Sunday..6=Saturday), "budgetMax": number|null }`;

  try {
    const message = await chatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
    });
    const parsed = JSON.parse(message.content);
    return {
      categoryName: parsed.categoryName || null,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8) : [],
      locationText: parsed.locationText || null,
      dayOfWeek: Number.isInteger(parsed.dayOfWeek) ? parsed.dayOfWeek : null,
      budgetMax: typeof parsed.budgetMax === 'number' ? parsed.budgetMax : null,
    };
  } catch (err) {
    console.error('Groq search parsing failed, falling back to naive parsing:', err.message);
    return naiveParse(text);
  }
}

/** Keeps search working even without a Groq key: naive keyword + day extraction. */
function naiveParse(text) {
  const lower = text.toLowerCase();
  const dayOfWeek = DAY_NAMES.findIndex((d) => lower.includes(d));
  const stopwords = new Set(['i', 'need', 'someone', 'to', 'a', 'my', 'the', 'for', 'me', 'find', 'who', 'can', 'please', 'and', 'an', 'somebody']);
  const keywords = lower
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !stopwords.has(w) && !DAY_NAMES.includes(w));
  return {
    categoryName: null,
    keywords: keywords.slice(0, 8),
    locationText: null,
    dayOfWeek: dayOfWeek >= 0 ? dayOfWeek : null,
    budgetMax: null,
  };
}
