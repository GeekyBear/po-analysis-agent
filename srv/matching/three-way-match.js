'use strict';

const AMOUNT_TOLERANCE_RATIO = 0.01;

function detectAmountMismatch(po, invoice) {
  if (!invoice) return null;
  const diff = Math.abs(po.amount - invoice.invoicedAmount);
  const tolerance = po.amount * AMOUNT_TOLERANCE_RATIO;
  return diff > tolerance ? 'AMOUNT_MISMATCH' : null;
}

function detectQuantityMismatch(po, goodsReceipt) {
  if (!goodsReceipt) return null;
  const diff = Math.abs(po.orderQuantity - goodsReceipt.receivedQuantity);
  // Treat any unit difference as a mismatch
  return diff > 0 ? 'QUANTITY_MISMATCH' : null;
}

function detectOverdue(po) {
  if (!po.dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(po.dueDate);
  const isPastDue = due < today;
  const isUnresolved = !['PAID', 'CLOSED', 'CANCELLED'].includes(po.status);
  return isPastDue && isUnresolved ? 'OVERDUE' : null;
}

function detectMissingDocuments(po, goodsReceipts, invoices) {
  const conflicts = [];
  if (!goodsReceipts || goodsReceipts.length === 0) conflicts.push('NO_GOODS_RECEIPT');
  if (!invoices || invoices.length === 0) conflicts.push('NO_INVOICE');
  return conflicts;
}

/**
 * Runs the full 3-way match for a single PO against its associated documents.
 * Returns an array of ConflictType strings. Returns ['CLEAN'] if no issues found.
 */
function runThreeWayMatch(po, goodsReceipts, invoices) {
  const conflicts = [];

  const missingDocs = detectMissingDocuments(po, goodsReceipts, invoices);
  conflicts.push(...missingDocs);

  // Only check amounts/quantities if documents exist
  const latestInvoice = invoices && invoices.length > 0
    ? invoices.sort((a, b) => new Date(b.invoicedDate) - new Date(a.invoicedDate))[0]
    : null;

  const latestReceipt = goodsReceipts && goodsReceipts.length > 0
    ? goodsReceipts.sort((a, b) => new Date(b.receivedDate) - new Date(a.receivedDate))[0]
    : null;

  const amountConflict = detectAmountMismatch(po, latestInvoice);
  if (amountConflict) conflicts.push(amountConflict);

  const quantityConflict = detectQuantityMismatch(po, latestReceipt);
  if (quantityConflict) conflicts.push(quantityConflict);

  const overdueConflict = detectOverdue(po);
  if (overdueConflict) conflicts.push(overdueConflict);

  return conflicts.length > 0 ? conflicts : ['CLEAN'];
}

module.exports = {
  detectAmountMismatch,
  detectQuantityMismatch,
  detectOverdue,
  detectMissingDocuments,
  runThreeWayMatch,
};
