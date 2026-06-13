-- Monthly revenue rollup feature.
CREATE TABLE order_reports (
    id           bigserial PRIMARY KEY,
    month        date   NOT NULL,
    total_cents  bigint NOT NULL DEFAULT 0,
    generated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE orders ADD COLUMN report_id bigint REFERENCES order_reports(id);
