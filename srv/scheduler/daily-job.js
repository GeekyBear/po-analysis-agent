'use strict';

const cds = require('@sap/cds');

/**
 * Triggers a full PO analysis run.
 * Called by SAP Job Scheduling Service on a daily schedule, or manually via
 * POST /api/po-analysis/runFullAnalysis.
 */
async function runDailyJob() {
  const log = cds.log('daily-job');
  log.info('Daily PO analysis job started');

  try {
    const db = await cds.connect.to('db');
    const { PurchaseOrders } = db.entities('po.analysis');

    const openPOs = await db.run(
      SELECT.from(PurchaseOrders).where({ status: { '!=': 'CLOSED' } })
    );

    log.info(`Found ${openPOs.length} open POs to analyse`);

    let analyzed = 0;
    let conflictsFound = 0;

    for (const po of openPOs) {
      try {
        const result = await analyzeOnePO(db, po);
        analyzed++;
        if (!result.conflicts.includes('CLEAN')) conflictsFound += result.conflicts.length;
      } catch (err) {
        log.error(`Failed to analyse PO ${po.ID}: ${err.message}`);
      }
    }

    log.info(`Daily job complete. Analysed: ${analyzed}, conflicts found: ${conflictsFound}`);
    return { analyzed, conflictsFound };
  } catch (err) {
    log.error('Daily job failed:', err.message);
    throw err;
  }
}

async function analyzeOnePO(db, po) {
  const { GoodsReceipts, Invoices, AnalysisResults } = db.entities('po.analysis');
  const { runThreeWayMatch } = require('../matching/three-way-match');
  const { getAIProvider } = require('../ai/ai-provider');

  const [goodsReceipts, invoices] = await Promise.all([
    db.run(SELECT.from(GoodsReceipts).where({ poID_ID: po.ID })),
    db.run(SELECT.from(Invoices).where({ poID_ID: po.ID })),
  ]);

  const conflicts = runThreeWayMatch(po, goodsReceipts, invoices);

  const aiProvider = getAIProvider();
  const aiResult = await aiProvider.analyzeConflict({
    po,
    conflicts,
    notes: po.notes,
  });

  const resultRows = conflicts.map((conflictType) => ({
    ID: cds.utils.uuid(),
    poID_ID: po.ID,
    conflictType,
    aiAssessment: aiResult.assessment,
    confidence: aiResult.confidence,
    recommendation: aiResult.recommendation,
  }));

  await db.run(DELETE.from(AnalysisResults).where({ poID_ID: po.ID }));
  await db.run(INSERT.into(AnalysisResults).entries(resultRows));

  return { conflicts };
}

module.exports = { runDailyJob, analyzeOnePO };
