'use strict';

const cds = require('@sap/cds');
const { runThreeWayMatch } = require('./matching/three-way-match');
const { getAIProvider } = require('./ai/ai-provider');
const { runDailyJob } = require('./scheduler/daily-job');

module.exports = class POAnalysisService extends cds.ApplicationService {

  async init() {
    const { PurchaseOrders, GoodsReceipts, Invoices, AnalysisResults } = this.entities;

    this.on('triggerAnalysis', async (req) => {
      const { poID } = req.data;
      const db = await cds.connect.to('db');

      const po = await db.run(SELECT.one.from(PurchaseOrders).where({ ID: poID }));
      if (!po) return req.error(404, `Purchase Order ${poID} not found`);

      const [goodsReceipts, invoices] = await Promise.all([
        db.run(SELECT.from(GoodsReceipts).where({ poID_ID: poID })),
        db.run(SELECT.from(Invoices).where({ poID_ID: poID })),
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
        poID_ID: poID,
        conflictType,
        aiAssessment: aiResult.assessment,
        confidence: aiResult.confidence,
        recommendation: aiResult.recommendation,
      }));

      await db.run(INSERT.into(AnalysisResults).entries(resultRows));

      return {
        message: `Analysis complete for PO ${poID}. Conflicts: ${conflicts.join(', ')}`,
        conflicts: conflicts.filter((c) => c !== 'CLEAN').length,
      };
    });

    this.on('runFullAnalysis', async (req) => {
      const { analyzed, conflictsFound } = await runDailyJob();
      return {
        message: `Full analysis complete. Analysed ${analyzed} POs, found ${conflictsFound} conflict(s).`,
        analyzed,
        conflicts: conflictsFound,
      };
    });

    this.on('markReviewed', async (req) => {
      const { resultID, reviewedBy } = req.data;
      const db = await cds.connect.to('db');

      const result = await db.run(SELECT.one.from(AnalysisResults).where({ ID: resultID }));
      if (!result) return req.error(404, `Analysis result ${resultID} not found`);

      await db.run(
        UPDATE(AnalysisResults)
          .set({ reviewedBy, reviewedAt: new Date().toISOString() })
          .where({ ID: resultID })
      );

      return { success: true };
    });

    return super.init();
  }
};
