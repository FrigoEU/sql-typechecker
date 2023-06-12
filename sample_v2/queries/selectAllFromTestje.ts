
import type { Pool } from "pg";
import { Instant, LocalDate, LocalTime, LocalDateTime} from "@js-joda/core";

import {} from "../domains";


/*
Typechecked:
SELECT id, name 
  FROM testje


Inputs:
[]

Returns:
{"kind":"record","fields":[{"name":{"name":"id"},"type":{"kind":"scalar","name":{"name":"integer","_location":{"start":27,"end":30}}},"expr":{"type":"ref","name":"id","_location":{"start":7,"end":9}}},{"name":{"name":"name"},"type":{"kind":"nullable","typevar":{"kind":"scalar","name":{"name":"text","_location":{"start":48,"end":52}}}},"expr":{"type":"ref","name":"name","_location":{"start":11,"end":15}}}]}
*/

