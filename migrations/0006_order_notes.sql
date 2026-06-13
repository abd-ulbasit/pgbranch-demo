-- Free-text note on orders (support annotations).
ALTER TABLE orders ADD COLUMN note text;
CREATE INDEX orders_note_idx ON orders (note) WHERE note IS NOT NULL;
