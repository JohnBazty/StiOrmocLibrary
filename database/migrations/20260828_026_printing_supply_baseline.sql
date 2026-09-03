-- Create the three real paper stock buckets at zero without inventing stock.
INSERT IGNORE INTO `bond_paper_stocks` (`paper_size_dimension`,`remaining_reams`,`low_stock_threshold_reams`,`average_expense_cost`) VALUES
  ('Short',0.00,2.00,0.00),('A4',0.00,2.00,0.00),('Long',0.00,2.00,0.00);
