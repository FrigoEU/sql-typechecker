import postgres from "postgres";
export function insertintotestje(
  pg: postgres.Sql<any>,
  args: { id: number; name: string | null }
): Promise<{ id: number }[]> {
  return pg`select insertintotestje(${args.id}, ${args.name})`;
}
export function selectfromtestje(
  pg: postgres.Sql<any>,
  args: {}
): Promise<{ "?": number[] }[]> {
  return pg`select selectfromtestje()`;
}
