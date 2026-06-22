'use strict';

/**
 * Standalone demo script — no CAP server or SAP credentials required.
 * Runs all 10 sample POs through the 3-way match engine and the configured
 * AI provider, then prints a formatted report to stdout.
 *
 * Usage:
 *   AI_PROVIDER=mock node scripts/analyze.js
 *   npm run analyze
 */

require('dotenv').config();

const { runThreeWayMatch } = require('../srv/matching/three-way-match');
const { getAIProvider } = require('../srv/ai/ai-provider');

const POs = require('../test/sample-data/purchase-orders.json');
const GRs = require('../test/sample-data/goods-receipts.json');
const INVs = require('../test/sample-data/invoices.json');

function grs(poId) { return GRs.filter((g) => g.poID === poId); }
function invs(poId) { return INVs.filter((i) => i.poID === poId); }

async function main() {
  const provider = process.env.AI_PROVIDER || 'mock';
  console.log(`\n=== PO Analysis Agent — Sample Run (AI_PROVIDER=${provider}) ===\n`);

  const aiProvider = getAIProvider();
  let totalWithConflicts = 0;

  for (const po of POs) {
    const receipts = grs(po.ID);
    const invoiceList = invs(po.ID);
    const conflicts = runThreeWayMatch(po, receipts, invoiceList);
    const isClean = conflicts.includes('CLEAN');
    if (!isClean) totalWithConflicts++;

    const ai = await aiProvider.analyzeConflict({ po, conflicts, notes: po.notes });
    const confidence = `${(ai.confidence * 100).toFixed(0)}%`;
    const status = isClean ? '✓ CLEAN' : `! ${conflicts.join(', ')}`;

    console.log(`┌─ ${po.ID} | ${po.vendor}`);
    console.log(`│  Status     : ${status}`);
    console.log(`│  Confidence : ${confidence}`);
    console.log(`│  Assessment : ${ai.assessment}`);
    console.log(`└─ Action     : ${ai.recommendation}`);
    console.log('');
  }

  console.log(`=== Complete — ${POs.length} POs analysed, ${totalWithConflicts} with conflicts ===\n`);
}

main().catch((err) => {
  console.error('Analysis failed:', err.message);
  process.exit(1);
});
