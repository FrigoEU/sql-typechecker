import * as sample from "./sample/sample1";
import * as sample2 from "./sample/nested/sample2";
import { Pool } from "pg";

const dbSettings = {
  host: process.env.dbhost || "localhost",
  database: process.env.dbname || "sqltypertest",
};

async function go() {
  const sqlclient = new Pool(dbSettings);
  const resInsert = await sample2.insertintotestje(sqlclient, {
    id: 2,
    name: "ble",
  });
  // console.log(resInsert?.toString());
  const resSelect = await sample.selectallfromtestje(sqlclient, {});
  resSelect.map((r) => console.log(r.name + ": " + r.id));
}

go()
  .catch((err) => console.error(err))
  .then(() => process.exit());
