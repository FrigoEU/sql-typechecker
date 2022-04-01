import * as sample from "./sample/out";
import postgres from "postgres";

const dbSettings = {
  host: process.env.dbhost || "localhost",
  database: process.env.dbname || "sqltypertest",
};

async function go() {
  const sqlclient = postgres(dbSettings);
  const resInsert = await sample.insertintotestje(sqlclient, {
    id: 2,
    name: "ble",
  });
  console.log(resInsert?.toString());
  const resSelect = await sample.selectallfromtestje(sqlclient, {});
  resSelect.map((r) => console.log(r.name + ": " + r.id));
}

go()
  .catch((err) => console.error(err))
  .then(() => process.exit());
