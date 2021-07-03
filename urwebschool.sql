--
-- PostgreSQL database dump
--

-- Dumped from database version 9.6.21
-- Dumped by pg_dump version 9.6.21

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: plpgsql; Type: EXTENSION; Schema: -; Owner: 
--

CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;


--
-- Name: EXTENSION plpgsql; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION plpgsql IS 'PL/pgSQL procedural language';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: 
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: enrollmentrequests_set_updated(); Type: FUNCTION; Schema: public; Owner: simon
--

CREATE FUNCTION public.enrollmentrequests_set_updated() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.uw_updated := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.enrollmentrequests_set_updated() OWNER TO simon;

--
-- Name: notify_haskell_emails_waiting(); Type: FUNCTION; Schema: public; Owner: simon
--

CREATE FUNCTION public.notify_haskell_emails_waiting() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  BEGIN
    NOTIFY emails_waiting;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.notify_haskell_emails_waiting() OWNER TO simon;

--
-- Name: on_startup(text, text, boolean, text, text); Type: FUNCTION; Schema: public; Owner: simon
--

CREATE FUNCTION public.on_startup(displayname text, url text, demo boolean, email text, country text) RETURNS integer
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM uw_schoolurl_tab;
  DELETE FROM uw_demoinstance_tab;
  DELETE FROM uw_Schoolcountry_Schoolcountryserialized_tab;
  INSERT INTO uw_schoolurl_tab (uw_version, uw_value, uw_islastversion, uw_stamp)
  VALUES                       (1, url, TRUE, CURRENT_TIMESTAMP);
  INSERT INTO uw_demoinstance_tab (uw_version, uw_value, uw_islastversion, uw_stamp)
  VALUES                          (1, demo, TRUE, CURRENT_TIMESTAMP);
  INSERT INTO uw_Schoolcountry_Schoolcountryserialized_tab (uw_version, uw_value, uw_islastversion, uw_stamp)
  VALUES                          (1, country, TRUE, CURRENT_TIMESTAMP);
  -- Insert Schoolname only if not present yet, since you can change it in classy.school settings
  PERFORM * FROM uw_schoolname_tab;
  IF NOT FOUND THEN
    INSERT INTO uw_schoolname_tab (uw_version, uw_value, uw_islastversion, uw_stamp)
    VALUES                        (1, displayname, TRUE, CURRENT_TIMESTAMP);
  END IF;
  -- Zet generalEmail op als demo modus.
  PERFORM * FROM uw_generalemail_tab;
  IF NOT FOUND THEN
    INSERT INTO uw_generalemail_tab (uw_version, uw_value, uw_islastversion, uw_stamp)
    VALUES                          (1, email, TRUE, CURRENT_TIMESTAMP);
  END IF;
  -- Zet admin account op, niet nodig voor demomode, die doet dat zelf
  IF demo = FALSE
  THEN
    PERFORM * FROM uw_adminaccounts_adminaccounts WHERE uw_email = email;
    IF NOT FOUND THEN
      INSERT INTO uw_adminaccounts_adminaccounts
        (uw_email, uw_wantsnotificationsformessages, uw_wantsccfornotes, uw_wantsccformessages, uw_sawwelcome)
      VALUES
        (email, true, true, true, false);
    END IF;
  END IF;
  RETURN 1;
END;
$$;


ALTER FUNCTION public.on_startup(displayname text, url text, demo boolean, email text, country text) OWNER TO simon;

SET default_tablespace = '';

SET default_with_oids = false;

--
-- Name: uw_adminaccounts_adminaccounts; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_adminaccounts_adminaccounts (
    uw_email text NOT NULL,
    uw_wantsnotificationsformessages boolean NOT NULL,
    uw_wantsccfornotes boolean NOT NULL,
    uw_wantsccformessages boolean NOT NULL,
    uw_sawwelcome boolean NOT NULL
);


ALTER TABLE public.uw_adminaccounts_adminaccounts OWNER TO simon;

--
-- Name: uw_ajaxupload_handles; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_ajaxupload_handles
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_ajaxupload_handles OWNER TO simon;

