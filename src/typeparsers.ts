import { types } from "pg";
import { TypeId } from "pg-types";
import range from "postgres-range";

// We basically disable most parsing by 'pg', so we can do the parsing
// ourselves in the generated code
export function registerSqlTypecheckerTypeParsers() {
  // "date" format: 2020-10-28
  types.setTypeParser(types.builtins.DATE, (v) => v);

  // "time" format: 17:30:00
  types.setTypeParser(types.builtins.TIME, (v) => v);

  // "timestamp without time zone" 2020-09-22T15:09:09.145
  types.setTypeParser(types.builtins.TIMESTAMP, (v) => v);

  // "timestamp with time zone" 2022-06-23T15:52:39.77314+00:00
  types.setTypeParser(types.builtins.TIMESTAMPTZ, (v) => v);

  // types.builtins.MONEY -> parsed by currency.js
  types.setTypeParser(types.builtins.MONEY, (v) => v);

  // https://www.npmjs.com/package/postgres-range
  // Range includes Included/Excluded bounds specification!
  types.setTypeParser(3908 as TypeId, range.parse); // tsrange
  types.setTypeParser(3910 as TypeId, range.parse); // tstzrange
  types.setTypeParser(3912 as TypeId, range.parse); // daterange

  types.setTypeParser(1115 as TypeId, (v) => v); // timestamp without time zone[]
  types.setTypeParser(1182 as TypeId, (v) => v); // date[]
  types.setTypeParser(1185 as TypeId, (v) => v); // timestamp with time zone[]

  types.setTypeParser(1183 as TypeId, (v) => v); // time[]
  types.setTypeParser(1270 as TypeId, (v) => v); // timetz[]

  types.setTypeParser(1000 as TypeId, (v) => v); // bool array
  types.setTypeParser(1005 as TypeId, (v) => v); // array int2
  types.setTypeParser(1007 as TypeId, (v) => v); // array int4
  types.setTypeParser(1016 as TypeId, (v) => v); // array int8
  types.setTypeParser(1021 as TypeId, (v) => v); // array float4
  types.setTypeParser(1022 as TypeId, (v) => v); // array float8
  types.setTypeParser(1231 as TypeId, (v) => v); // array numeric
  types.setTypeParser(1014 as TypeId, (v) => v); // array char
  types.setTypeParser(1015 as TypeId, (v) => v); //array varchar
  types.setTypeParser(1008 as TypeId, (v) => v); // array string?
  types.setTypeParser(1009 as TypeId, (v) => v); // array string?

  types.setTypeParser(types.builtins.JSON, (v) => v);
  types.setTypeParser(types.builtins.JSONB, (v) => v);

  return types;
}
