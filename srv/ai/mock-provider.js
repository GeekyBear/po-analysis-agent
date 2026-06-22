'use strict';

const RESPONSES = {
  AMOUNT_MISMATCH: {
    assessment: 'Invoice amount does not match the purchase order. The discrepancy exceeds the 1% tolerance threshold, indicating a potential billing error or unauthorized change to agreed pricing.',
    confidence: 0.88,
    recommendation: 'Contact the vendor to request a corrected invoice. Do not approve payment until the amount is reconciled with the original PO terms.',
  },
  QUANTITY_MISMATCH: {
    assessment: 'Goods receipt quantity differs from the ordered quantity. This may indicate a partial shipment, a picking error at the warehouse, or a supplier shortage.',
    confidence: 0.91,
    recommendation: 'Verify physical stock count in the warehouse. If partial delivery, confirm whether a follow-up shipment is expected and update the PO accordingly.',
  },
  OVERDUE: {
    assessment: 'Purchase order has passed its due date without being closed or paid. This may indicate a blocked payment, missing invoice, or stalled approval workflow.',
    confidence: 0.95,
    recommendation: 'Escalate to the responsible buyer and AP team. Check whether the invoice has been received and if any approval is pending in the workflow.',
  },
  NO_GOODS_RECEIPT: {
    assessment: 'No goods receipt found for this purchase order. Payment should not be processed without confirming that the goods or services were actually delivered.',
    confidence: 0.97,
    recommendation: 'Place payment on hold. Request confirmation of delivery from the receiving department before proceeding.',
  },
  NO_INVOICE: {
    assessment: 'No invoice has been recorded for this purchase order. Either the vendor has not yet submitted an invoice, or it was received but not entered into the system.',
    confidence: 0.85,
    recommendation: 'Follow up with the vendor to request the invoice. Check whether a paper invoice may have been received but not digitised.',
  },
  CLEAN: {
    assessment: 'All three documents are aligned. Invoice amount matches the PO within tolerance, goods receipt confirms delivery of the correct quantity, and the order is within its payment terms.',
    confidence: 0.99,
    recommendation: 'No action required. This PO is clear for payment processing.',
  },
};

const JITTER = [-0.03, -0.02, -0.01, 0.0, 0.01, 0.02];

function jitter(value) {
  const offset = JITTER[Math.floor(Math.random() * JITTER.length)];
  return Math.min(0.99, Math.max(0.5, value + offset));
}

async function analyzeConflict({ po, conflicts, notes }) {
  // Simulate a small network delay so the mock feels realistic
  await new Promise((resolve) => setTimeout(resolve, 120 + Math.random() * 80));

  // Pick the most severe conflict for the primary response
  const priority = ['NO_GOODS_RECEIPT', 'OVERDUE', 'AMOUNT_MISMATCH', 'QUANTITY_MISMATCH', 'NO_INVOICE', 'CLEAN'];
  const primary = priority.find((c) => conflicts.includes(c)) || 'CLEAN';
  const base = RESPONSES[primary];

  // If free-text notes are present, append a note that the AI considered them
  let assessment = base.assessment;
  if (notes && notes.trim().length > 0) {
    assessment += ` Note: PO contains the following remarks that may be relevant: "${notes.trim()}" — this context has been factored into the confidence score.`;
  }

  return {
    assessment,
    confidence: jitter(base.confidence),
    recommendation: base.recommendation,
  };
}

module.exports = { analyzeConflict };
