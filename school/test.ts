import { getstudent, studentid } from "./out";
import { Pool } from "pg";
import { sqlTypecheckerPgTypes } from "../src/types";

const pool = new Pool({
  database: "urwebschool",
  types: sqlTypecheckerPgTypes,
});

const studentid = <studentid>1;

async function go() {
  debugger;
  const res = await getstudent(pool, { uw_studentid: studentid });
  console.log(res);
}

go();
