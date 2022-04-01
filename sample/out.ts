import postgres from "postgres";
export async function insertintotestje(
  pg: postgres.Sql<any>,
  args: { id: number; name: string | null }
): Promise<number | null | undefined> {
  /* 
CREATE FUNCTION insertintotestje(id integer, name text DEFAULT NULL) RETURNS integer AS
$$
  INSERT INTO testje (id, name)
  VALUES (id, name)
  RETURNING id;
  $$ LANGUAGE sql;
 */
  return ((await pg`SELECT * FROM insertintotestje(${args.id}, ${args.name})`) as any)[0]
    ?.insertintotestje;
}
export async function selectfromtestje1(
  pg: postgres.Sql<any>,
  args: {}
): Promise<{ id: number; name: string | null } | undefined> {
  /* 
CREATE FUNCTION selectfromtestje1() RETURNS RECORD AS
$$
  SELECT *
  FROM testje
$$ LANGUAGE sql;
 */
  return ((await pg`SELECT * FROM selectfromtestje1() AS selectfromtestje1(id integer, name text)`) as any)[0];
}
export async function selectfromtestje2(
  pg: postgres.Sql<any>,
  args: {}
): Promise<{ id: number; name: string | null }[]> {
  /* 
CREATE FUNCTION selectfromtestje2() RETURNS SETOF RECORD AS
$$
  SELECT *
  FROM testje
$$ LANGUAGE sql;
 */
  return (await pg`SELECT * FROM selectfromtestje2() AS selectfromtestje2(id integer, name text)`) as any;
}
export async function selectfromtestje(
  pg: postgres.Sql<any>,
  args: {}
): Promise<{ "?": number[] }[]> {
  /* 
CREATE FUNCTION selectfromtestje() RETURNS SETOF RECORD AS
$$
  SELECT ARRAY(SELECT id from testje)
$$ LANGUAGE sql;
 */
  return (await pg`SELECT * FROM selectfromtestje() AS selectfromtestje( integer[])`) as any;
}
export async function selectallfromtestje(
  pg: postgres.Sql<any>,
  args: {}
): Promise<{ id: number; name: string | null }[]> {
  /* 
CREATE FUNCTION selectallfromtestje() RETURNS SETOF RECORD AS
$$
  SELECT id, name
  FROM testje
$$ LANGUAGE sql;
 */
  return (await pg`SELECT * FROM selectallfromtestje() AS selectallfromtestje(id integer, name text)`) as any;
}
