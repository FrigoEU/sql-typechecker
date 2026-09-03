# SQL-Typechecker

SQL-Typechecker is a CLI tool written in TypeScript, typechecking PostgreSQL files and generating TypeScript type definitions for them.

It reads your SQL DDL statements (CREATE TABLE, etc) on one hand and your SQL functions (CREATE FUNCTION ...) on the other. It then typechecks your SQL functions and generates TypeScript files for them.

`CREATE FUNCTION ... LANGUAGE sql` is used purely as an annotation format: it gives you an explicit, unification-free place to declare parameter and return types. The function itself is never deployed to Postgres as a stored function — for a single-statement body, SQL-Typechecker generates a caller that runs the body directly as a parameterized query (its named parameters rewritten to `$1`, `$2`, ...). This avoids the deployment hazards of stored functions: `CREATE OR REPLACE FUNCTION` changes behavior instantly for every caller, including whichever old app version is still live during a rolling deploy.

`LANGUAGE plpgsql` functions are still typechecked, since they're occasionally worth the real procedural control flow Postgres gives you, but SQL-Typechecker doesn't generate a caller for them (nor for a `LANGUAGE sql` body that isn't exactly one statement) — the emitted TypeScript is a stub with a type error at that spot in the file, message included, so you don't forget to write the caller by hand. Those functions do need to be deployed to the database as real stored functions, so the usual stored-function deploy caveats apply to them.

Design goals:

- Don't rely on PostgreSQL for types. Postgres itself doesn't perform rigorous enough type-checking for our purposes.
- Don't just generate TypeScript types; also type-check SQL statements.
- Support branded types (aka Haskell/Rust newtypes).
- Support JSON output with nested data type parsing.
- Support as much useful PostgreSQL syntax as possible.

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
async function my_function(
  pool: Pool,
  args: {},
): Promise<{ id: number; name: string | null }[]>;
```

The following functions file will _fail_ to typecheck:

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
  args: { customer_ids: types.customer_id[] },
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
>;
```

Note `types.customer_id`, declared as branded type:

```typescript
// types.ts
export type customer_id = number & { readonly __tag: "customer_id" };
```

## Project status

Is this project finished? No, quite a few functions, syntax elements, etc., are not implemented yet. It has some rough edges, and performance can also be significantly improved.

That said, I've been using this library for years in multiple commercial projects, and it works very well within its current limitations.

`plpgsql` support is still partial (a growing subset of statements is handled — see `spec/phase2-plpgsql.md`).

PRs, questions, remarks, and advice are all very welcome!
