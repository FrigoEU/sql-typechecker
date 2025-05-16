# SQL-Typechecker
SQL-Typechecker is a CLI tool written in TypeScript for working with PostgreSQL in Typescript.

It reads your SQL DDL statements (CREATE TABLE, etc) on one hand and your SQL functions (CREATE FUNCTION ...) on the other. It then typechecks your SQL functions and generates TypeScript files for them.

Design goals:

* Don't rely on PostgreSQL for types. Postgres itself doesn't perform rigorous enough type-checking for our purposes.
* Don't just generate TypeScript types; also type-check SQL statements.
* Support branded types (aka Haskell/Rust newtypes).
* Support JSON output with nested data type parsing.
* Support as much useful PostgreSQL syntax as possible.

## Small example
Consider the following DDL file:
```sql
-- sql/datamodel.sql
CREATE TABLE my_table (
  id int8 NOT NULL PRIMARY KEY,
  name text
);
```

And the following functions file:
```sql
-- sql/functions.sql
CREATE FUNCTION my_function() RETURNS SETOF record AS $$
  SELECT id, name 
    FROM my_table
$$ LANGUAGE sql;
```

Running SQL-Typechecker as follows:
```shell
> sql-typechecker --dir ./sql --out ./sql
```

Will generate a TypeScript function with the following type:
```typescript
async function my_function(pool: Pool, args: {}): Promise<{ id: number; name: string | null }[]>
```

The following functions file will *fail* to typecheck:
```sql
-- functions.sql
CREATE FUNCTION my_function() RETURNS SETOF record AS $$
  SELECT id, name 
    FROM my_table
   WHERE name = 2 --> type error
$$ LANGUAGE sql;
```

## Extended example

Consider the following DDL file:
```sql
-- sql/datamodel.sql
CREATE DOMAIN customer_id AS int8;
CREATE DOMAIN order_id AS int8;

CREATE TABLE customers (
  id customer_id NOT NULL PRIMARY KEY,
  name text
);
CREATE TABLE orders (
  id order_id NOT NULL PRIMARY KEY,
  customer_id customer_id NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  description text,
);
```

And the following functions file:
```sql
-- sql/functions.sql
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
```

Running SQL-Typechecker as follows:
```shell
> sql-typechecker --dir ./extendedexample --out ./extendedexample/out
```

Will generate a TypeScript function with the following type:
```typescript
async function get_customers(
  pool: Pool,
  args: { customer_ids: types.customer_id[] }
): Promise<
  {
    id: types.customer_id;
    name: string | null;
    grouped_orders:
      | {
          id: types.order_id;
          description: string | null;
        }[]
      | null;
  }[]
>
```

Note `types.customer_id`, declared as branded type:
```typescript
// types.ts
export type customer_id = number & { readonly __tag: "customer_id" };
```;

## Project status
Is this project finished? No, quite a few functions, syntax elements, etc., are not implemented yet. It has some rough edges, and performance can also be significantly improved.

That said, I've been using this library for years in multiple commercial projects, and it works very well within its current limitations.

In the future, I would love to add support for `plpgsql`. The biggest blocking factor is the lack of support in the parsing library SQL-Typechecker is built upon.

PRs, questions, remarks, and advice are all very welcome!
