using po.analysis as db from '../db/schema';

service POAnalysisService @(path: '/api/po-analysis') {

  entity PurchaseOrders  as projection on db.PurchaseOrders;
  entity GoodsReceipts   as projection on db.GoodsReceipts;
  entity Invoices        as projection on db.Invoices;
  entity AnalysisResults as projection on db.AnalysisResults;

  action triggerAnalysis(poID : UUID)
    returns { message : String; conflicts : Integer };

  action runFullAnalysis()
    returns { message : String; analyzed : Integer; conflicts : Integer };

  action markReviewed(resultID : UUID, reviewedBy : String)
    returns { success : Boolean };
}
