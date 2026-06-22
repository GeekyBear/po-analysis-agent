'use strict';

const axios = require('axios');

// SAP AI Core uses OAuth 2.0 client credentials for authentication.
// Token is cached for the duration of its TTL to avoid re-fetching on every request.
let tokenCache = null;

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 30_000) {
    return tokenCache.token;
  }

  const { AICORE_AUTH_URL, AICORE_CLIENT_ID, AICORE_CLIENT_SECRET } = process.env;
  if (!AICORE_AUTH_URL || !AICORE_CLIENT_ID || !AICORE_CLIENT_SECRET) {
    throw new Error('SAP AI Core credentials not configured. Set AICORE_AUTH_URL, AICORE_CLIENT_ID, AICORE_CLIENT_SECRET.');
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: AICORE_CLIENT_ID,
    client_secret: AICORE_CLIENT_SECRET,
  });

  const response = await axios.post(AICORE_AUTH_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  tokenCache = {
    token: response.data.access_token,
    expiresAt: now + response.data.expires_in * 1000,
  };

  return tokenCache.token;
}

const SYSTEM_PROMPT = `You are a procurement analyst assistant specialising in 3-way matching of Purchase Orders, Goods Receipts, and Invoices.

Return only valid JSON in this exact shape:
{
  "assessment": "<2-4 sentence explanation>",
  "confidence": <number 0-1>,
  "recommendation": "<1-2 sentence actionable recommendation>"
}`;

function buildUserPrompt({ po, conflicts, notes }) {
  const notesSection = notes && notes.trim()
    ? `\nFree-text notes: "${notes.trim()}"`
    : '';

  return `PO ${po.ID} | Vendor: ${po.vendor} | Amount: ${po.amount} ${po.currency} | Qty: ${po.orderQuantity} | Due: ${po.dueDate} | Status: ${po.status}${notesSection}\nConflicts: ${conflicts.join(', ')}`;
}

async function analyzeConflict({ po, conflicts, notes }) {
  const { AICORE_BASE_URL, AICORE_RESOURCE_GROUP, AICORE_DEPLOYMENT_ID } = process.env;
  if (!AICORE_BASE_URL || !AICORE_DEPLOYMENT_ID) {
    throw new Error('SAP AI Core endpoint not configured. Set AICORE_BASE_URL and AICORE_DEPLOYMENT_ID.');
  }

  const token = await getAccessToken();
  const resourceGroup = AICORE_RESOURCE_GROUP || 'default';

  const url = `${AICORE_BASE_URL}/v2/inference/deployments/${AICORE_DEPLOYMENT_ID}/chat/completions`;

  const payload = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt({ po, conflicts, notes }) },
    ],
    max_tokens: 512,
    temperature: 0.2,
  };

  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'AI-Resource-Group': resourceGroup,
      'Content-Type': 'application/json',
    },
  });

  const raw = response.data?.choices?.[0]?.message?.content ?? '{}';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`AI Core returned non-JSON response: ${raw.slice(0, 200)}`);
  }

  return {
    assessment: parsed.assessment ?? '',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    recommendation: parsed.recommendation ?? '',
  };
}

module.exports = { analyzeConflict };
