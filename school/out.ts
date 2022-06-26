
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
export async function getstudentwithctes(
  pool: Pool,
  args: { uw_studentid: studentid }
): Promise<
  | {
      uw_firstname: string;
      uw_lastname: string;
      uw_birthday: LocalDate | null;
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
  const res = await pool.query({
    text: "SELECT * FROM getstudentwithctes($1::studentid) AS getstudentwithctes(uw_firstname text, uw_lastname text, uw_birthday date, emails json[], messages json[])",
    values: [args.uw_studentid],
    rowMode: "array",
  });
  const rows = res.rows.map((row) => ({
    uw_firstname: row[0],
    uw_lastname: row[1],
    uw_birthday: row[2] === null ? LocalDate.parse(row[2]) : null,
    emails: row[3].map((el: any) => ({ id: el["id"], email: el["email"] })),
    messages: row[4].map((el: any) => ({
      id: el["id"],
      date: LocalDate.parse(el["date"]),
      time: LocalTime.parse(el["time"]),
      text: el["text"],
    })),
  }));
  debugger;
  return rows[0];
}
