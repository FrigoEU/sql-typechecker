-- datamodel.sql
CREATE DOMAIN customer_id AS int8;
CREATE DOMAIN order_id AS int8;

CREATE TABLE customers (
  id customer_id NOT NULL PRIMARY KEY,
  name text
);
CREATE TABLE orders (
  id order_id NOT NULL PRIMARY KEY,
  customer_id customer_id NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  description text
);
