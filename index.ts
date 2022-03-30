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
  console.log(JSON.stringify(resInsert));
  const resInsert2 = await sample.insertintotestjerecord(sqlclient, {
    id: 2,
    name: "ble",
  });
  console.log(JSON.stringify(resInsert2));
  const resSelect = await sample.selectallfromtestje(sqlclient, {});
  console.log(JSON.stringify(resSelect));
}

go()
  .catch((err) => console.error(err))
  .then(() => process.exit());
