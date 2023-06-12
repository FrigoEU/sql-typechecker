
import type { Pool } from "pg";
import { Instant, LocalDate, LocalTime, LocalDateTime} from "@js-joda/core";

import {} from "../domains";

export async function getAll(
  pool: Pool
): Promise<{ id: number; name: string | null }[]> {
  const res = await pool.query({
    text: "SELECT id, name FROM testje",
    values: [],
    rowMode: "array",
  });
  const rows = res.rows.map((row) => ({ id: parseInt(row[0]), name: row[1] }));
  return rows;
}
