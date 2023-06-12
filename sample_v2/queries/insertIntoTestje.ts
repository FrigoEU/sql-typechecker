
import type { Pool } from "pg";
import { Instant, LocalDate, LocalTime, LocalDateTime} from "@js-joda/core";

import {} from "../domains";


/*
Typechecked:
INSERT INTO testje (id, name)
VALUES (id, name)
       RETURNING id;


Inputs:
[{"name":{"name":"id"},"type":{"kind":"unifvar","val":{"kind":"unknown"}}},{"name":{"name":"name"},"type":{"kind":"unifvar","val":{"kind":"unknown"}}}]

Returns:
{"kind":"record","fields":[{"name":{"name":"id"},"type":{"kind":"scalar","name":{"name":"integer","_location":{"start":27,"end":30}}},"expr":{"type":"ref","name":"id","_location":{"start":65,"end":67}}}]}
*/

