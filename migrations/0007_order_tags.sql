-- Order tagging for fulfilment workflows.
CREATE TABLE order_tags (
    order_id bigint NOT NULL REFERENCES orders(id),
    tag      text   NOT NULL,
    PRIMARY KEY (order_id, tag)
);
