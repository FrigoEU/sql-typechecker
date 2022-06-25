
import type { Pool } from "pg";
import { Instant, LocalDate, LocalTime, LocalDateTime} from "@js-joda/core";

export type studentid = number & { readonly __tag: "studentid" };

export async function getemailstosend(
  pool: Pool,
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

  const res = await pool.query({
    text: "SELECT * FROM getemailstosend() AS getemailstosend(uw_id bigint, uw_from text, uw_replyto text, uw_address text, uw_addressee text, uw_subject text, uw_text text, uw_html text, uw_externalid text, uw_filename text, uw_content bytea)",
    values: [],
    rowMode: "array",
  });
  const rows = res.rows.map((row) => ({
    uw_id: row[0],
    uw_from: row[1],
    uw_replyto: row[2],
    uw_address: row[3],
    uw_addressee: row[4],
    uw_subject: row[5],
    uw_text: row[6],
    uw_html: row[7],
    uw_externalid: row[8],
    uw_filename: row[9],
    uw_content: row[10],
  }));
  debugger;
  return rows;
}
export async function insertnewemailstatus(
  pool: Pool,
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

  const res = await pool.query({
    text: "SELECT * FROM insertnewemailstatus($1::integer,$2::integer,$3::text)",
    values: [args.uw_emailid, args.version, args.uw_status],
    rowMode: "array",
  });
  const rows = res.rows.map((row) => undefined);
  debugger;
  return rows[0];
}
export async function getstudent(
  pool: Pool,
  args: { uw_studentid: studentid }
): Promise<
  | {
      uw_firstname: string;
      uw_lastname: string;
      uw_birthday: LocalDate | null;
      emails:
        | {
            id: number;
            email: string;
          }[]
        | null;
    }
  | undefined
> {
  /* 
CREATE FUNCTION getstudent(uw_studentid studentid) RETURNS RECORD AS
$$
  SELECT s.uw_firstname, s.uw_lastname, s.uw_birthday, emails.emails AS emails
  FROM uw_student_students s
  LEFT JOIN (SELECT em.uw_studentid, array_agg(json_build_object('id', em.uw_id, 'email', em.uw_email)) as emails
                from uw_student_studentemails em
              group by uw_studentid
  ) emails ON s.uw_id = emails.uw_studentid;
  $$ LANGUAGE sql;
 */

  const res = await pool.query({
    text: "SELECT * FROM getstudent($1::studentid) AS getstudent(uw_firstname text, uw_lastname text, uw_birthday date, emails json[])",
    values: [args.uw_studentid],
    rowMode: "array",
  });
  const rows = res.rows.map((row) => ({
    uw_firstname: row[0],
    uw_lastname: row[1],
    uw_birthday: row[2] === null ? LocalDate.parse(row[2]) : null,
    emails:
      row[3] === null
        ? row[3].map((el: any) => ({ id: el["id"], email: el["email"] }))
        : null,
  }));
  debugger;
  return rows[0];
}
export async function getstudentnestedjoin(
  pool: Pool,
  args: { uw_studentid: studentid }
): Promise<
  | {
      uw_firstname: string;
      uw_lastname: string;
      emails: {
        id: number;
        email: string;
      }[];
      messages: {
        id: number;
        date: LocalDate;
        time: LocalTime;
        text: string;
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
    group by uw_studentid) AS emails,
  (SELECT array_agg(json_build_object('id', mess.uw_id, 'date', uw_date ,'time', uw_time, 'text', mess.uw_text)) as messages
     from uw_message_messages mess
    where mess.uw_receiverstudentid = s.uw_id
    group by uw_receiverstudentid) AS messages
  FROM uw_student_students s
$$ LANGUAGE sql;
 */

  const res = await pool.query({
    text: "SELECT * FROM getstudentnestedjoin($1::studentid) AS getstudentnestedjoin(uw_firstname text, uw_lastname text, emails json[], messages json[])",
    values: [args.uw_studentid],
    rowMode: "array",
  });
  const rows = res.rows.map((row) => ({
    uw_firstname: row[0],
    uw_lastname: row[1],
    emails: row[2].map((el: any) => ({ id: el["id"], email: el["email"] })),
    messages: row[3].map((el: any) => ({
      id: el["id"],
      date: LocalDate.parse(el["date"]),
      time: LocalTime.parse(el["time"]),
      text: el["text"],
    })),
  }));
  debugger;
  return rows[0];
}
export async function getstudentnestedjoinnojson(
  pool: Pool,
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

  const res = await pool.query({
    text: "SELECT * FROM getstudentnestedjoinnojson($1::studentid) AS getstudentnestedjoinnojson(uw_firstname text, uw_lastname text, emails text[])",
    values: [args.uw_studentid],
    rowMode: "array",
  });
  const rows = res.rows.map((row) => ({
    uw_firstname: row[0],
    uw_lastname: row[1],
    emails: row[2].map((el: any) => el),
  }));
  debugger;
  return rows[0];
}
