import postgres = require("postgres");
type studentid = number & { readonly __tag: "studentid" };

export async function getemailstosend(
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
  /* 
CREATE FUNCTION getemailstosend() RETURNS SETOF RECORD AS
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
  return (await pg`SELECT * FROM getemailstosend() AS getemailstosend(uw_id bigint, uw_from text, uw_replyto text, uw_address text, uw_addressee text, uw_subject text, uw_text text, uw_html text, uw_externalid text, uw_filename text, uw_content bytea)`) as any;
}
export async function insertnewemailstatus(
  pg: postgres.Sql<any>,
  args: { uw_emailid: number; version: number; uw_status: string }
): Promise<number | undefined> {
  /* 
CREATE FUNCTION insertnewemailstatus(uw_emailid integer, version integer, uw_status text) RETURNS bigint AS
$$
  INSERT INTO uw_email_statusses 
    (uw_emailid, uw_version, uw_status, uw_stamp, uw_islastversion) 
  VALUES
    (uw_emailid, version, uw_status, CURRENT_TIMESTAMP, TRUE)
  RETURNING uw_emailid;
$$ LANGUAGE sql;
 */
  return (
    (await pg`SELECT * FROM insertnewemailstatus(${args.uw_emailid}, ${args.version}, ${args.uw_status})`) as any
  )[0]?.insertnewemailstatus;
}
export async function getstudent(
  pg: postgres.Sql<any>,
  args: { uw_studentid: studentid }
): Promise<
  | {
      uw_firstname: string;
      uw_lastname: string;
      uw_birthday: date | null;
      emails: {
        id: number;
        email: string;
      }[];
    }
  | undefined
> {
  /* 
CREATE FUNCTION getstudent(uw_studentid studentid) RETURNS RECORD AS
$$
  SELECT s.uw_firstname, s.uw_lastname, s.uw_birthday, COALESCE(emails.emails, ARRAY[]) AS emails
  FROM uw_student_students s
  LEFT JOIN (SELECT em.uw_studentid, array_agg(json_build_object('id', em.uw_id, 'email', em.uw_email)) as emails
                from uw_student_studentemails em
              group by uw_studentid
  ) emails ON s.uw_id = emails.uw_studentid;
  $$ LANGUAGE sql;
 */
  return (
    (await pg`SELECT * FROM getstudent(${args.uw_studentid}) AS getstudent(uw_firstname text, uw_lastname text, uw_birthday date, emails [])`) as any
  )[0];
}
export async function getstudentnestedjoin(
  pg: postgres.Sql<any>,
  args: { uw_studentid: studentid }
): Promise<
  | {
      uw_firstname: string;
      uw_lastname: string;
      emails: {
        id: number;
        email: string;
      }[];
    }
  | undefined
> {
  /* 
CREATE FUNCTION getstudentnestedjoin(uw_studentid studentid) RETURNS RECORD AS
$$
  SELECT
  s.uw_firstname,
  s.uw_lastname,
  (SELECT array_agg(json_build_object('id', em.uw_id, 'email', em.uw_email)) as emails
     from uw_student_studentemails em
    where em.uw_studentid = s.uw_id
    group by uw_studentid) AS emails
  FROM uw_student_students s
$$ LANGUAGE sql;
 */
  return (
    (await pg`SELECT * FROM getstudentnestedjoin(${args.uw_studentid}) AS getstudentnestedjoin(uw_firstname text, uw_lastname text, emails [])`) as any
  )[0];
}
export async function getstudentnestedjoinnojson(
  pg: postgres.Sql<any>,
  args: { uw_studentid: studentid }
): Promise<
  { uw_firstname: string; uw_lastname: string; emails: string[] } | undefined
> {
  /* 
CREATE FUNCTION getstudentnestedjoinnojson(uw_studentid studentid) RETURNS RECORD AS
$$
  SELECT
  s.uw_firstname,
  s.uw_lastname,
  (SELECT array_agg(em.uw_email)
      from uw_student_studentemails em
    where em.uw_studentid = s.uw_id
    group by uw_studentid) AS emails
  FROM uw_student_students s
$$ LANGUAGE sql;
 */
  return (
    (await pg`SELECT * FROM getstudentnestedjoinnojson(${args.uw_studentid}) AS getstudentnestedjoinnojson(uw_firstname text, uw_lastname text, emails text[])`) as any
  )[0];
}
