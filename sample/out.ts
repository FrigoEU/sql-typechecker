import postgres from "postgres";
export async function insertintotestje(
  pg: postgres.Sql<any>,
  args: { id: number; name: string | null }
): Promise<{ id: number } | undefined> {
  return ((await pg`SELECT * FROM insertintotestje(${args.id}, ${args.name})`) as any)[0];
  /* -- ORIGINAL --
CREATE FUNCTION insertintotestje(idinteger, nametext DEFAULT NULL) RETURNS __todo__ AS
$$
  INSERT INTO testje (id, name)
  VALUES (id, name)
  RETURNING id;
$$ LANGUAGE sql;
*/
}
export async function insertintotestjerecord(
  pg: postgres.Sql<any>,
  args: { id: number; name: string | null }
): Promise<{ id: number } | undefined> {
  return ((await pg`SELECT * FROM insertintotestjerecord(${args.id}, ${args.name}) AS insertintotestjerecord(id integer)`) as any)[0];
  /* -- ORIGINAL --
CREATE FUNCTION insertintotestjerecord(idinteger, nametext DEFAULT NULL) RETURNS __todo__ AS
$$
  INSERT INTO testje (id, name)
  VALUES (id, name)
  RETURNING id;
  $$ LANGUAGE sql;
*/
}
export async function selectfromtestje(
  pg: postgres.Sql<any>,
  args: {}
): Promise<{ "?": number[] }[]> {
  return (await pg`SELECT * FROM selectfromtestje() AS selectfromtestje( integer[])`) as any;
  /* -- ORIGINAL --
CREATE FUNCTION selectfromtestje() RETURNS SETOF __todo__ AS
$$
  SELECT ARRAY(SELECT id from testje)
$$ LANGUAGE sql;
*/
}
export async function selectallfromtestje(
  pg: postgres.Sql<any>,
  args: {}
): Promise<{ id: number; name: string | null }[]> {
  return (await pg`SELECT * FROM selectallfromtestje() AS selectallfromtestje(id integer, name text)`) as any;
  /* -- ORIGINAL --
CREATE FUNCTION selectallfromtestje() RETURNS SETOF __todo__ AS
$$
  SELECT id, name
  FROM testje
$$ LANGUAGE sql;
*/
}
