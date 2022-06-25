import {
  getstudent,
  getstudentnestedjoin,
  getstudentnestedjoinnojson,
  studentid,
} from "./out";
import { Pool } from "pg";
import { sqlTypecheckerPgTypes } from "../src/types";

const pool = new Pool({
  database: "urwebschool",
  types: sqlTypecheckerPgTypes,
});

const studentid = <studentid>1;

async function go() {
  debugger;
  const res2 = await getstudentnestedjoin(pool, { uw_studentid: studentid });
  const res3 = await getstudentnestedjoinnojson(pool, {
    uw_studentid: studentid,
  });
  console.log(res2);
  console.log(res3);
}

go();
