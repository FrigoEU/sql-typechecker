import postgres from "postgres";
export function getemailstosend(
  pg: postgres.Sql<any>,
  args: {}
): Promise<
  {
    uw_id: number;
    uw_from: string;
    uw_replyto: string | null;
    uw_address: string;
    uw_addressee: string;
    uw_subject: string;
    uw_text: string;
    uw_html: string | null;
    uw_externalid: string;
    uw_filename: string | null;
    uw_content: Buffer | null;
  }[]
> {
  return pg`select getemailstosend()`;
  /*
CREATE FUNCTION getemailstosend() RETURNS SETOF __todo__ AS
$$
  SELECT 
  e.uw_id, 
  e.uw_from, 
  e.uw_replyto, 
  e.uw_address, 
  e.uw_addressee, 
  e.uw_subject, 
  e.uw_text, 
  e.uw_html, 
  e.uw_externalid, 
  a.uw_filename, 
  a.uw_content 
  FROM uw_email_emails e 
  JOIN uw_email_statusses s ON e.uw_id = s.uw_emailid AND s.uw_islastversion = TRUE 
  LEFT OUTER JOIN uw_email_attachments a ON a.uw_emailid = e.uw_id 
  WHERE s.uw_status = 'Waiting/_' 
  AND e.uw_html IS NOT NULL -- NULL = ARCHIVED
$$ LANGUAGE sql;
*/
}
export function insertnewemailstatus(
  pg: postgres.Sql<any>,
  args: { uw_emailid: number; version: number; uw_status: string }
): Promise<{ uw_emailid: number }[]> {
  return pg`select insertnewemailstatus(${args.uw_emailid}, ${args.version}, ${args.uw_status})`;
  /*
CREATE FUNCTION insertnewemailstatus(uw_emailidinteger, versioninteger, uw_statustext) RETURNS SETOF __todo__ AS
$$
  INSERT INTO uw_email_statusses 
    (uw_emailid, uw_version, uw_status, uw_stamp, uw_islastversion) 
  VALUES
    (uw_emailid, version, uw_status, CURRENT_TIMESTAMP, TRUE)
  RETURNING uw_emailid;
$$ LANGUAGE sql;
*/
}
