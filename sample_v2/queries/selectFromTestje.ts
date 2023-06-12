
import type { Pool } from "pg";
import { Instant, LocalDate, LocalTime, LocalDateTime} from "@js-joda/core";

import {} from "../domains";


/*
Typechecked:
SELECT *
  FROM testje
 WHERE id = my_id
   AND name = ANY(my_names)


Inputs:
[{"name":{"name":"my_id"},"type":{"kind":"unifvar","val":{"kind":"scalar","name":{"name":"real"}}}},{"name":{"name":"my_names"},"type":{"kind":"unifvar","val":{"kind":"array","subtype":"array","typevar":{"kind":"anyscalar"}}}}]

Returns:
{"kind":"record","fields":[{"name":{"name":"id","_location":{"start":24,"end":26}},"type":{"kind":"scalar","name":{"name":"integer","_location":{"start":27,"end":30}}}},{"name":{"name":"name","_location":{"start":43,"end":47}},"type":{"kind":"nullable","typevar":{"kind":"scalar","name":{"name":"text","_location":{"start":48,"end":52}}}}}]}
*/

