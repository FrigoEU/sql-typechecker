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
