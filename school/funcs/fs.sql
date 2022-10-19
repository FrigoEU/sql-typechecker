
CREATE OR REPLACE FUNCTION getMaxStudentId() RETURNS int AS $$

  SELECT MAX(s.uw_id) as max_id
  FROM uw_student_students s

$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION getStudentNestedJoin(uw_studentid studentid) RETURNS RECORD AS $$

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


CREATE OR REPLACE FUNCTION getStudentNestedJoinNoJson(uw_studentid studentid) RETURNS RECORD AS $$
  SELECT
  s.uw_firstname,
  s.uw_lastname,
  (SELECT array_agg(em.uw_email)
      from uw_student_studentemails em
    where em.uw_studentid = s.uw_id
    group by uw_studentid) AS emails
  FROM uw_student_students s
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION getStudentWithCtes(uw_studentid studentid) RETURNS RECORD AS $$

  WITH emails AS (SELECT uw_studentid,
                         array_agg(
                           json_build_object('id', uw_id,
                                             'email', uw_email))
                    FROM uw_student_studentemails
                   GROUP BY uw_studentid
  ),
  messages AS (SELECT uw_receiverstudentid,
                      array_agg(
                        json_build_object('id', uw_id,
                                          'date', uw_date,
                                          'time', uw_time,
                                          'text', uw_text))
                 FROM uw_message_messages
                GROUP BY uw_receiverstudentid)
  SELECT
    s.uw_firstname, s.uw_lastname, s.uw_birthday,
    COALESCE(emails.array_agg, '{}') AS emails,
    COALESCE(messages.array_agg, '{}') AS messages
  FROM uw_student_students s
  LEFT JOIN emails ON s.uw_id = emails.uw_studentid
  LEFT JOIN messages ON s.uw_id = messages.uw_receiverstudentid
  WHERE s.uw_id = uw_studentid ;

$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION getSyncedUnpaidInvoices() RETURNS SETOF RECORD AS $$
  WITH
  total_lines_per_invoice AS
  (SELECT uw_invoiceid, SUM(uw_amount) as uw_amount
     FROM uw_lesson_finance_invoicelines
    GROUP by uw_invoiceid
  ),
  total_credited_per_invoice AS
  (SELECT uw_invoiceid, SUM(uw_amount) as uw_amount
     FROM uw_lesson_finance_creditnotes
    GROUP by uw_invoiceid
  ),
  total_paid_per_invoice AS
  (SELECT uw_invoiceid, SUM(uw_amount) as uw_amount
     FROM uw_lesson_finance_payments
    GROUP by uw_invoiceid
  )
  SELECT inv.uw_id, inv.uw_accountingsoftwareidentifier
  FROM uw_lesson_finance_invoices inv
  JOIN total_lines_per_invoice AS lines ON inv.uw_id = lines.uw_invoiceid
  LEFT OUTER JOIN total_credited_per_invoice AS credited ON inv.uw_id = credited.uw_invoiceid
  LEFT OUTER JOIN total_paid_per_invoice AS paid ON inv.uw_id = paid.uw_invoiceid
  WHERE uw_accountingsoftwareidentifier IS NOT NULL
  AND lines.uw_amount - COALESCE(credited.uw_amount, 0) - COALESCE(paid.uw_amount, 0) <> 0
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION insertNewEmail(prefix text, subject text, tex text, html text, frm text, replyto text, addressee text, address text) RETURNS SETOF RECORD AS $$

  WITH newid AS (SELECT nextval('uw_emailid_seq') AS id),
        newemail AS (
                      INSERT
                        INTO uw_email_emails (
                                              uw_id,
                                              uw_externalid,
                                              uw_subject,
                                              uw_text,
                                              uw_html,
                                              uw_from,
                                              uw_replyto,
                                              uw_addressee,
                                              uw_address
                                            )
                      SELECT newid.id,
                             prefix || CAST(newid.id AS text) AS text,
                             subject,
                             tex,
                             html,
                             frm,
                             replyto,
                             addressee,
                             address
                        FROM newid
                  ),
        newstatus AS (
                      INSERT
                        INTO uw_email_statusses (
                                                  uw_emailid,
                                                  uw_version,
                                                  uw_status,
                                                  uw_stamp,
                                                  uw_islastversion
                                                )
                      SELECT id, 1, 'WAITING', now(), true
                        FROM newid
                  )
  SELECT id
  FROM newid

$$ LANGUAGE sql;
