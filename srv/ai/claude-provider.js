'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are a procurement analyst assistant specialising in 3-way matching of Purchase Orders (POs), Goods Receipts (GRs), and Invoices.

Your job is to assess detected discrepancies and return a structured JSON analysis. You must always return valid JSON in the exact shape below — no markdown fences, no prose outside the object:

{
  "assessment": "<2-4 sentence explanation of what is happening and why it may have occurred>",
  "confidence": <number between 0 and 1>,
  "recommendation": "<1-2 sentence actionable recommendation for the AP or procurement team>"
}

Guidelines:
- If free-text notes on the PO provide context that explains the discrepancy, lower the severity and reflect this in a reduced confidence score for the conflict.
- Be precise, professional, and concise. Avoid generic boilerplate.
- Confidence reflects how certain you are that the conflict is a genuine problem (not an explained exception).`;

function buildUserPrompt({ po, conflicts, notes }) {
  const conflictList = conflicts.join(', ');
  const notesSection = notes && notes.trim()
    ? `\nFree-text notes on the PO: "${notes.trim()}"`
    : '\nFree-text notes on the PO: (none)';

  return `Purchase Order details:
- PO ID: ${po.ID}
- Vendor: ${po.vendor}
- Ordered amount: ${po.amount} ${po.currency}
- Ordered quantity: ${po.orderQuantity}
- Due date: ${po.dueDate}
- Status: ${po.status}
${notesSection}

Detected conflicts: ${conflictList}

Please analyse these conflicts in the context of the PO and any notes, then return your JSON assessment.`;
}

async function analyzeConflict({ po, conflicts, notes }) {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: buildUserPrompt({ po, conflicts, notes }) },
    ],
  });

  const raw = response.content[0]?.text ?? '{}';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned non-JSON response: ${raw.slice(0, 200)}`);
  }

  return {
    assessment: parsed.assessment ?? '',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    recommendation: parsed.recommendation ?? '',
  };
}

module.exports = { analyzeConflict };