--
-- Name: uw_ajaxupload_scratch; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_ajaxupload_scratch (
    uw_handle bigint NOT NULL,
    uw_filename text,
    uw_mimetype text NOT NULL,
    uw_content bytea NOT NULL,
    uw_created timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_ajaxupload_scratch OWNER TO simon;

--
-- Name: uw_alwaysshowwireinstructions_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_alwaysshowwireinstructions_tab (
    uw_version bigint NOT NULL,
    uw_value boolean NOT NULL,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_alwaysshowwireinstructions_tab OWNER TO simon;

--
-- Name: uw_audit_trail; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_audit_trail (
    uw_id bigint NOT NULL,
    uw_useremail text NOT NULL,
    uw_type_ text NOT NULL,
    uw_description text NOT NULL,
    uw_extratechnicalinfo text NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_audit_trail OWNER TO simon;

--
-- Name: uw_audit_trails; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_audit_trails
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_audit_trails OWNER TO simon;

--
-- Name: uw_b2bucket_id_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_b2bucket_id_tab (
    uw_version bigint NOT NULL,
    uw_value text NOT NULL,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_b2bucket_id_tab OWNER TO simon;

--
-- Name: uw_b2bucket_name__tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_b2bucket_name__tab (
    uw_version bigint NOT NULL,
    uw_value text NOT NULL,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_b2bucket_name__tab OWNER TO simon;

--
-- Name: uw_config_formulainstruments; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_config_formulainstruments (
    uw_formulaid bigint NOT NULL,
    uw_instrumentid bigint NOT NULL
);


ALTER TABLE public.uw_config_formulainstruments OWNER TO simon;

--
-- Name: uw_config_formulainvoicelines; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_config_formulainvoicelines (
    uw_formulaid bigint NOT NULL,
    uw_type_ text NOT NULL,
    uw_description text NOT NULL,
    uw_amount double precision NOT NULL,
    uw_vat double precision NOT NULL,
    uw_order bigint NOT NULL,
    CONSTRAINT uw_config_formulainvoicelines_amount CHECK (((((uw_type_ = 'Normal'::text) OR (uw_type_ = 'Optional'::text)) AND (uw_amount >= (0.0)::double precision)) OR ((uw_type_ = 'Discount'::text) AND (uw_amount < (0.0)::double precision)))),
    CONSTRAINT uw_config_formulainvoicelines_order CHECK ((uw_order >= (0)::bigint)),
    CONSTRAINT uw_config_formulainvoicelines_vat CHECK ((uw_vat >= (0)::double precision))
);


ALTER TABLE public.uw_config_formulainvoicelines OWNER TO simon;

--
-- Name: uw_config_formulas; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_config_formulas (
    uw_numberoflessons bigint NOT NULL,
    uw_lessonduration bigint NOT NULL,
    uw_startsfromperiod boolean NOT NULL,
    uw_manualplanning boolean NOT NULL,
    uw_description text NOT NULL,
    uw_comments text NOT NULL,
    uw_type_ text NOT NULL,
    uw_id bigint NOT NULL,
    uw_color text NOT NULL,
    CONSTRAINT uw_config_formulas_lessonduration CHECK (((uw_lessonduration = (20)::bigint) OR ((uw_lessonduration = (30)::bigint) OR ((uw_lessonduration = (40)::bigint) OR ((uw_lessonduration = (45)::bigint) OR ((uw_lessonduration = (60)::bigint) OR ((uw_lessonduration = (90)::bigint) OR ((uw_lessonduration = (120)::bigint) OR ((uw_lessonduration = (150)::bigint) OR (uw_lessonduration = (180)::bigint)))))))))),
    CONSTRAINT uw_config_formulas_numberoflessons CHECK ((uw_numberoflessons > (0)::bigint))
);


ALTER TABLE public.uw_config_formulas OWNER TO simon;

--
-- Name: uw_config_formulasseq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_config_formulasseq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_config_formulasseq OWNER TO simon;

--
-- Name: uw_config_holidays; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_config_holidays (
    uw_description text NOT NULL,
    uw_periodid bigint NOT NULL,
    uw_firstday timestamp without time zone NOT NULL,
    uw_lastday timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_config_holidays OWNER TO simon;

--
-- Name: uw_config_instruments; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_config_instruments (
    uw_description text NOT NULL,
    uw_id bigint NOT NULL
);


ALTER TABLE public.uw_config_instruments OWNER TO simon;

--
-- Name: uw_config_instrumentsseq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_config_instrumentsseq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_config_instrumentsseq OWNER TO simon;

--
-- Name: uw_config_periods; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_config_periods (
    uw_id bigint NOT NULL,
    uw_firstday timestamp without time zone NOT NULL,
    uw_lastday timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_config_periods OWNER TO simon;

--
-- Name: uw_config_periodsseq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_config_periodsseq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_config_periodsseq OWNER TO simon;

--
-- Name: uw_creditnoteid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_creditnoteid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_creditnoteid_seq OWNER TO simon;

--
-- Name: uw_demoinstance_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_demoinstance_tab (
    uw_version bigint NOT NULL,
    uw_value boolean NOT NULL,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_demoinstance_tab OWNER TO simon;

--
-- Name: uw_email_attachmentid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_email_attachmentid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_email_attachmentid_seq OWNER TO simon;

--
-- Name: uw_email_attachments; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_email_attachments (
    uw_id bigint NOT NULL,
    uw_emailid bigint NOT NULL,
    uw_filename text NOT NULL,
    uw_content bytea NOT NULL
);


ALTER TABLE public.uw_email_attachments OWNER TO simon;

--
-- Name: uw_email_emails; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_email_emails (
    uw_id bigint NOT NULL,
    uw_externalid text NOT NULL,
    uw_address text NOT NULL,
    uw_addressee text NOT NULL,
    uw_subject text NOT NULL,
    uw_text text NOT NULL,
    uw_html text,
    uw_from text NOT NULL,
    uw_replyto text
);


ALTER TABLE public.uw_email_emails OWNER TO simon;

--
-- Name: uw_email_statusses; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_email_statusses (
    uw_emailid bigint NOT NULL,
    uw_version bigint NOT NULL,
    uw_status text NOT NULL,
    uw_stamp timestamp without time zone NOT NULL,
    uw_islastversion boolean NOT NULL
);


ALTER TABLE public.uw_email_statusses OWNER TO simon;

--
-- Name: uw_emailid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_emailid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_emailid_seq OWNER TO simon;

--
-- Name: uw_enrollmentid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_enrollmentid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_enrollmentid_seq OWNER TO simon;

--
-- Name: uw_enrollmentrequestid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_enrollmentrequestid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_enrollmentrequestid_seq OWNER TO simon;

--
-- Name: uw_enrollmentrequestprivateid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_enrollmentrequestprivateid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_enrollmentrequestprivateid_seq OWNER TO simon;

--
-- Name: uw_evaluation_evaluations; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_evaluation_evaluations (
    uw_id bigint NOT NULL,
    uw_enrollmentid bigint NOT NULL,
    uw_created timestamp without time zone NOT NULL,
    uw_modified timestamp without time zone NOT NULL,
    uw_finalized timestamp without time zone
);


ALTER TABLE public.uw_evaluation_evaluations OWNER TO simon;

--
-- Name: uw_evaluation_evaluationsectionid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_evaluation_evaluationsectionid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_evaluation_evaluationsectionid_seq OWNER TO simon;

--
-- Name: uw_evaluation_evaluationsections; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_evaluation_evaluationsections (
    uw_id bigint NOT NULL,
    uw_evaluationid bigint NOT NULL,
    uw_title text NOT NULL,
    uw_text text NOT NULL
);


ALTER TABLE public.uw_evaluation_evaluationsections OWNER TO simon;

--
-- Name: uw_evaluationid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_evaluationid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_evaluationid_seq OWNER TO simon;

--
-- Name: uw_event_eventid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_event_eventid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_event_eventid_seq OWNER TO simon;

--
-- Name: uw_event_events; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_event_events (
    uw_id bigint NOT NULL,
    uw_description text NOT NULL,
    uw_text text NOT NULL,
    uw_html text NOT NULL,
    uw_attachment text,
    uw_attachmentname text,
    uw_date timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_event_events OWNER TO simon;

--
-- Name: uw_filenoteid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_filenoteid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_filenoteid_seq OWNER TO simon;

--
-- Name: uw_generalemail_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_generalemail_tab (
    uw_version bigint NOT NULL,
    uw_value text,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_generalemail_tab OWNER TO simon;

--
-- Name: uw_invoicedetails_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_invoicedetails_tab (
    uw_version bigint NOT NULL,
    uw_value text,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_invoicedetails_tab OWNER TO simon;

--
-- Name: uw_invoiceduedate_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_invoiceduedate_tab (
    uw_version bigint NOT NULL,
    uw_value bigint NOT NULL,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_invoiceduedate_tab OWNER TO simon;

--
-- Name: uw_invoiceid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_invoiceid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_invoiceid_seq OWNER TO simon;

--
-- Name: uw_invoicepayduringenrollment_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_invoicepayduringenrollment_tab (
    uw_version bigint NOT NULL,
    uw_value boolean NOT NULL,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_invoicepayduringenrollment_tab OWNER TO simon;

--
-- Name: uw_lesson_enrollmentrequests; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_lesson_enrollmentrequests (
    uw_id bigint NOT NULL,
    uw_studentid bigint NOT NULL,
    uw_status text NOT NULL,
    uw_secret text NOT NULL,
    uw_created timestamp without time zone NOT NULL,
    uw_updated timestamp without time zone NOT NULL,
    uw_lessongroupid bigint,
    uw_enrollmentrequestprivateid bigint,
    uw_familydiscountname text,
    uw_reserveduntil timestamp without time zone,
    uw_showonplanninguntil timestamp without time zone,
    uw_origin text NOT NULL,
    CONSTRAINT uw_lesson_enrollmentrequests_eitherlessongrouporprivate CHECK ((((uw_lessongroupid IS NULL) AND (NOT (uw_enrollmentrequestprivateid IS NULL))) OR ((NOT (uw_lessongroupid IS NULL)) AND (uw_enrollmentrequestprivateid IS NULL))))
);


ALTER TABLE public.uw_lesson_enrollmentrequests OWNER TO simon;

--
-- Name: uw_lesson_enrollmentsincludingstopped; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_lesson_enrollmentsincludingstopped (
    uw_id bigint NOT NULL,
    uw_studentid bigint NOT NULL,
    uw_lessongroupid bigint NOT NULL,
    uw_status text NOT NULL,
    uw_created timestamp without time zone NOT NULL,
    uw_allowreenrollment boolean NOT NULL
);


ALTER TABLE public.uw_lesson_enrollmentsincludingstopped OWNER TO simon;

--
-- Name: uw_lesson_lessongroups; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_lesson_lessongroups (
    uw_id bigint NOT NULL,
    uw_internalteacherid bigint NOT NULL,
    uw_restlessons bigint NOT NULL,
    uw_instrumentid bigint NOT NULL,
    uw_lessonduration bigint NOT NULL,
    uw_startsfromperiod boolean NOT NULL,
    uw_startsinperiod bigint NOT NULL,
    uw_firstlesson timestamp without time zone,
    uw_lastlesson timestamp without time zone,
    uw_description text,
    uw_formulaid bigint NOT NULL,
    uw_complement bigint,
    uw_weekday text NOT NULL,
    uw_time text NOT NULL,
    uw_planningmode text NOT NULL,
    uw_type_ text NOT NULL,
    uw_location text NOT NULL,
    uw_roomid bigint,
    CONSTRAINT uw_lesson_lessongroups_complement_type CHECK ((((uw_planningmode = 'Weekly'::text) AND (uw_complement IS NULL)) OR (uw_planningmode = 'Custom'::text))),
    CONSTRAINT uw_lesson_lessongroups_location_roomid CHECK (((uw_roomid IS NULL) OR ((uw_roomid IS NOT NULL) AND (uw_location = 'RoomS'::text))))
);


ALTER TABLE public.uw_lesson_lessongroups OWNER TO simon;

--
-- Name: uw_lesson_lessonsincludingremoved; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_lesson_lessonsincludingremoved (
    uw_id bigint NOT NULL,
    uw_lessongroupid bigint NOT NULL,
    uw_plannedteacherid bigint NOT NULL,
    uw_teacherid bigint NOT NULL,
    uw_date timestamp without time zone NOT NULL,
    uw_time text NOT NULL,
    uw_creation text NOT NULL,
    uw_removedreason text,
    uw_replacement bigint,
    uw_location text NOT NULL,
    uw_roomid bigint,
    CONSTRAINT uw_lesson_lessonsincludingremoved_location_roomid CHECK (((uw_roomid IS NULL) OR ((uw_roomid IS NOT NULL) AND (uw_location = 'RoomS'::text)))),
    CONSTRAINT uw_lesson_lessonsincludingremoved_replacement CHECK ((((uw_removedreason = 'StudentLegalAbsence'::text) AND (uw_replacement IS NOT NULL)) OR (uw_removedreason <> 'StudentLegalAbsence'::text)))
);


ALTER TABLE public.uw_lesson_lessonsincludingremoved OWNER TO simon;

--
-- Name: uw_lesson_status_studentpresences; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_lesson_status_studentpresences (
    uw_lessonid bigint NOT NULL,
    uw_studentid bigint NOT NULL,
    uw_status text NOT NULL,
    uw_createdby text NOT NULL,
    uw_createdon timestamp without time zone NOT NULL,
    uw_comments text NOT NULL,
    uw_storagefileid text,
    uw_needsadmincheck boolean NOT NULL
);


ALTER TABLE public.uw_lesson_status_studentpresences OWNER TO simon;

--
-- Name: uw_room_rooms; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_room_rooms (
    uw_id bigint NOT NULL,
    uw_description text NOT NULL
);


ALTER TABLE public.uw_room_rooms OWNER TO simon;

--
-- Name: uw_student_students; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_student_students (
    uw_id bigint NOT NULL,
    uw_firstname text NOT NULL,
    uw_lastname text NOT NULL,
    uw_comments text NOT NULL,
    uw_birthday timestamp without time zone,
    uw_street text NOT NULL,
    uw_number text NOT NULL,
    uw_bus text NOT NULL,
    uw_zip text NOT NULL,
    uw_city text NOT NULL
);


ALTER TABLE public.uw_student_students OWNER TO simon;

--
-- Name: uw_teacher_teachers; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_teacher_teachers (
    uw_id bigint NOT NULL,
    uw_firstname text NOT NULL,
    uw_lastname text NOT NULL,
    uw_comments text NOT NULL,
    uw_email text NOT NULL,
    uw_phone text NOT NULL,
    uw_wantsnotificationsformessages boolean NOT NULL,
    uw_wantsnotificationsfornotes boolean NOT NULL
);


ALTER TABLE public.uw_teacher_teachers OWNER TO simon;

--
-- Name: uw_lesson_extended_extendedlessonsview; Type: VIEW; Schema: public; Owner: simon
--

CREATE VIEW public.uw_lesson_extended_extendedlessonsview AS
 SELECT t_lessonsincludingremoved.uw_creation,
    t_lessonsincludingremoved.uw_date,
    t_lessongroups.uw_lessonduration AS uw_duration,
    t_enrollmentsincludingstopped.uw_id AS uw_enrollmentid,
    t_enrollmentsincludingstopped.uw_status AS uw_enrollmentstatus,
    t_lessonsincludingremoved.uw_id,
    t_instruments.uw_description AS uw_instrumentdescription,
    t_instruments.uw_id AS uw_instrumentid,
    t_lessonsincludingremoved.uw_lessongroupid,
    t_lessongroups.uw_lastlesson AS uw_lessongroups_lastlesson,
    t_lessonsincludingremoved.uw_location,
    t_pt.uw_firstname AS uw_plannedteacherfirstname,
    t_pt.uw_id AS uw_plannedteacherid,
    t_pt.uw_lastname AS uw_plannedteacherlastname,
    t_lessonsincludingremoved.uw_removedreason,
    t_repl.uw_date AS uw_replacementdate,
    t_repl.uw_time AS uw_replacementtime,
    t_rooms.uw_description AS uw_roomdescription,
    t_lessonsincludingremoved.uw_roomid,
    t_studentpresences.uw_status,
    t_studentpresences.uw_comments AS uw_statuscomments,
    t_studentpresences.uw_createdby AS uw_statuscreatedby,
    t_studentpresences.uw_createdon AS uw_statuscreatedon,
    t_studentpresences.uw_needsadmincheck AS uw_statusneedsadmincheck,
    t_studentpresences.uw_storagefileid AS uw_statusstoragefileid,
    t_students.uw_firstname AS uw_studentfirstname,
    t_students.uw_id AS uw_studentid,
    t_students.uw_lastname AS uw_studentlastname,
    t_te.uw_firstname AS uw_teacherfirstname,
    t_te.uw_id AS uw_teacherid,
    t_te.uw_lastname AS uw_teacherlastname,
    t_lessonsincludingremoved.uw_time,
    t_lessongroups.uw_type_
   FROM (((((((((public.uw_lesson_lessonsincludingremoved t_lessonsincludingremoved
     JOIN public.uw_lesson_lessongroups t_lessongroups ON ((t_lessonsincludingremoved.uw_lessongroupid = t_lessongroups.uw_id)))
     JOIN public.uw_lesson_enrollmentsincludingstopped t_enrollmentsincludingstopped ON ((t_enrollmentsincludingstopped.uw_lessongroupid = t_lessongroups.uw_id)))
     JOIN public.uw_student_students t_students ON ((t_enrollmentsincludingstopped.uw_studentid = t_students.uw_id)))
     JOIN public.uw_teacher_teachers t_te ON ((t_te.uw_id = t_lessonsincludingremoved.uw_teacherid)))
     JOIN public.uw_teacher_teachers t_pt ON ((t_pt.uw_id = t_lessonsincludingremoved.uw_plannedteacherid)))
     JOIN public.uw_config_instruments t_instruments ON ((t_instruments.uw_id = t_lessongroups.uw_instrumentid)))
     LEFT JOIN public.uw_room_rooms t_rooms ON ((NOT (t_lessonsincludingremoved.uw_roomid IS DISTINCT FROM t_rooms.uw_id))))
     LEFT JOIN public.uw_lesson_status_studentpresences t_studentpresences ON (((t_studentpresences.uw_lessonid = t_lessonsincludingremoved.uw_id) AND (t_studentpresences.uw_studentid = t_enrollmentsincludingstopped.uw_studentid))))
     LEFT JOIN public.uw_lesson_lessonsincludingremoved t_repl ON ((NOT (t_repl.uw_id IS DISTINCT FROM t_lessonsincludingremoved.uw_replacement))));


ALTER TABLE public.uw_lesson_extended_extendedlessonsview OWNER TO simon;

--
-- Name: uw_lesson_finance_creditnotes; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_lesson_finance_creditnotes (
    uw_externalid bigint NOT NULL,
    uw_amount double precision NOT NULL,
    uw_date timestamp without time zone NOT NULL,
    uw_id bigint NOT NULL,
    uw_invoiceid bigint NOT NULL,
    CONSTRAINT uw_lesson_finance_creditnotes_amount_valid CHECK ((uw_amount >= (0)::double precision)),
    CONSTRAINT uw_lesson_finance_creditnotes_externalid_valid CHECK ((uw_externalid > (0)::bigint))
);


ALTER TABLE public.uw_lesson_finance_creditnotes OWNER TO simon;

--
-- Name: uw_lesson_finance_creditnotest; Type: VIEW; Schema: public; Owner: simon
--

CREATE VIEW public.uw_lesson_finance_creditnotest AS
 SELECT t_creditnotes.uw_invoiceid,
    sum(t_creditnotes.uw_amount) AS uw_totalamount
   FROM public.uw_lesson_finance_creditnotes t_creditnotes
  GROUP BY t_creditnotes.uw_invoiceid;


ALTER TABLE public.uw_lesson_finance_creditnotest OWNER TO simon;

--
-- Name: uw_lesson_finance_invoicelines; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_lesson_finance_invoicelines (
    uw_invoiceid bigint NOT NULL,
    uw_description text NOT NULL,
    uw_amount double precision NOT NULL,
    uw_vat double precision NOT NULL,
    uw_order bigint NOT NULL,
    CONSTRAINT uw_lesson_finance_invoicelines_order_valid CHECK ((uw_order >= (0)::bigint)),
    CONSTRAINT uw_lesson_finance_invoicelines_vat_valid CHECK ((uw_vat >= (0)::double precision))
);


ALTER TABLE public.uw_lesson_finance_invoicelines OWNER TO simon;

--
-- Name: uw_lesson_finance_invoicelinest; Type: VIEW; Schema: public; Owner: simon
--

CREATE VIEW public.uw_lesson_finance_invoicelinest AS
 SELECT t_invoicelines.uw_invoiceid,
    sum(t_invoicelines.uw_amount) AS uw_totalamount
   FROM public.uw_lesson_finance_invoicelines t_invoicelines
  GROUP BY t_invoicelines.uw_invoiceid;


ALTER TABLE public.uw_lesson_finance_invoicelinest OWNER TO simon;

--
-- Name: uw_lesson_finance_invoices; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_lesson_finance_invoices (
    uw_id bigint NOT NULL,
    uw_due timestamp without time zone NOT NULL,
    uw_externalid bigint NOT NULL,
    uw_enrollmentrequestid bigint,
    uw_enrollmentid bigint,
    uw_externalidstring text NOT NULL,
    CONSTRAINT uw_lesson_finance_invoices_enrollment_or_request CHECK ((((uw_enrollmentid IS NULL) AND (NOT (uw_enrollmentrequestid IS NULL))) OR ((NOT (uw_enrollmentid IS NULL)) AND (uw_enrollmentrequestid IS NULL)))),
    CONSTRAINT uw_lesson_finance_invoices_externalid_valid CHECK ((uw_externalid > (0)::bigint))
);


ALTER TABLE public.uw_lesson_finance_invoices OWNER TO simon;

--
-- Name: uw_lesson_finance_payments; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_lesson_finance_payments (
    uw_amount double precision NOT NULL,
    uw_date timestamp without time zone NOT NULL,
    uw_paymentproviderid text,
    uw_method text NOT NULL,
    uw_invoiceid bigint NOT NULL,
    CONSTRAINT uw_lesson_finance_payments_amount CHECK ((uw_amount >= (0)::double precision))
);


ALTER TABLE public.uw_lesson_finance_payments OWNER TO simon;

--
-- Name: uw_lesson_finance_paymentst; Type: VIEW; Schema: public; Owner: simon
--

CREATE VIEW public.uw_lesson_finance_paymentst AS
 SELECT t_payments.uw_invoiceid,
    sum(t_payments.uw_amount) AS uw_totalamount
   FROM public.uw_lesson_finance_payments t_payments
  GROUP BY t_payments.uw_invoiceid;


ALTER TABLE public.uw_lesson_finance_paymentst OWNER TO simon;

--
-- Name: uw_lesson_finance_periodfees; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_lesson_finance_periodfees (
    uw_studentid bigint NOT NULL,
    uw_periodid bigint NOT NULL,
    uw_amount double precision NOT NULL,
    uw_method text,
    uw_familydiscount double precision NOT NULL,
    uw_paid double precision NOT NULL,
    uw_due timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_lesson_finance_periodfees OWNER TO simon;

--
-- Name: uw_lesson_finance_placeholderinvoicelines; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_lesson_finance_placeholderinvoicelines (
    uw_placeholderinvoiceid bigint NOT NULL,
    uw_description text NOT NULL,
    uw_amount double precision NOT NULL,
    uw_vat double precision NOT NULL,
    uw_order bigint NOT NULL,
    CONSTRAINT uw_lesson_finance_placeholderinvoicelines_order_valid CHECK ((uw_order >= (0)::bigint)),
    CONSTRAINT uw_lesson_finance_placeholderinvoicelines_vat_valid CHECK ((uw_vat >= (0)::double precision))
);


ALTER TABLE public.uw_lesson_finance_placeholderinvoicelines OWNER TO simon;

--
-- Name: uw_lesson_finance_placeholderinvoices; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_lesson_finance_placeholderinvoices (
    uw_id bigint NOT NULL,
    uw_due timestamp without time zone NOT NULL,
    uw_enrollmentrequestid bigint NOT NULL
);


ALTER TABLE public.uw_lesson_finance_placeholderinvoices OWNER TO simon;

--
-- Name: uw_lesson_finance_requestedoptionalinvoicelines; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_lesson_finance_requestedoptionalinvoicelines (
    uw_enrollmentrequestid bigint NOT NULL,
    uw_description text NOT NULL,
    uw_amount double precision NOT NULL
);


ALTER TABLE public.uw_lesson_finance_requestedoptionalinvoicelines OWNER TO simon;

--
-- Name: uw_lesson_holidaysskippedduringplanning; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_lesson_holidaysskippedduringplanning (
    uw_date timestamp without time zone NOT NULL,
    uw_holidaydescription text NOT NULL,
    uw_lessongroupid bigint NOT NULL
);


ALTER TABLE public.uw_lesson_holidaysskippedduringplanning OWNER TO simon;

--
-- Name: uw_lesson_lessongroupinvoicelines; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_lesson_lessongroupinvoicelines (
    uw_lessongroupid bigint NOT NULL,
    uw_type_ text NOT NULL,
    uw_description text NOT NULL,
    uw_amount double precision NOT NULL,
    uw_vat double precision NOT NULL,
    uw_order bigint NOT NULL,
    CONSTRAINT uw_lesson_lessongroupinvoicelines_amount CHECK (((((uw_type_ = 'Normal'::text) OR (uw_type_ = 'Optional'::text)) AND (uw_amount >= (0.0)::double precision)) OR ((uw_type_ = 'Discount'::text) AND (uw_amount < (0.0)::double precision)))),
    CONSTRAINT uw_lesson_lessongroupinvoicelines_order CHECK ((uw_order >= (0)::bigint)),
    CONSTRAINT uw_lesson_lessongroupinvoicelines_vat CHECK ((uw_vat >= (0)::double precision))
);


ALTER TABLE public.uw_lesson_lessongroupinvoicelines OWNER TO simon;

--
-- Name: uw_lesson_lessons; Type: VIEW; Schema: public; Owner: simon
--

CREATE VIEW public.uw_lesson_lessons AS
 SELECT t_lessonsincludingremoved.uw_creation,
    t_lessonsincludingremoved.uw_date,
    t_lessongroups.uw_lessonduration AS uw_duration,
    t_lessonsincludingremoved.uw_id,
    t_lessonsincludingremoved.uw_lessongroupid,
    t_lessonsincludingremoved.uw_location,
    t_lessonsincludingremoved.uw_plannedteacherid,
    t_lessonsincludingremoved.uw_roomid,
    t_lessonsincludingremoved.uw_teacherid,
    t_lessonsincludingremoved.uw_time
   FROM (public.uw_lesson_lessonsincludingremoved t_lessonsincludingremoved
     JOIN public.uw_lesson_lessongroups t_lessongroups ON ((t_lessongroups.uw_id = t_lessonsincludingremoved.uw_lessongroupid)))
  WHERE (t_lessonsincludingremoved.uw_removedreason IS NULL);


ALTER TABLE public.uw_lesson_lessons OWNER TO simon;

--
-- Name: uw_lesson_privateenrollmentrequests; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_lesson_privateenrollmentrequests (
    uw_id bigint NOT NULL,
    uw_firstlesson timestamp without time zone NOT NULL,
    uw_lastlesson timestamp without time zone NOT NULL,
    uw_startsinperiod bigint NOT NULL,
    uw_weekday text NOT NULL,
    uw_time text NOT NULL,
    uw_formulaid bigint NOT NULL,
    uw_instrumentid bigint NOT NULL,
    uw_internalteacherid bigint,
    uw_enrollmentrequestid bigint NOT NULL
);


ALTER TABLE public.uw_lesson_privateenrollmentrequests OWNER TO simon;

--
-- Name: uw_lessongroupid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_lessongroupid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_lessongroupid_seq OWNER TO simon;

--
-- Name: uw_lessonid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_lessonid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_lessonid_seq OWNER TO simon;

--
-- Name: uw_message_fullmessagereplies; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_message_fullmessagereplies (
    uw_messageid bigint NOT NULL,
    uw_text text NOT NULL,
    uw_bodyplain text NOT NULL
);


ALTER TABLE public.uw_message_fullmessagereplies OWNER TO simon;

--
-- Name: uw_message_messageemails; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_message_messageemails (
    uw_messageid bigint NOT NULL,
    uw_emailid bigint NOT NULL
);


ALTER TABLE public.uw_message_messageemails OWNER TO simon;

--
-- Name: uw_message_messageid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_message_messageid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_message_messageid_seq OWNER TO simon;

--
-- Name: uw_message_messages; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_message_messages (
    uw_id bigint NOT NULL,
    uw_senderadmin boolean NOT NULL,
    uw_senderteacherid bigint,
    uw_senderstudentid bigint,
    uw_receiveradmin boolean NOT NULL,
    uw_receiverteacherid bigint,
    uw_receiverstudentid bigint,
    uw_date timestamp without time zone NOT NULL,
    uw_time text NOT NULL,
    uw_read boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL,
    uw_text text NOT NULL,
    uw_emailsent boolean NOT NULL,
    CONSTRAINT uw_message_messages_receiver CHECK ((((uw_receiveradmin = true) AND ((uw_receiverteacherid IS NULL) AND (uw_receiverstudentid IS NULL))) OR (((uw_receiveradmin = false) AND ((NOT (uw_receiverteacherid IS NULL)) AND (uw_receiverstudentid IS NULL))) OR ((uw_receiveradmin = false) AND ((uw_receiverteacherid IS NULL) AND (NOT (uw_receiverstudentid IS NULL))))))),
    CONSTRAINT uw_message_messages_sender CHECK ((((uw_senderadmin = true) AND ((uw_senderteacherid IS NULL) AND (uw_senderstudentid IS NULL))) OR (((uw_senderadmin = false) AND ((NOT (uw_senderteacherid IS NULL)) AND (uw_senderstudentid IS NULL))) OR ((uw_senderadmin = false) AND ((uw_senderteacherid IS NULL) AND (NOT (uw_senderstudentid IS NULL)))))))
);


ALTER TABLE public.uw_message_messages OWNER TO simon;

--
-- Name: uw_message_messageswithcounterparties; Type: VIEW; Schema: public; Owner: simon
--

CREATE VIEW public.uw_message_messageswithcounterparties AS
 SELECT t_messages.uw_date,
    t_messages.uw_emailsent,
    t_messages.uw_id,
    t_messages.uw_read,
    t_messages.uw_receiveradmin,
    t_receiverstudents.uw_firstname AS uw_receiverstudentfirstname,
    t_receiverstudents.uw_id AS uw_receiverstudentid,
    t_receiverstudents.uw_lastname AS uw_receiverstudentlastname,
    t_receiverteachers.uw_firstname AS uw_receiverteacherfirstname,
    t_receiverteachers.uw_id AS uw_receiverteacherid,
    t_receiverteachers.uw_lastname AS uw_receiverteacherlastname,
    t_messages.uw_senderadmin,
    t_senderstudents.uw_firstname AS uw_senderstudentfirstname,
    t_senderstudents.uw_id AS uw_senderstudentid,
    t_senderstudents.uw_lastname AS uw_senderstudentlastname,
    t_senderteachers.uw_firstname AS uw_senderteacherfirstname,
    t_senderteachers.uw_id AS uw_senderteacherid,
    t_senderteachers.uw_lastname AS uw_senderteacherlastname,
    t_messages.uw_stamp,
    t_messages.uw_text,
    t_messages.uw_time
   FROM ((((public.uw_message_messages t_messages
     LEFT JOIN public.uw_student_students t_senderstudents ON ((NOT (t_messages.uw_senderstudentid IS DISTINCT FROM t_senderstudents.uw_id))))
     LEFT JOIN public.uw_teacher_teachers t_senderteachers ON ((NOT (t_messages.uw_senderteacherid IS DISTINCT FROM t_senderteachers.uw_id))))
     LEFT JOIN public.uw_student_students t_receiverstudents ON ((NOT (t_messages.uw_receiverstudentid IS DISTINCT FROM t_receiverstudents.uw_id))))
     LEFT JOIN public.uw_teacher_teachers t_receiverteachers ON ((NOT (t_messages.uw_receiverteacherid IS DISTINCT FROM t_receiverteachers.uw_id))));


ALTER TABLE public.uw_message_messageswithcounterparties OWNER TO simon;

--
-- Name: uw_message_repliesformessages; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_message_repliesformessages (
    uw_replyid bigint NOT NULL,
    uw_replyidstring text NOT NULL,
    uw_messageid bigint NOT NULL,
    uw_secret text NOT NULL,
    uw_toadmin boolean NOT NULL
);


ALTER TABLE public.uw_message_repliesformessages OWNER TO simon;

--
-- Name: uw_messageonstudentprofiles_messageonstudentprofileid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_messageonstudentprofiles_messageonstudentprofileid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_messageonstudentprofiles_messageonstudentprofileid_seq OWNER TO simon;

--
-- Name: uw_messageonstudentprofiles_messageonstudentprofiles; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_messageonstudentprofiles_messageonstudentprofiles (
    uw_id bigint NOT NULL,
    uw_html text NOT NULL,
    uw_text text NOT NULL,
    uw_savedon timestamp without time zone NOT NULL,
    uw_islastversion boolean NOT NULL
);


ALTER TABLE public.uw_messageonstudentprofiles_messageonstudentprofiles OWNER TO simon;

--
-- Name: uw_messagequeue_queuedmessages; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_messagequeue_queuedmessages (
    uw_id bigint NOT NULL,
    uw_content text NOT NULL
);


ALTER TABLE public.uw_messagequeue_queuedmessages OWNER TO simon;

--
-- Name: uw_messagequeue_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_messagequeue_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_messagequeue_seq OWNER TO simon;

--
-- Name: uw_mollie_authorizerequests; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_mollie_authorizerequests (
    uw_stamp timestamp without time zone NOT NULL,
    uw_csrftoken text NOT NULL
);


ALTER TABLE public.uw_mollie_authorizerequests OWNER TO simon;

--
-- Name: uw_mollieprofileid_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_mollieprofileid_tab (
    uw_version bigint NOT NULL,
    uw_value text,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_mollieprofileid_tab OWNER TO simon;

--
-- Name: uw_mollierefreshtoken_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_mollierefreshtoken_tab (
    uw_version bigint NOT NULL,
    uw_value text,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_mollierefreshtoken_tab OWNER TO simon;

--
-- Name: uw_monitoring_errors; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_monitoring_errors (
    uw_id bigint NOT NULL,
    uw_message text NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_monitoring_errors OWNER TO simon;

--
-- Name: uw_monitoring_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_monitoring_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_monitoring_seq OWNER TO simon;

--
-- Name: uw_note_filenotes; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_note_filenotes (
    uw_id bigint NOT NULL,
    uw_lessonid bigint NOT NULL,
    uw_description text NOT NULL,
    uw_studentid bigint,
    uw_teacherid bigint,
    uw_stamp timestamp without time zone NOT NULL,
    uw_mimetype text NOT NULL,
    uw_storagefileid text NOT NULL
);


ALTER TABLE public.uw_note_filenotes OWNER TO simon;

--
-- Name: uw_note_textnotes; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_note_textnotes (
    uw_id bigint NOT NULL,
    uw_lessonid bigint NOT NULL,
    uw_content text NOT NULL,
    uw_studentid bigint,
    uw_teacherid bigint,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_note_textnotes OWNER TO simon;

--
-- Name: uw_note_notestamps; Type: VIEW; Schema: public; Owner: simon
--

CREATE VIEW public.uw_note_notestamps AS
 SELECT t_textnotes.uw_lessonid,
    t_textnotes.uw_stamp
   FROM public.uw_note_textnotes t_textnotes
UNION
 SELECT t_filenotes.uw_lessonid,
    t_filenotes.uw_stamp
   FROM public.uw_note_filenotes t_filenotes;


ALTER TABLE public.uw_note_notestamps OWNER TO simon;

--
-- Name: uw_note_repliesfornotes; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_note_repliesfornotes (
    uw_replyid bigint NOT NULL,
    uw_replyidstring text NOT NULL,
    uw_lessonid bigint NOT NULL,
    uw_studentid bigint,
    uw_teacherid bigint,
    uw_admin boolean NOT NULL,
    uw_secret text NOT NULL,
    CONSTRAINT uw_note_repliesfornotes_receiver CHECK ((((uw_admin = true) AND ((uw_teacherid IS NULL) AND (uw_studentid IS NULL))) OR (((uw_admin = false) AND ((NOT (uw_teacherid IS NULL)) AND (uw_studentid IS NULL))) OR ((uw_admin = false) AND ((uw_teacherid IS NULL) AND (NOT (uw_studentid IS NULL)))))))
);


ALTER TABLE public.uw_note_repliesfornotes OWNER TO simon;

--
-- Name: uw_note_viewednotes; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_note_viewednotes (
    uw_id bigint NOT NULL,
    uw_teacherid bigint,
    uw_studentid bigint,
    uw_lessongroupid bigint NOT NULL,
    uw_stamp timestamp without time zone NOT NULL,
    CONSTRAINT uw_note_viewednotes_teacherorstudent CHECK ((((uw_teacherid IS NULL) AND (NOT (uw_studentid IS NULL))) OR ((uw_studentid IS NULL) AND (NOT (uw_teacherid IS NULL)))))
);


ALTER TABLE public.uw_note_viewednotes OWNER TO simon;

--
-- Name: uw_note_viewednotesseq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_note_viewednotesseq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_note_viewednotesseq OWNER TO simon;

--
-- Name: uw_payenrollment_onlinepayments; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_payenrollment_onlinepayments (
    uw_paymentid text NOT NULL,
    uw_checkouturl text NOT NULL,
    uw_enrollmentid bigint,
    uw_enrollmentrequestid bigint,
    uw_amount double precision NOT NULL,
    uw_createdon timestamp without time zone NOT NULL,
    uw_status text NOT NULL,
    uw_description text NOT NULL,
    CONSTRAINT uw_payenrollment_onlinepayments_enrollmentorrequest CHECK ((((uw_enrollmentid IS NULL) AND (NOT (uw_enrollmentrequestid IS NULL))) OR ((uw_enrollmentrequestid IS NULL) AND (NOT (uw_enrollmentid IS NULL)))))
);


ALTER TABLE public.uw_payenrollment_onlinepayments OWNER TO simon;

--
-- Name: uw_periodfee_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_periodfee_tab (
    uw_version bigint NOT NULL,
    uw_value double precision NOT NULL,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_periodfee_tab OWNER TO simon;

--
-- Name: uw_periodfeeduedate_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_periodfeeduedate_tab (
    uw_version bigint NOT NULL,
    uw_value text NOT NULL,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_periodfeeduedate_tab OWNER TO simon;

--
-- Name: uw_periodfeefamilydiscount_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_periodfeefamilydiscount_tab (
    uw_version bigint NOT NULL,
    uw_value double precision NOT NULL,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_periodfeefamilydiscount_tab OWNER TO simon;

--
-- Name: uw_periodfeepayduringenrollment_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_periodfeepayduringenrollment_tab (
    uw_version bigint NOT NULL,
    uw_value boolean NOT NULL,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_periodfeepayduringenrollment_tab OWNER TO simon;

--
-- Name: uw_placeholderinvoiceid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_placeholderinvoiceid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_placeholderinvoiceid_seq OWNER TO simon;

--
-- Name: uw_replyid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_replyid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_replyid_seq OWNER TO simon;

--
-- Name: uw_room_roominstruments; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_room_roominstruments (
    uw_roomid bigint NOT NULL,
    uw_instrumentid bigint NOT NULL
);


ALTER TABLE public.uw_room_roominstruments OWNER TO simon;

--
-- Name: uw_room_roomsseq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_room_roomsseq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_room_roomsseq OWNER TO simon;

--
-- Name: uw_schoolaccount_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_schoolaccount_tab (
    uw_version bigint NOT NULL,
    uw_value text,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_schoolaccount_tab OWNER TO simon;

--
-- Name: uw_schoolcountry_schoolcountryserialized_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_schoolcountry_schoolcountryserialized_tab (
    uw_version bigint NOT NULL,
    uw_value text NOT NULL,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_schoolcountry_schoolcountryserialized_tab OWNER TO simon;

--
-- Name: uw_schoolhours_schoolhoursserialized_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_schoolhours_schoolhoursserialized_tab (
    uw_version bigint NOT NULL,
    uw_value text NOT NULL,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_schoolhours_schoolhoursserialized_tab OWNER TO simon;

--
-- Name: uw_schoolname_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_schoolname_tab (
    uw_version bigint NOT NULL,
    uw_value text NOT NULL,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_schoolname_tab OWNER TO simon;

--
-- Name: uw_schoolurl_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_schoolurl_tab (
    uw_version bigint NOT NULL,
    uw_value text NOT NULL,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_schoolurl_tab OWNER TO simon;

--
-- Name: uw_session_credentials; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_session_credentials (
    uw_email text NOT NULL,
    uw_hash text NOT NULL,
    uw_createdon timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_session_credentials OWNER TO simon;

--
-- Name: uw_session_emailsecret_secrets; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_session_emailsecret_secrets (
    uw_email text NOT NULL,
    uw_secret text NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_session_emailsecret_secrets OWNER TO simon;

--
-- Name: uw_session_resettingcredentials; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_session_resettingcredentials (
    uw_email text NOT NULL,
    uw_since timestamp without time zone NOT NULL,
    uw_random bigint NOT NULL
);


ALTER TABLE public.uw_session_resettingcredentials OWNER TO simon;

--
-- Name: uw_student_family; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_student_family (
    uw_subject bigint NOT NULL,
    uw_relation text NOT NULL,
    uw_other bigint NOT NULL
);


ALTER TABLE public.uw_student_family OWNER TO simon;

--
-- Name: uw_student_notfamily; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_student_notfamily (
    uw_subject bigint NOT NULL,
    uw_other bigint NOT NULL
);


ALTER TABLE public.uw_student_notfamily OWNER TO simon;

--
-- Name: uw_student_studentemails; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_student_studentemails (
    uw_id bigint NOT NULL,
    uw_studentid bigint NOT NULL,
    uw_email text NOT NULL,
    uw_wantsnotificationsformessages boolean NOT NULL,
    uw_wantsnotificationsfornotes boolean NOT NULL
);


ALTER TABLE public.uw_student_studentemails OWNER TO simon;

--
-- Name: uw_student_studentemailsseq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_student_studentemailsseq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_student_studentemailsseq OWNER TO simon;

--
-- Name: uw_student_studentphones; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_student_studentphones (
    uw_id bigint NOT NULL,
    uw_studentid bigint NOT NULL,
    uw_number text NOT NULL,
    uw_description text
);


ALTER TABLE public.uw_student_studentphones OWNER TO simon;

--
-- Name: uw_student_studentphonesseq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_student_studentphonesseq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_student_studentphonesseq OWNER TO simon;

--
-- Name: uw_studentid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_studentid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_studentid_seq OWNER TO simon;

--
-- Name: uw_teacher_externalteachers; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_teacher_externalteachers (
    uw_externalteacherid bigint NOT NULL,
    uw_id bigint NOT NULL
);


ALTER TABLE public.uw_teacher_externalteachers OWNER TO simon;

--
-- Name: uw_teacher_externalteachersf; Type: VIEW; Schema: public; Owner: simon
--

CREATE VIEW public.uw_teacher_externalteachersf AS
 SELECT t_teachers.uw_comments,
    t_teachers.uw_email,
    t_externalteachers.uw_externalteacherid,
    t_teachers.uw_firstname,
    t_teachers.uw_id,
    t_teachers.uw_lastname,
    t_teachers.uw_phone
   FROM (public.uw_teacher_teachers t_teachers
     JOIN public.uw_teacher_externalteachers t_externalteachers ON ((t_teachers.uw_id = t_externalteachers.uw_id)));


ALTER TABLE public.uw_teacher_externalteachersf OWNER TO simon;

--
-- Name: uw_teacher_internalteachers; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_teacher_internalteachers (
    uw_internalteacherid bigint NOT NULL,
    uw_id bigint NOT NULL,
    uw_managesinvoices boolean NOT NULL,
    uw_active boolean NOT NULL
);


ALTER TABLE public.uw_teacher_internalteachers OWNER TO simon;

--
-- Name: uw_teacher_internalteachersf; Type: VIEW; Schema: public; Owner: simon
--

CREATE VIEW public.uw_teacher_internalteachersf AS
 SELECT t_internalteachers.uw_active,
    t_teachers.uw_comments,
    t_teachers.uw_email,
    t_teachers.uw_firstname,
    t_teachers.uw_id,
    t_internalteachers.uw_internalteacherid,
    t_teachers.uw_lastname,
    t_internalteachers.uw_managesinvoices,
    t_teachers.uw_phone
   FROM (public.uw_teacher_teachers t_teachers
     JOIN public.uw_teacher_internalteachers t_internalteachers ON ((t_teachers.uw_id = t_internalteachers.uw_id)));


ALTER TABLE public.uw_teacher_internalteachersf OWNER TO simon;

--
-- Name: uw_teacher_teaches; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_teacher_teaches (
    uw_internalteacherid bigint NOT NULL,
    uw_instrumentid bigint NOT NULL
);


ALTER TABLE public.uw_teacher_teaches OWNER TO simon;

--
-- Name: uw_teacher_teachingperiods; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_teacher_teachingperiods (
    uw_time text NOT NULL,
    uw_duration bigint NOT NULL,
    uw_weekday text NOT NULL,
    uw_internalteacherid bigint NOT NULL,
    uw_location text NOT NULL,
    uw_roomid bigint,
    CONSTRAINT uw_teacher_teachingperiods_location_roomid CHECK (((uw_roomid IS NULL) OR ((uw_roomid IS NOT NULL) AND (uw_location = 'RoomS'::text))))
);


ALTER TABLE public.uw_teacher_teachingperiods OWNER TO simon;

--
-- Name: uw_teacherid_external_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_teacherid_external_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_teacherid_external_seq OWNER TO simon;

--
-- Name: uw_teacherid_internal_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_teacherid_internal_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_teacherid_internal_seq OWNER TO simon;

--
-- Name: uw_teacherid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_teacherid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_teacherid_seq OWNER TO simon;

--
-- Name: uw_teacherscanmanageinvoices_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_teacherscanmanageinvoices_tab (
    uw_version bigint NOT NULL,
    uw_value boolean NOT NULL,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_teacherscanmanageinvoices_tab OWNER TO simon;

--
-- Name: uw_teacherscanplan_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_teacherscanplan_tab (
    uw_version bigint NOT NULL,
    uw_value boolean NOT NULL,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_teacherscanplan_tab OWNER TO simon;

--
-- Name: uw_termsurl_tab; Type: TABLE; Schema: public; Owner: simon
--

CREATE TABLE public.uw_termsurl_tab (
    uw_version bigint NOT NULL,
    uw_value text,
    uw_islastversion boolean NOT NULL,
    uw_stamp timestamp without time zone NOT NULL
);


ALTER TABLE public.uw_termsurl_tab OWNER TO simon;

--
-- Name: uw_textnoteid_seq; Type: SEQUENCE; Schema: public; Owner: simon
--

CREATE SEQUENCE public.uw_textnoteid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.uw_textnoteid_seq OWNER TO simon;

--
-- Name: uw_adminaccounts_adminaccounts uw_adminaccounts_adminaccounts_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_adminaccounts_adminaccounts
    ADD CONSTRAINT uw_adminaccounts_adminaccounts_pkey PRIMARY KEY (uw_email);


--
-- Name: uw_ajaxupload_scratch uw_ajaxupload_scratch_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_ajaxupload_scratch
    ADD CONSTRAINT uw_ajaxupload_scratch_pkey PRIMARY KEY (uw_handle);


--
-- Name: uw_config_formulainstruments uw_config_formulainstruments_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_config_formulainstruments
    ADD CONSTRAINT uw_config_formulainstruments_pkey PRIMARY KEY (uw_instrumentid, uw_formulaid);


--
-- Name: uw_config_formulainvoicelines uw_config_formulainvoicelines_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_config_formulainvoicelines
    ADD CONSTRAINT uw_config_formulainvoicelines_pkey PRIMARY KEY (uw_order, uw_formulaid);


--
-- Name: uw_config_formulas uw_config_formulas_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_config_formulas
    ADD CONSTRAINT uw_config_formulas_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_config_holidays uw_config_holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_config_holidays
    ADD CONSTRAINT uw_config_holidays_pkey PRIMARY KEY (uw_periodid, uw_description);


--
-- Name: uw_config_instruments uw_config_instruments_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_config_instruments
    ADD CONSTRAINT uw_config_instruments_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_config_periods uw_config_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_config_periods
    ADD CONSTRAINT uw_config_periods_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_email_attachments uw_email_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_email_attachments
    ADD CONSTRAINT uw_email_attachments_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_email_emails uw_email_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_email_emails
    ADD CONSTRAINT uw_email_emails_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_email_statusses uw_email_statusses_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_email_statusses
    ADD CONSTRAINT uw_email_statusses_pkey PRIMARY KEY (uw_version, uw_emailid);


--
-- Name: uw_evaluation_evaluations uw_evaluation_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_evaluation_evaluations
    ADD CONSTRAINT uw_evaluation_evaluations_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_evaluation_evaluationsections uw_evaluation_evaluationsections_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_evaluation_evaluationsections
    ADD CONSTRAINT uw_evaluation_evaluationsections_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_event_events uw_event_events_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_event_events
    ADD CONSTRAINT uw_event_events_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_lesson_enrollmentrequests uw_lesson_enrollmentrequests_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_enrollmentrequests
    ADD CONSTRAINT uw_lesson_enrollmentrequests_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_lesson_enrollmentsincludingstopped uw_lesson_enrollmentsincludingstopped_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_enrollmentsincludingstopped
    ADD CONSTRAINT uw_lesson_enrollmentsincludingstopped_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_lesson_finance_creditnotes uw_lesson_finance_creditnotes_externalid_unique; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_creditnotes
    ADD CONSTRAINT uw_lesson_finance_creditnotes_externalid_unique UNIQUE (uw_externalid);


--
-- Name: uw_lesson_finance_creditnotes uw_lesson_finance_creditnotes_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_creditnotes
    ADD CONSTRAINT uw_lesson_finance_creditnotes_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_lesson_finance_invoicelines uw_lesson_finance_invoicelines_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_invoicelines
    ADD CONSTRAINT uw_lesson_finance_invoicelines_pkey PRIMARY KEY (uw_order, uw_invoiceid);


--
-- Name: uw_lesson_finance_invoices uw_lesson_finance_invoices_enrollmentid_unique; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_invoices
    ADD CONSTRAINT uw_lesson_finance_invoices_enrollmentid_unique UNIQUE (uw_enrollmentid);


--
-- Name: uw_lesson_finance_invoices uw_lesson_finance_invoices_enrollmentrequestid_unique; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_invoices
    ADD CONSTRAINT uw_lesson_finance_invoices_enrollmentrequestid_unique UNIQUE (uw_enrollmentrequestid);


--
-- Name: uw_lesson_finance_invoices uw_lesson_finance_invoices_externalid_unique; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_invoices
    ADD CONSTRAINT uw_lesson_finance_invoices_externalid_unique UNIQUE (uw_externalid);


--
-- Name: uw_lesson_finance_invoices uw_lesson_finance_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_invoices
    ADD CONSTRAINT uw_lesson_finance_invoices_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_lesson_finance_periodfees uw_lesson_finance_periodfees_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_periodfees
    ADD CONSTRAINT uw_lesson_finance_periodfees_pkey PRIMARY KEY (uw_periodid, uw_studentid);


--
-- Name: uw_lesson_finance_placeholderinvoicelines uw_lesson_finance_placeholderinvoicelines_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_placeholderinvoicelines
    ADD CONSTRAINT uw_lesson_finance_placeholderinvoicelines_pkey PRIMARY KEY (uw_order, uw_placeholderinvoiceid);


--
-- Name: uw_lesson_finance_placeholderinvoices uw_lesson_finance_placeholderinvoices_enrollmentrequestid_uniqu; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_placeholderinvoices
    ADD CONSTRAINT uw_lesson_finance_placeholderinvoices_enrollmentrequestid_uniqu UNIQUE (uw_enrollmentrequestid);


--
-- Name: uw_lesson_finance_placeholderinvoices uw_lesson_finance_placeholderinvoices_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_placeholderinvoices
    ADD CONSTRAINT uw_lesson_finance_placeholderinvoices_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_lesson_finance_requestedoptionalinvoicelines uw_lesson_finance_requestedoptionalinvoicelines_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_requestedoptionalinvoicelines
    ADD CONSTRAINT uw_lesson_finance_requestedoptionalinvoicelines_pkey PRIMARY KEY (uw_amount, uw_enrollmentrequestid, uw_description);


--
-- Name: uw_lesson_holidaysskippedduringplanning uw_lesson_holidaysskippedduringplanning_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_holidaysskippedduringplanning
    ADD CONSTRAINT uw_lesson_holidaysskippedduringplanning_pkey PRIMARY KEY (uw_lessongroupid, uw_date);


--
-- Name: uw_lesson_lessongroupinvoicelines uw_lesson_lessongroupinvoicelines_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_lessongroupinvoicelines
    ADD CONSTRAINT uw_lesson_lessongroupinvoicelines_pkey PRIMARY KEY (uw_order, uw_lessongroupid);


--
-- Name: uw_lesson_lessongroups uw_lesson_lessongroups_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_lessongroups
    ADD CONSTRAINT uw_lesson_lessongroups_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_lesson_lessonsincludingremoved uw_lesson_lessonsincludingremoved_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_lessonsincludingremoved
    ADD CONSTRAINT uw_lesson_lessonsincludingremoved_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_lesson_privateenrollmentrequests uw_lesson_privateenrollmentrequests_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_privateenrollmentrequests
    ADD CONSTRAINT uw_lesson_privateenrollmentrequests_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_lesson_status_studentpresences uw_lesson_status_studentpresences_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_status_studentpresences
    ADD CONSTRAINT uw_lesson_status_studentpresences_pkey PRIMARY KEY (uw_studentid, uw_lessonid);


--
-- Name: uw_message_fullmessagereplies uw_message_fullmessagereplies_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_message_fullmessagereplies
    ADD CONSTRAINT uw_message_fullmessagereplies_pkey PRIMARY KEY (uw_messageid);


--
-- Name: uw_message_messageemails uw_message_messageemails_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_message_messageemails
    ADD CONSTRAINT uw_message_messageemails_pkey PRIMARY KEY (uw_emailid, uw_messageid);


--
-- Name: uw_message_messages uw_message_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_message_messages
    ADD CONSTRAINT uw_message_messages_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_message_repliesformessages uw_message_repliesformessages_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_message_repliesformessages
    ADD CONSTRAINT uw_message_repliesformessages_pkey PRIMARY KEY (uw_replyid);


--
-- Name: uw_messageonstudentprofiles_messageonstudentprofiles uw_messageonstudentprofiles_messageonstudentprofiles_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_messageonstudentprofiles_messageonstudentprofiles
    ADD CONSTRAINT uw_messageonstudentprofiles_messageonstudentprofiles_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_messagequeue_queuedmessages uw_messagequeue_queuedmessages_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_messagequeue_queuedmessages
    ADD CONSTRAINT uw_messagequeue_queuedmessages_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_note_filenotes uw_note_filenotes_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_note_filenotes
    ADD CONSTRAINT uw_note_filenotes_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_note_repliesfornotes uw_note_repliesfornotes_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_note_repliesfornotes
    ADD CONSTRAINT uw_note_repliesfornotes_pkey PRIMARY KEY (uw_replyid);


--
-- Name: uw_note_textnotes uw_note_textnotes_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_note_textnotes
    ADD CONSTRAINT uw_note_textnotes_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_note_viewednotes uw_note_viewednotes_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_note_viewednotes
    ADD CONSTRAINT uw_note_viewednotes_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_payenrollment_onlinepayments uw_payenrollment_onlinepayments_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_payenrollment_onlinepayments
    ADD CONSTRAINT uw_payenrollment_onlinepayments_pkey PRIMARY KEY (uw_paymentid);


--
-- Name: uw_room_roominstruments uw_room_roominstruments_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_room_roominstruments
    ADD CONSTRAINT uw_room_roominstruments_pkey PRIMARY KEY (uw_instrumentid, uw_roomid);


--
-- Name: uw_room_rooms uw_room_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_room_rooms
    ADD CONSTRAINT uw_room_rooms_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_session_credentials uw_session_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_session_credentials
    ADD CONSTRAINT uw_session_credentials_pkey PRIMARY KEY (uw_email);


--
-- Name: uw_session_emailsecret_secrets uw_session_emailsecret_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_session_emailsecret_secrets
    ADD CONSTRAINT uw_session_emailsecret_secrets_pkey PRIMARY KEY (uw_stamp, uw_email);


--
-- Name: uw_session_resettingcredentials uw_session_resettingcredentials_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_session_resettingcredentials
    ADD CONSTRAINT uw_session_resettingcredentials_pkey PRIMARY KEY (uw_email);


--
-- Name: uw_student_family uw_student_family_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_student_family
    ADD CONSTRAINT uw_student_family_pkey PRIMARY KEY (uw_other, uw_subject);


--
-- Name: uw_student_notfamily uw_student_notfamily_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_student_notfamily
    ADD CONSTRAINT uw_student_notfamily_pkey PRIMARY KEY (uw_other, uw_subject);


--
-- Name: uw_student_studentemails uw_student_studentemails_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_student_studentemails
    ADD CONSTRAINT uw_student_studentemails_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_student_studentphones uw_student_studentphones_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_student_studentphones
    ADD CONSTRAINT uw_student_studentphones_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_student_students uw_student_students_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_student_students
    ADD CONSTRAINT uw_student_students_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_teacher_externalteachers uw_teacher_externalteachers_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_teacher_externalteachers
    ADD CONSTRAINT uw_teacher_externalteachers_pkey PRIMARY KEY (uw_externalteacherid);


--
-- Name: uw_teacher_internalteachers uw_teacher_internalteachers_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_teacher_internalteachers
    ADD CONSTRAINT uw_teacher_internalteachers_pkey PRIMARY KEY (uw_internalteacherid);


--
-- Name: uw_teacher_teachers uw_teacher_teachers_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_teacher_teachers
    ADD CONSTRAINT uw_teacher_teachers_pkey PRIMARY KEY (uw_id);


--
-- Name: uw_teacher_teaches uw_teacher_teaches_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_teacher_teaches
    ADD CONSTRAINT uw_teacher_teaches_pkey PRIMARY KEY (uw_instrumentid, uw_internalteacherid);


--
-- Name: uw_teacher_teachingperiods uw_teacher_teachingperiods_pkey; Type: CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_teacher_teachingperiods
    ADD CONSTRAINT uw_teacher_teachingperiods_pkey PRIMARY KEY (uw_time, uw_internalteacherid, uw_weekday);


--
-- Name: enrollments_lessongroupid; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX enrollments_lessongroupid ON public.uw_lesson_enrollmentsincludingstopped USING btree (uw_lessongroupid);


--
-- Name: enrollments_studentid; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX enrollments_studentid ON public.uw_lesson_enrollmentsincludingstopped USING btree (uw_studentid);


--
-- Name: internalteachers_id; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX internalteachers_id ON public.uw_teacher_internalteachers USING btree (uw_id);


--
-- Name: invoicelines_invoiceid; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX invoicelines_invoiceid ON public.uw_lesson_finance_invoicelines USING btree (uw_invoiceid);


--
-- Name: lessongroups_instrumentid; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX lessongroups_instrumentid ON public.uw_lesson_lessongroups USING btree (uw_instrumentid);


--
-- Name: lessongroups_internalteacherid; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX lessongroups_internalteacherid ON public.uw_lesson_lessongroups USING btree (uw_internalteacherid);


--
-- Name: lessongroups_roomid; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX lessongroups_roomid ON public.uw_lesson_lessongroups USING btree (uw_roomid);


--
-- Name: lessongroups_startsinperiod; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX lessongroups_startsinperiod ON public.uw_lesson_lessongroups USING btree (uw_startsinperiod);


--
-- Name: lessongroups_weekday; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX lessongroups_weekday ON public.uw_lesson_lessongroups USING btree (uw_weekday);


--
-- Name: lessonsincludingremoved_date; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX lessonsincludingremoved_date ON public.uw_lesson_lessonsincludingremoved USING btree (uw_date);


--
-- Name: lessonsincludingremoved_lessongroupid; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX lessonsincludingremoved_lessongroupid ON public.uw_lesson_lessonsincludingremoved USING btree (uw_lessongroupid);


--
-- Name: lessonsincludingremoved_teacherid; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX lessonsincludingremoved_teacherid ON public.uw_lesson_lessonsincludingremoved USING btree (uw_teacherid);


--
-- Name: lessonsincludingremoved_teacherid_date; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX lessonsincludingremoved_teacherid_date ON public.uw_lesson_lessonsincludingremoved USING btree (uw_teacherid, uw_date);


--
-- Name: lessonsincludingremoved_teacherid_date_removal; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX lessonsincludingremoved_teacherid_date_removal ON public.uw_lesson_lessonsincludingremoved USING btree (uw_teacherid, uw_date, uw_removedreason);


--
-- Name: messages_with_read; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX messages_with_read ON public.uw_message_messages USING btree (uw_senderadmin, uw_senderteacherid, uw_senderstudentid, uw_receiveradmin, uw_receiverteacherid, uw_receiverstudentid, uw_read);


--
-- Name: payments_invoiceid; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX payments_invoiceid ON public.uw_lesson_finance_payments USING btree (uw_invoiceid);


--
-- Name: statusses_status; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX statusses_status ON public.uw_email_statusses USING btree (uw_status, uw_islastversion) WHERE (uw_islastversion = true);


--
-- Name: statusses_status_ready; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX statusses_status_ready ON public.uw_email_statusses USING btree (uw_status, uw_islastversion) WHERE ((uw_status = 'Ready/_'::text) AND (uw_islastversion = true));


--
-- Name: statusses_status_waiting; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX statusses_status_waiting ON public.uw_email_statusses USING btree (uw_status, uw_islastversion) WHERE ((uw_status = 'Waiting/_'::text) AND (uw_islastversion = true));


--
-- Name: student_up_firstname; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX student_up_firstname ON public.uw_student_students USING btree (upper(uw_firstname));


--
-- Name: student_up_lastname; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX student_up_lastname ON public.uw_student_students USING btree (upper(uw_lastname));


--
-- Name: teacher_up_firstname; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX teacher_up_firstname ON public.uw_teacher_teachers USING btree (upper(uw_firstname));


--
-- Name: teacher_up_lastname; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX teacher_up_lastname ON public.uw_teacher_teachers USING btree (upper(uw_lastname));


--
-- Name: teachers_email; Type: INDEX; Schema: public; Owner: simon
--

CREATE INDEX teachers_email ON public.uw_teacher_teachers USING btree (uw_email);


--
-- Name: uw_email_statusses emails_waiting_trigger; Type: TRIGGER; Schema: public; Owner: simon
--

CREATE TRIGGER emails_waiting_trigger AFTER INSERT ON public.uw_email_statusses FOR EACH ROW WHEN ((new.uw_status = 'Waiting/_'::text)) EXECUTE PROCEDURE public.notify_haskell_emails_waiting();


--
-- Name: uw_lesson_enrollmentrequests uw_lesson_enrollmentrequests_onupdate; Type: TRIGGER; Schema: public; Owner: simon
--

CREATE TRIGGER uw_lesson_enrollmentrequests_onupdate BEFORE UPDATE ON public.uw_lesson_enrollmentrequests FOR EACH ROW EXECUTE PROCEDURE public.enrollmentrequests_set_updated();


--
-- Name: uw_config_formulainstruments uw_config_formulainstruments_formulaid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_config_formulainstruments
    ADD CONSTRAINT uw_config_formulainstruments_formulaid FOREIGN KEY (uw_formulaid) REFERENCES public.uw_config_formulas(uw_id) ON DELETE CASCADE;


--
-- Name: uw_config_formulainstruments uw_config_formulainstruments_instrumentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_config_formulainstruments
    ADD CONSTRAINT uw_config_formulainstruments_instrumentid FOREIGN KEY (uw_instrumentid) REFERENCES public.uw_config_instruments(uw_id) ON DELETE CASCADE;


--
-- Name: uw_config_formulainvoicelines uw_config_formulainvoicelines_formulaid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_config_formulainvoicelines
    ADD CONSTRAINT uw_config_formulainvoicelines_formulaid FOREIGN KEY (uw_formulaid) REFERENCES public.uw_config_formulas(uw_id) ON DELETE CASCADE;


--
-- Name: uw_config_holidays uw_config_holidays_periodid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_config_holidays
    ADD CONSTRAINT uw_config_holidays_periodid FOREIGN KEY (uw_periodid) REFERENCES public.uw_config_periods(uw_id) ON DELETE CASCADE;


--
-- Name: uw_email_attachments uw_email_attachments_emailid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_email_attachments
    ADD CONSTRAINT uw_email_attachments_emailid FOREIGN KEY (uw_emailid) REFERENCES public.uw_email_emails(uw_id) ON DELETE CASCADE;


--
-- Name: uw_email_statusses uw_email_statusses_emailid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_email_statusses
    ADD CONSTRAINT uw_email_statusses_emailid FOREIGN KEY (uw_emailid) REFERENCES public.uw_email_emails(uw_id) ON DELETE CASCADE;


--
-- Name: uw_evaluation_evaluations uw_evaluation_evaluations_enrollmentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_evaluation_evaluations
    ADD CONSTRAINT uw_evaluation_evaluations_enrollmentid FOREIGN KEY (uw_enrollmentid) REFERENCES public.uw_lesson_enrollmentsincludingstopped(uw_id) ON DELETE CASCADE;


--
-- Name: uw_evaluation_evaluationsections uw_evaluation_evaluationsections_evaluationid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_evaluation_evaluationsections
    ADD CONSTRAINT uw_evaluation_evaluationsections_evaluationid FOREIGN KEY (uw_evaluationid) REFERENCES public.uw_evaluation_evaluations(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_enrollmentrequests uw_lesson_enrollmentrequests_lessongroupid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_enrollmentrequests
    ADD CONSTRAINT uw_lesson_enrollmentrequests_lessongroupid FOREIGN KEY (uw_lessongroupid) REFERENCES public.uw_lesson_lessongroups(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_enrollmentrequests uw_lesson_enrollmentrequests_studentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_enrollmentrequests
    ADD CONSTRAINT uw_lesson_enrollmentrequests_studentid FOREIGN KEY (uw_studentid) REFERENCES public.uw_student_students(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_enrollmentsincludingstopped uw_lesson_enrollmentsincludingstopped_lessongroupid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_enrollmentsincludingstopped
    ADD CONSTRAINT uw_lesson_enrollmentsincludingstopped_lessongroupid FOREIGN KEY (uw_lessongroupid) REFERENCES public.uw_lesson_lessongroups(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_enrollmentsincludingstopped uw_lesson_enrollmentsincludingstopped_studentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_enrollmentsincludingstopped
    ADD CONSTRAINT uw_lesson_enrollmentsincludingstopped_studentid FOREIGN KEY (uw_studentid) REFERENCES public.uw_student_students(uw_id) ON DELETE RESTRICT;


--
-- Name: uw_lesson_finance_creditnotes uw_lesson_finance_creditnotes_invoiceid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_creditnotes
    ADD CONSTRAINT uw_lesson_finance_creditnotes_invoiceid FOREIGN KEY (uw_invoiceid) REFERENCES public.uw_lesson_finance_invoices(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_finance_invoicelines uw_lesson_finance_invoicelines_invoiceid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_invoicelines
    ADD CONSTRAINT uw_lesson_finance_invoicelines_invoiceid FOREIGN KEY (uw_invoiceid) REFERENCES public.uw_lesson_finance_invoices(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_finance_payments uw_lesson_finance_payments_invoiceid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_payments
    ADD CONSTRAINT uw_lesson_finance_payments_invoiceid FOREIGN KEY (uw_invoiceid) REFERENCES public.uw_lesson_finance_invoices(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_finance_periodfees uw_lesson_finance_periodfees_studentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_periodfees
    ADD CONSTRAINT uw_lesson_finance_periodfees_studentid FOREIGN KEY (uw_studentid) REFERENCES public.uw_student_students(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_finance_placeholderinvoicelines uw_lesson_finance_placeholderinvoicelines_placeholderinvoiceid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_placeholderinvoicelines
    ADD CONSTRAINT uw_lesson_finance_placeholderinvoicelines_placeholderinvoiceid FOREIGN KEY (uw_placeholderinvoiceid) REFERENCES public.uw_lesson_finance_placeholderinvoices(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_finance_requestedoptionalinvoicelines uw_lesson_finance_requestedoptionalinvoicelines_enrollmentreque; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_finance_requestedoptionalinvoicelines
    ADD CONSTRAINT uw_lesson_finance_requestedoptionalinvoicelines_enrollmentreque FOREIGN KEY (uw_enrollmentrequestid) REFERENCES public.uw_lesson_enrollmentrequests(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_holidaysskippedduringplanning uw_lesson_holidaysskippedduringplanning_lessongroupid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_holidaysskippedduringplanning
    ADD CONSTRAINT uw_lesson_holidaysskippedduringplanning_lessongroupid FOREIGN KEY (uw_lessongroupid) REFERENCES public.uw_lesson_lessongroups(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_lessongroupinvoicelines uw_lesson_lessongroupinvoicelines_lessongroupid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_lessongroupinvoicelines
    ADD CONSTRAINT uw_lesson_lessongroupinvoicelines_lessongroupid FOREIGN KEY (uw_lessongroupid) REFERENCES public.uw_lesson_lessongroups(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_lessongroups uw_lesson_lessongroups_complement; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_lessongroups
    ADD CONSTRAINT uw_lesson_lessongroups_complement FOREIGN KEY (uw_complement) REFERENCES public.uw_lesson_lessongroups(uw_id) ON DELETE SET NULL;


--
-- Name: uw_lesson_lessongroups uw_lesson_lessongroups_formulaid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_lessongroups
    ADD CONSTRAINT uw_lesson_lessongroups_formulaid FOREIGN KEY (uw_formulaid) REFERENCES public.uw_config_formulas(uw_id) ON DELETE RESTRICT;


--
-- Name: uw_lesson_lessongroups uw_lesson_lessongroups_instrumentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_lessongroups
    ADD CONSTRAINT uw_lesson_lessongroups_instrumentid FOREIGN KEY (uw_instrumentid) REFERENCES public.uw_config_instruments(uw_id) ON DELETE RESTRICT;


--
-- Name: uw_lesson_lessongroups uw_lesson_lessongroups_internalteacherid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_lessongroups
    ADD CONSTRAINT uw_lesson_lessongroups_internalteacherid FOREIGN KEY (uw_internalteacherid) REFERENCES public.uw_teacher_internalteachers(uw_internalteacherid) ON DELETE RESTRICT;


--
-- Name: uw_lesson_lessongroups uw_lesson_lessongroups_roomid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_lessongroups
    ADD CONSTRAINT uw_lesson_lessongroups_roomid FOREIGN KEY (uw_roomid) REFERENCES public.uw_room_rooms(uw_id) ON DELETE SET NULL;


--
-- Name: uw_lesson_lessongroups uw_lesson_lessongroups_startsinperiod; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_lessongroups
    ADD CONSTRAINT uw_lesson_lessongroups_startsinperiod FOREIGN KEY (uw_startsinperiod) REFERENCES public.uw_config_periods(uw_id) ON DELETE RESTRICT;


--
-- Name: uw_lesson_lessonsincludingremoved uw_lesson_lessonsincludingremoved_lessongroupid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_lessonsincludingremoved
    ADD CONSTRAINT uw_lesson_lessonsincludingremoved_lessongroupid FOREIGN KEY (uw_lessongroupid) REFERENCES public.uw_lesson_lessongroups(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_lessonsincludingremoved uw_lesson_lessonsincludingremoved_roomid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_lessonsincludingremoved
    ADD CONSTRAINT uw_lesson_lessonsincludingremoved_roomid FOREIGN KEY (uw_roomid) REFERENCES public.uw_room_rooms(uw_id) ON DELETE SET NULL;


--
-- Name: uw_lesson_lessonsincludingremoved uw_lesson_lessonsincludingremoved_teacherid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_lessonsincludingremoved
    ADD CONSTRAINT uw_lesson_lessonsincludingremoved_teacherid FOREIGN KEY (uw_teacherid) REFERENCES public.uw_teacher_teachers(uw_id) ON DELETE RESTRICT;


--
-- Name: uw_lesson_privateenrollmentrequests uw_lesson_privateenrollmentrequests_enrollmentrequestid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_privateenrollmentrequests
    ADD CONSTRAINT uw_lesson_privateenrollmentrequests_enrollmentrequestid FOREIGN KEY (uw_enrollmentrequestid) REFERENCES public.uw_lesson_enrollmentrequests(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_privateenrollmentrequests uw_lesson_privateenrollmentrequests_formulaid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_privateenrollmentrequests
    ADD CONSTRAINT uw_lesson_privateenrollmentrequests_formulaid FOREIGN KEY (uw_formulaid) REFERENCES public.uw_config_formulas(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_privateenrollmentrequests uw_lesson_privateenrollmentrequests_instrumentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_privateenrollmentrequests
    ADD CONSTRAINT uw_lesson_privateenrollmentrequests_instrumentid FOREIGN KEY (uw_instrumentid) REFERENCES public.uw_config_instruments(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_privateenrollmentrequests uw_lesson_privateenrollmentrequests_internalteacherid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_privateenrollmentrequests
    ADD CONSTRAINT uw_lesson_privateenrollmentrequests_internalteacherid FOREIGN KEY (uw_internalteacherid) REFERENCES public.uw_teacher_internalteachers(uw_internalteacherid) ON DELETE CASCADE;


--
-- Name: uw_lesson_privateenrollmentrequests uw_lesson_privateenrollmentrequests_startsinperiod; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_privateenrollmentrequests
    ADD CONSTRAINT uw_lesson_privateenrollmentrequests_startsinperiod FOREIGN KEY (uw_startsinperiod) REFERENCES public.uw_config_periods(uw_id) ON DELETE RESTRICT;


--
-- Name: uw_lesson_status_studentpresences uw_lesson_status_studentpresences_lessonid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_status_studentpresences
    ADD CONSTRAINT uw_lesson_status_studentpresences_lessonid FOREIGN KEY (uw_lessonid) REFERENCES public.uw_lesson_lessonsincludingremoved(uw_id) ON DELETE CASCADE;


--
-- Name: uw_lesson_status_studentpresences uw_lesson_status_studentpresences_studentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_lesson_status_studentpresences
    ADD CONSTRAINT uw_lesson_status_studentpresences_studentid FOREIGN KEY (uw_studentid) REFERENCES public.uw_student_students(uw_id) ON DELETE CASCADE;


--
-- Name: uw_message_messageemails uw_message_messageemails_emailid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_message_messageemails
    ADD CONSTRAINT uw_message_messageemails_emailid FOREIGN KEY (uw_emailid) REFERENCES public.uw_email_emails(uw_id) ON DELETE CASCADE;


--
-- Name: uw_message_messageemails uw_message_messageemails_messageid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_message_messageemails
    ADD CONSTRAINT uw_message_messageemails_messageid FOREIGN KEY (uw_messageid) REFERENCES public.uw_message_messages(uw_id) ON DELETE CASCADE;


--
-- Name: uw_message_messages uw_message_messages_receiverstudentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_message_messages
    ADD CONSTRAINT uw_message_messages_receiverstudentid FOREIGN KEY (uw_receiverstudentid) REFERENCES public.uw_student_students(uw_id) ON DELETE CASCADE;


--
-- Name: uw_message_messages uw_message_messages_receiverteacherid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_message_messages
    ADD CONSTRAINT uw_message_messages_receiverteacherid FOREIGN KEY (uw_receiverteacherid) REFERENCES public.uw_teacher_teachers(uw_id) ON DELETE CASCADE;


--
-- Name: uw_message_messages uw_message_messages_senderstudentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_message_messages
    ADD CONSTRAINT uw_message_messages_senderstudentid FOREIGN KEY (uw_senderstudentid) REFERENCES public.uw_student_students(uw_id) ON DELETE CASCADE;


--
-- Name: uw_message_messages uw_message_messages_senderteacherid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_message_messages
    ADD CONSTRAINT uw_message_messages_senderteacherid FOREIGN KEY (uw_senderteacherid) REFERENCES public.uw_teacher_teachers(uw_id) ON DELETE CASCADE;


--
-- Name: uw_message_repliesformessages uw_message_repliesformessages_messageid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_message_repliesformessages
    ADD CONSTRAINT uw_message_repliesformessages_messageid FOREIGN KEY (uw_messageid) REFERENCES public.uw_message_messages(uw_id) ON DELETE CASCADE;


--
-- Name: uw_note_filenotes uw_note_filenotes_lessonid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_note_filenotes
    ADD CONSTRAINT uw_note_filenotes_lessonid FOREIGN KEY (uw_lessonid) REFERENCES public.uw_lesson_lessonsincludingremoved(uw_id) ON DELETE CASCADE;


--
-- Name: uw_note_filenotes uw_note_filenotes_studentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_note_filenotes
    ADD CONSTRAINT uw_note_filenotes_studentid FOREIGN KEY (uw_studentid) REFERENCES public.uw_student_students(uw_id) ON DELETE CASCADE;


--
-- Name: uw_note_filenotes uw_note_filenotes_teacherid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_note_filenotes
    ADD CONSTRAINT uw_note_filenotes_teacherid FOREIGN KEY (uw_teacherid) REFERENCES public.uw_teacher_teachers(uw_id) ON DELETE CASCADE;


--
-- Name: uw_note_repliesfornotes uw_note_repliesfornotes_lessonid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_note_repliesfornotes
    ADD CONSTRAINT uw_note_repliesfornotes_lessonid FOREIGN KEY (uw_lessonid) REFERENCES public.uw_lesson_lessonsincludingremoved(uw_id) ON DELETE CASCADE;


--
-- Name: uw_note_repliesfornotes uw_note_repliesfornotes_studentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_note_repliesfornotes
    ADD CONSTRAINT uw_note_repliesfornotes_studentid FOREIGN KEY (uw_studentid) REFERENCES public.uw_student_students(uw_id) ON DELETE CASCADE;


--
-- Name: uw_note_repliesfornotes uw_note_repliesfornotes_teacherid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_note_repliesfornotes
    ADD CONSTRAINT uw_note_repliesfornotes_teacherid FOREIGN KEY (uw_teacherid) REFERENCES public.uw_teacher_teachers(uw_id) ON DELETE CASCADE;


--
-- Name: uw_note_textnotes uw_note_textnotes_lessonid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_note_textnotes
    ADD CONSTRAINT uw_note_textnotes_lessonid FOREIGN KEY (uw_lessonid) REFERENCES public.uw_lesson_lessonsincludingremoved(uw_id) ON DELETE CASCADE;


--
-- Name: uw_note_textnotes uw_note_textnotes_studentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_note_textnotes
    ADD CONSTRAINT uw_note_textnotes_studentid FOREIGN KEY (uw_studentid) REFERENCES public.uw_student_students(uw_id) ON DELETE CASCADE;


--
-- Name: uw_note_textnotes uw_note_textnotes_teacherid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_note_textnotes
    ADD CONSTRAINT uw_note_textnotes_teacherid FOREIGN KEY (uw_teacherid) REFERENCES public.uw_teacher_teachers(uw_id) ON DELETE CASCADE;


--
-- Name: uw_note_viewednotes uw_note_viewednotes_lessongroupid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_note_viewednotes
    ADD CONSTRAINT uw_note_viewednotes_lessongroupid FOREIGN KEY (uw_lessongroupid) REFERENCES public.uw_lesson_lessongroups(uw_id) ON DELETE CASCADE;


--
-- Name: uw_note_viewednotes uw_note_viewednotes_studentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_note_viewednotes
    ADD CONSTRAINT uw_note_viewednotes_studentid FOREIGN KEY (uw_studentid) REFERENCES public.uw_student_students(uw_id) ON DELETE CASCADE;


--
-- Name: uw_note_viewednotes uw_note_viewednotes_teacherid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_note_viewednotes
    ADD CONSTRAINT uw_note_viewednotes_teacherid FOREIGN KEY (uw_teacherid) REFERENCES public.uw_teacher_teachers(uw_id) ON DELETE CASCADE;


--
-- Name: uw_room_roominstruments uw_room_roominstruments_instrumentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_room_roominstruments
    ADD CONSTRAINT uw_room_roominstruments_instrumentid FOREIGN KEY (uw_instrumentid) REFERENCES public.uw_config_instruments(uw_id) ON DELETE CASCADE;


--
-- Name: uw_room_roominstruments uw_room_roominstruments_roomid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_room_roominstruments
    ADD CONSTRAINT uw_room_roominstruments_roomid FOREIGN KEY (uw_roomid) REFERENCES public.uw_room_rooms(uw_id) ON DELETE CASCADE;


--
-- Name: uw_student_family uw_student_family_other; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_student_family
    ADD CONSTRAINT uw_student_family_other FOREIGN KEY (uw_other) REFERENCES public.uw_student_students(uw_id) ON DELETE CASCADE;


--
-- Name: uw_student_family uw_student_family_subject; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_student_family
    ADD CONSTRAINT uw_student_family_subject FOREIGN KEY (uw_subject) REFERENCES public.uw_student_students(uw_id) ON DELETE CASCADE;


--
-- Name: uw_student_notfamily uw_student_notfamily_other; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_student_notfamily
    ADD CONSTRAINT uw_student_notfamily_other FOREIGN KEY (uw_other) REFERENCES public.uw_student_students(uw_id) ON DELETE CASCADE;


--
-- Name: uw_student_notfamily uw_student_notfamily_subject; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_student_notfamily
    ADD CONSTRAINT uw_student_notfamily_subject FOREIGN KEY (uw_subject) REFERENCES public.uw_student_students(uw_id) ON DELETE CASCADE;


--
-- Name: uw_student_studentemails uw_student_studentemails_studentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_student_studentemails
    ADD CONSTRAINT uw_student_studentemails_studentid FOREIGN KEY (uw_studentid) REFERENCES public.uw_student_students(uw_id) ON DELETE CASCADE;


--
-- Name: uw_student_studentphones uw_student_studentphones_studentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_student_studentphones
    ADD CONSTRAINT uw_student_studentphones_studentid FOREIGN KEY (uw_studentid) REFERENCES public.uw_student_students(uw_id) ON DELETE CASCADE;


--
-- Name: uw_teacher_externalteachers uw_teacher_externalteachers_exttoteacherid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_teacher_externalteachers
    ADD CONSTRAINT uw_teacher_externalteachers_exttoteacherid FOREIGN KEY (uw_id) REFERENCES public.uw_teacher_teachers(uw_id) ON DELETE CASCADE;


--
-- Name: uw_teacher_internalteachers uw_teacher_internalteachers_inttoteacherid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_teacher_internalteachers
    ADD CONSTRAINT uw_teacher_internalteachers_inttoteacherid FOREIGN KEY (uw_id) REFERENCES public.uw_teacher_teachers(uw_id) ON DELETE CASCADE;


--
-- Name: uw_teacher_teaches uw_teacher_teaches_instrumentid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_teacher_teaches
    ADD CONSTRAINT uw_teacher_teaches_instrumentid FOREIGN KEY (uw_instrumentid) REFERENCES public.uw_config_instruments(uw_id) ON DELETE CASCADE;


--
-- Name: uw_teacher_teaches uw_teacher_teaches_internalteacherid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_teacher_teaches
    ADD CONSTRAINT uw_teacher_teaches_internalteacherid FOREIGN KEY (uw_internalteacherid) REFERENCES public.uw_teacher_internalteachers(uw_internalteacherid) ON DELETE CASCADE;


--
-- Name: uw_teacher_teachingperiods uw_teacher_teachingperiods_internalteacherid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_teacher_teachingperiods
    ADD CONSTRAINT uw_teacher_teachingperiods_internalteacherid FOREIGN KEY (uw_internalteacherid) REFERENCES public.uw_teacher_internalteachers(uw_internalteacherid) ON DELETE CASCADE;


--
-- Name: uw_teacher_teachingperiods uw_teacher_teachingperiods_roomid; Type: FK CONSTRAINT; Schema: public; Owner: simon
--

ALTER TABLE ONLY public.uw_teacher_teachingperiods
    ADD CONSTRAINT uw_teacher_teachingperiods_roomid FOREIGN KEY (uw_roomid) REFERENCES public.uw_room_rooms(uw_id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

