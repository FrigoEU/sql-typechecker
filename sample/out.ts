import postgres from "postgres";
export async function insertintotestje(
  pg: postgres.Sql<any>,
  args: { id: number; name: string | null }
): Promise<{ id: number } | undefined> {
  return ((await pg`SELECT * FROM insertintotestje(${args.id}, ${args.name}) AS insertintotestje(id integer)`) as any)[0];
  /* -- ORIGINAL --
CREATE FUNCTION insertintotestje(idinteger, nametext DEFAULT NULL) RETURNS __todo__ AS
$$
  INSERT INTO testje (id, name)
  VALUES (id, name)
  RETURNING id;
$$ LANGUAGE sql;
*/
}
