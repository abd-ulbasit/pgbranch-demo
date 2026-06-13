-- Shipment tracking for orders.
CREATE TABLE shipments (
    id         bigserial PRIMARY KEY,
    order_id   bigint NOT NULL REFERENCES orders(id),
    carrier    text   NOT NULL,
    tracking   text,
    shipped_at timestamptz NOT NULL DEFAULT now()
);
