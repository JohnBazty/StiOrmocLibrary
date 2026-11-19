-- Preserve current size rates until staff explicitly loads a paper brand.
ALTER TABLE paper_brand_stocks
  ADD COLUMN monochrome_price numeric(10,2) CHECK (monochrome_price > 0),
  ADD COLUMN colored_price numeric(10,2) CHECK (colored_price > 0),
  ADD CONSTRAINT paper_brand_size_identity UNIQUE(paper_stock_id,paper_brand_stock_id);
UPDATE paper_brand_stocks b SET
  monochrome_price=(SELECT r.price_per_page FROM print_pricing_rules r JOIN bond_paper_stocks p ON p.paper_size_dimension=r.paper_size WHERE p.paper_stock_id=b.paper_stock_id AND r.print_type='Monochrome'),
  colored_price=(SELECT r.price_per_page FROM print_pricing_rules r JOIN bond_paper_stocks p ON p.paper_size_dimension=r.paper_size WHERE p.paper_stock_id=b.paper_stock_id AND r.print_type='Colored');
ALTER TABLE bond_paper_stocks ADD COLUMN loaded_paper_brand_stock_id bigint;
ALTER TABLE bond_paper_stocks ADD CONSTRAINT loaded_paper_brand_matches_size
  FOREIGN KEY(paper_stock_id,loaded_paper_brand_stock_id)
  REFERENCES paper_brand_stocks(paper_stock_id,paper_brand_stock_id);
ALTER TABLE print_requests
  ADD COLUMN paper_brand_stock_id bigint REFERENCES paper_brand_stocks(paper_brand_stock_id),
  ADD COLUMN paper_brand_snapshot text,
  ADD COLUMN unit_price_snapshot numeric(10,2) CHECK (unit_price_snapshot > 0);
