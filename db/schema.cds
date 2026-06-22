namespace po.analysis;

type ConflictType : String enum {
  AMOUNT_MISMATCH;
  QUANTITY_MISMATCH;
  OVERDUE;
  NO_GOODS_RECEIPT;
  NO_INVOICE;
  CLEAN;
}

entity PurchaseOrders {
  key ID            : UUID;
  vendor            : String(100);
  orderQuantity     : Decimal(15, 2);
  amount            : Decimal(15, 2);
  currency          : String(3);
  dueDate           : Date;
  status            : String(20);
  notes             : String(2000);
  createdAt         : Timestamp @cds.on.insert: $now;
}

entity GoodsReceipts {
  key ID              : UUID;
  poID                : Association to PurchaseOrders;
  receivedQuantity    : Decimal(15, 2);
  receivedAmount      : Decimal(15, 2);
  receivedDate        : Date;
  createdAt           : Timestamp @cds.on.insert: $now;
}

entity Invoices {
  key ID              : UUID;
  poID                : Association to PurchaseOrders;
  invoicedAmount      : Decimal(15, 2);
  invoicedDate        : Date;
  status              : String(20);
  createdAt           : Timestamp @cds.on.insert: $now;
}

entity AnalysisResults {
  key ID              : UUID;
  poID                : Association to PurchaseOrders;
  conflictType        : ConflictType;
  aiAssessment        : String(2000);
  confidence          : Decimal(4, 2);
  recommendation      : String(1000);
  reviewedBy          : String(100);
  reviewedAt          : Timestamp;
  createdAt           : Timestamp @cds.on.insert: $now;
}
