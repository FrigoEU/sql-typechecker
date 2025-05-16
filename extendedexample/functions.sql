CREATE FUNCTION get_customers(customer_ids customer_id[]) RETURNS SETOF record AS $$
  SELECT id, name, grouped_orders.grouped_orders
    FROM customers
    LEFT OUTER JOIN (SELECT customer_id, 
                            ARRAY_AGG(JSONB_BUILD_OBJECT(
                              'id', id,
                              'description', description
                            )) AS grouped_orders
                       FROM orders
                      GROUP BY customer_id
                    ) AS grouped_orders
                       ON grouped_orders.customer_id = customers.id
  WHERE customers.id = ANY(customer_ids)
$$ LANGUAGE sql;
