
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SEQUENCE uw_AjaxUpload_handles;

CREATE TABLE uw_AjaxUpload_scratch(
    uw_handle int8 NOT NULL,
    uw_filename text,
    uw_mimetype text NOT NULL,
    uw_content bytea NOT NULL,
    uw_created timestamp NOT NULL,
    CONSTRAINT uw_AjaxUpload_scratch_pkey PRIMARY KEY (uw_handle));

CREATE TABLE uw_Teacherscanplan_tab(
    uw_version int8 NOT NULL,
    uw_value bool NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE SEQUENCE uw_Monitoring_seq;

CREATE TABLE uw_Monitoring_errors(
    uw_id int8 NOT NULL,
    uw_message text NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE SEQUENCE uw_CreditnoteId_seq;

CREATE SEQUENCE uw_EnrollmentId_seq;

CREATE SEQUENCE uw_InvoiceId_seq;

CREATE SEQUENCE uw_PlaceholderInvoiceId_seq;

CREATE SEQUENCE uw_LessonId_seq;

CREATE SEQUENCE uw_LessongroupId_seq;

CREATE SEQUENCE uw_TextnoteId_seq;

CREATE SEQUENCE uw_FilenoteId_seq;

CREATE SEQUENCE uw_EnrollmentrequestId_seq;

CREATE SEQUENCE uw_EnrollmentrequestPrivateId_seq;

CREATE SEQUENCE uw_EmailId_seq;

CREATE SEQUENCE uw_EvaluationId_seq;

CREATE SEQUENCE uw_ReplyId_seq;

CREATE TABLE uw_Allowhomeandonlinelocations_tab(
    uw_version int8 NOT NULL,
    uw_value bool NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Oauth_authorizerequests(
    uw_stamp timestamp NOT NULL,
    uw_csrftoken text NOT NULL);

CREATE TABLE uw_Oauth_accesstokens(
    uw_refreshtoken text NOT NULL,
    uw_accesstoken text NOT NULL,
    uw_createdat timestamp NOT NULL,
    uw_expiresin int8 NOT NULL,
    CONSTRAINT uw_Oauth_accesstokens_pkey PRIMARY KEY (uw_refreshToken));

CREATE TABLE uw_B2bucket_ID_tab(
    uw_version int8 NOT NULL,
    uw_value text NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_B2bucket_Name__tab(
    uw_version int8 NOT NULL,
    uw_value text NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Invoiceduedate_tab(
    uw_version int8 NOT NULL,
    uw_value int8 NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Invoicepayduringenrollment_tab(
    uw_version int8 NOT NULL,
    uw_value bool NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Periodfeeduedate_tab(
    uw_version int8 NOT NULL,
    uw_value text NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Periodfeepayduringenrollment_tab(
    uw_version int8 NOT NULL,
    uw_value bool NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Teacherscanmanageinvoices_tab(
    uw_version int8 NOT NULL,
    uw_value bool NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Alwaysshowwireinstructions_tab(
    uw_version int8 NOT NULL,
    uw_value bool NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE SEQUENCE uw_Audit_trails;

CREATE TABLE uw_Audit_trail(
    uw_id int8 NOT NULL,
    uw_useremail text NOT NULL,
    uw_type_ text NOT NULL,
    uw_description text NOT NULL,
    uw_extratechnicalinfo text NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE SEQUENCE uw_Teacherid_seq;

CREATE SEQUENCE uw_Teacherid_internal_seq;

CREATE SEQUENCE uw_Teacherid_external_seq;

CREATE SEQUENCE uw_Studentid_seq;

CREATE SEQUENCE uw_Messageonstudentprofiles_MessageonstudentprofileId_seq;

CREATE TABLE uw_Messageonstudentprofiles_messageonstudentprofiles(
    uw_id int8 NOT NULL,
    uw_html text NOT NULL,
    uw_text text NOT NULL,
    uw_savedon timestamp NOT NULL,
    uw_islastversion bool NOT NULL,
    CONSTRAINT uw_Messageonstudentprofiles_messageonstudentprofiles_pkey
    PRIMARY KEY (uw_id));

CREATE TABLE uw_Demoinstance_tab(
    uw_version int8 NOT NULL,
    uw_value bool NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Schoolname_SchoolnameSetting_tab(
    uw_version int8 NOT NULL,
    uw_value text NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Schoolcountry_Schoolcountryserialized_tab(
    uw_version int8 NOT NULL,
    uw_value text NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Adminaccounts_adminaccounts(
    uw_email text NOT NULL,
    uw_wantsnotificationsformessages bool NOT NULL,
    uw_wantsccfornotes bool NOT NULL,
    uw_wantsccformessages bool NOT NULL,
    uw_sawwelcome bool NOT NULL,
    CONSTRAINT uw_Adminaccounts_adminaccounts_pkey PRIMARY KEY (uw_email));

CREATE TABLE uw_Schoolhours_Schoolhoursserialized_tab(
    uw_version int8 NOT NULL,
    uw_value text NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Periodfee_tab(
    uw_version int8 NOT NULL,
    uw_value float8 NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Periodfeefamilydiscount_tab(
    uw_version int8 NOT NULL,
    uw_value float8 NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Schoolurl_tab(
    uw_version int8 NOT NULL,
    uw_value text NOT NULL,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Schoolaccount_tab(
    uw_version int8 NOT NULL,
    uw_value text,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Generalemail_tab(
    uw_version int8 NOT NULL,
    uw_value text,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Termsurl_tab(
    uw_version int8 NOT NULL,
    uw_value text,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Invoicedetails_tab(
    uw_version int8 NOT NULL,
    uw_value text,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Mollierefreshtoken_tab(
    uw_version int8 NOT NULL,
    uw_value text,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE TABLE uw_Mollieprofileid_tab(
    uw_version int8 NOT NULL,
    uw_value text,
    uw_islastversion bool NOT NULL,
    uw_stamp timestamp NOT NULL);

CREATE SEQUENCE uw_Config_periodsSeq;

CREATE TABLE uw_Config_periods(
    uw_id int8 NOT NULL,
    uw_firstday date NOT NULL,
    uw_lastday date NOT NULL,
    uw_lastdaytoenroll date NOT NULL,
    CONSTRAINT uw_Config_periods_pkey PRIMARY KEY (uw_id));

CREATE TABLE uw_Config_holidays(
    uw_description text NOT NULL,
    uw_periodid int8 NOT NULL,
    uw_firstday date NOT NULL,
    uw_lastday date NOT NULL,
    CONSTRAINT uw_Config_holidays_pkey PRIMARY KEY
    (uw_periodId, uw_description),
    CONSTRAINT uw_Config_holidays_PeriodId
    FOREIGN KEY (uw_periodId) REFERENCES uw_Config_periods (uw_id) ON DELETE CASCADE);

CREATE TABLE uw_Config_instruments(
    uw_description text NOT NULL,
    uw_id int8 NOT NULL,
    uw_showonpublicplanning bool NOT NULL,
    CONSTRAINT uw_Config_instruments_pkey PRIMARY KEY (uw_id));

CREATE SEQUENCE uw_Config_instrumentsSeq;

CREATE SEQUENCE uw_Config_formulasSeq;

CREATE TABLE uw_Config_formulas(
    uw_numberoflessons int8 NOT NULL,
    uw_lessonduration int8 NOT NULL,
    uw_startsfromperiod bool NOT NULL,
    uw_manualplanning bool NOT NULL,
    uw_description text NOT NULL,
    uw_comments text NOT NULL,
    uw_showonpublicplanning bool NOT NULL,
    uw_type_ text NOT NULL,
    uw_id int8 NOT NULL,
    uw_color text NOT NULL,
    CONSTRAINT uw_Config_formulas_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Config_formulas_NumberOfLessons
    CHECK (uw_numberOfLessons > 0::int8),
    CONSTRAINT uw_Config_formulas_LessonDuration
    CHECK ((uw_lessonDuration = 20::int8) OR ((uw_lessonDuration = 30::int8) OR ((uw_lessonDuration = 40::int8) OR ((uw_lessonDuration = 45::int8) OR ((uw_lessonDuration = 60::int8) OR ((uw_lessonDuration = 90::int8) OR ((uw_lessonDuration = 120::int8) OR ((uw_lessonDuration = 150::int8) OR (uw_lessonDuration = 180::int8))))))))));

CREATE TABLE uw_Config_formulainvoicelines(
    uw_formulaid int8 NOT NULL,
    uw_type_ text NOT NULL,
    uw_description text NOT NULL,
    uw_amount float8 NOT NULL,
    uw_vat float8 NOT NULL,
    uw_order int8 NOT NULL,
    CONSTRAINT uw_Config_formulainvoicelines_pkey PRIMARY KEY
    (uw_order, uw_formulaId),
    CONSTRAINT uw_Config_formulainvoicelines_FormulaId
    FOREIGN KEY (uw_formulaId) REFERENCES uw_Config_formulas (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Config_formulainvoicelines_VAT CHECK (uw_vAT >= 0::float8),
    CONSTRAINT uw_Config_formulainvoicelines_Order CHECK (uw_order >= 0::int8));

CREATE TABLE uw_Config_formulainstruments(
    uw_formulaid int8 NOT NULL,
    uw_instrumentid int8 NOT NULL,
    CONSTRAINT uw_Config_formulainstruments_pkey PRIMARY KEY
    (uw_instrumentId, uw_formulaId),
    CONSTRAINT uw_Config_formulainstruments_FormulaId
    FOREIGN KEY (uw_formulaId) REFERENCES uw_Config_formulas (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Config_formulainstruments_InstrumentId
    FOREIGN KEY (uw_instrumentId) REFERENCES uw_Config_instruments (uw_id) ON DELETE CASCADE);

CREATE SEQUENCE uw_Room_roomsseq;

CREATE TABLE uw_Room_rooms(
    uw_id int8 NOT NULL,
    uw_description text NOT NULL,
    CONSTRAINT uw_Room_rooms_pkey PRIMARY KEY (uw_id));

CREATE TABLE uw_Room_roominstruments(
    uw_roomid int8 NOT NULL,
    uw_instrumentid int8 NOT NULL,
    CONSTRAINT uw_Room_roominstruments_pkey PRIMARY KEY
    (uw_instrumentId, uw_roomId),
    CONSTRAINT uw_Room_roominstruments_RoomId
    FOREIGN KEY (uw_roomId) REFERENCES uw_Room_rooms (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Room_roominstruments_InstrumentId
    FOREIGN KEY (uw_instrumentId) REFERENCES uw_Config_instruments (uw_id) ON DELETE CASCADE);

CREATE TABLE uw_Teacher_teachers(
    uw_id int8 NOT NULL,
    uw_firstname text NOT NULL,
    uw_lastname text NOT NULL,
    uw_comments text NOT NULL,
    uw_email text NOT NULL,
    uw_phone text NOT NULL,
    uw_wantsnotificationsformessages bool NOT NULL,
    uw_wantsnotificationsfornotes bool NOT NULL,
    CONSTRAINT uw_Teacher_teachers_pkey PRIMARY KEY (uw_id));

CREATE TABLE uw_Teacher_internalTeachers(
    uw_internalteacherid int8 NOT NULL,
    uw_id int8 NOT NULL,
    uw_managesinvoices bool NOT NULL,
    uw_active bool NOT NULL,
    CONSTRAINT uw_Teacher_internalTeachers_pkey PRIMARY KEY
    (uw_internalTeacherId),
    CONSTRAINT uw_Teacher_internalTeachers_IntToTeacherId
    FOREIGN KEY (uw_id) REFERENCES uw_Teacher_teachers (uw_id) ON DELETE CASCADE);

CREATE TABLE uw_Teacher_externalTeachers(
    uw_externalteacherid int8 NOT NULL,
    uw_id int8 NOT NULL,
    CONSTRAINT uw_Teacher_externalTeachers_pkey PRIMARY KEY
    (uw_externalTeacherId),
    CONSTRAINT uw_Teacher_externalTeachers_ExtToTeacherId
    FOREIGN KEY (uw_id) REFERENCES uw_Teacher_teachers (uw_id) ON DELETE CASCADE);

CREATE TABLE uw_Teacher_teachingPeriods(
    uw_time time NOT NULL,
    uw_duration int8 NOT NULL,
    uw_weekday text NOT NULL,
    uw_internalteacherid int8 NOT NULL,
    uw_location text NOT NULL,
    uw_roomid int8,
    CONSTRAINT uw_Teacher_teachingPeriods_pkey PRIMARY KEY
    (uw_time, uw_internalTeacherId, uw_weekday),
    CONSTRAINT uw_Teacher_teachingPeriods_InternalTeacherId
    FOREIGN KEY (uw_internalTeacherId) REFERENCES uw_Teacher_internalTeachers (uw_internalTeacherId) ON DELETE CASCADE,
    CONSTRAINT uw_Teacher_teachingPeriods_RoomId
    FOREIGN KEY (uw_roomId) REFERENCES uw_Room_rooms (uw_id) ON DELETE SET NULL);

CREATE TABLE uw_Teacher_teaches(
    uw_internalteacherid int8 NOT NULL,
    uw_instrumentid int8 NOT NULL,
    CONSTRAINT uw_Teacher_teaches_pkey PRIMARY KEY
    (uw_instrumentId, uw_internalTeacherId),
    CONSTRAINT uw_Teacher_teaches_InstrumentId
    FOREIGN KEY (uw_instrumentId) REFERENCES uw_Config_instruments (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Teacher_teaches_InternalTeacherId
    FOREIGN KEY (uw_internalTeacherId) REFERENCES uw_Teacher_internalTeachers (uw_internalTeacherId) ON DELETE CASCADE);

CREATE VIEW
uw_Teacher_internalTeachersF
AS
SELECT T_InternalTeachers.uw_active AS uw_Active, T_Teachers.uw_comments AS uw_Comments, T_Teachers.uw_email AS uw_Email, T_Teachers.uw_firstName AS uw_FirstName, T_Teachers.uw_id AS uw_Id, T_InternalTeachers.uw_internalTeacherId AS uw_InternalTeacherId, T_Teachers.uw_lastName AS uw_LastName, T_InternalTeachers.uw_managesInvoices AS uw_ManagesInvoices, T_Teachers.uw_phone AS uw_Phone FROM uw_Teacher_teachers AS T_Teachers JOIN uw_Teacher_internalTeachers AS T_InternalTeachers ON (T_Teachers.uw_id = T_InternalTeachers.uw_id);

CREATE VIEW
uw_Teacher_externalTeachersF
AS
SELECT T_Teachers.uw_comments AS uw_Comments, T_Teachers.uw_email AS uw_Email, T_ExternalTeachers.uw_externalTeacherId AS uw_ExternalTeacherId, T_Teachers.uw_firstName AS uw_FirstName, T_Teachers.uw_id AS uw_Id, T_Teachers.uw_lastName AS uw_LastName, T_Teachers.uw_phone AS uw_Phone FROM uw_Teacher_teachers AS T_Teachers JOIN uw_Teacher_externalTeachers AS T_ExternalTeachers ON (T_Teachers.uw_id = T_ExternalTeachers.uw_id);

CREATE DOMAIN studentid AS int8;

CREATE TABLE uw_Student_students(
    uw_id studentid NOT NULL,
    uw_firstname text NOT NULL,
    uw_lastname text NOT NULL,
    uw_comments text NOT NULL,
    uw_birthday date,
    uw_street text NOT NULL,
    uw_number text NOT NULL,
    uw_bus text NOT NULL,
    uw_zip text NOT NULL,
    uw_city text NOT NULL,
    CONSTRAINT uw_Student_students_pkey PRIMARY KEY (uw_id));

CREATE TABLE uw_Student_studentphones(
    uw_id int8 NOT NULL,
    uw_studentid studentid NOT NULL,
    uw_number text NOT NULL,
    uw_description text,
    CONSTRAINT uw_Student_studentphones_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Student_studentphones_StudentId
    FOREIGN KEY (uw_studentId) REFERENCES uw_Student_students (uw_id) ON DELETE CASCADE);

CREATE SEQUENCE uw_Student_studentphonesSeq;

CREATE TABLE uw_Student_studentemails(
    uw_id int8 NOT NULL,
    uw_studentid studentid NOT NULL,
    uw_email text NOT NULL,
    uw_wantsnotificationsformessages bool NOT NULL,
    uw_wantsnotificationsfornotes bool NOT NULL,
    CONSTRAINT uw_Student_studentemails_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Student_studentemails_StudentId
    FOREIGN KEY (uw_studentId) REFERENCES uw_Student_students (uw_id) ON DELETE CASCADE);

CREATE SEQUENCE uw_Student_studentemailsSeq;

CREATE TABLE uw_Student_family(
    uw_subject int8 NOT NULL,
    uw_relation text NOT NULL,
    uw_other int8 NOT NULL,
    CONSTRAINT uw_Student_family_pkey PRIMARY KEY (uw_other, uw_subject),
    CONSTRAINT uw_Student_family_Subject
    FOREIGN KEY (uw_subject) REFERENCES uw_Student_students (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Student_family_Other
    FOREIGN KEY (uw_other) REFERENCES uw_Student_students (uw_id) ON DELETE CASCADE);

CREATE TABLE uw_Student_notfamily(
    uw_subject int8 NOT NULL,
    uw_other int8 NOT NULL,
    CONSTRAINT uw_Student_notfamily_pkey PRIMARY KEY (uw_other, uw_subject),
    CONSTRAINT uw_Student_notfamily_Subject
    FOREIGN KEY (uw_subject) REFERENCES uw_Student_students (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Student_notfamily_Other
    FOREIGN KEY (uw_other) REFERENCES uw_Student_students (uw_id) ON DELETE CASCADE);

CREATE SEQUENCE uw_Messagequeue_seq;

CREATE TABLE uw_Messagequeue_queuedMessages(
    uw_id int8 NOT NULL,
    uw_content text NOT NULL,
    CONSTRAINT uw_Messagequeue_queuedMessages_pkey PRIMARY KEY (uw_id));

CREATE SEQUENCE uw_Email_AttachmentId_seq;

CREATE TABLE uw_Email_emails(
    uw_id int8 NOT NULL,
    uw_externalid text NOT NULL,
    uw_address text NOT NULL,
    uw_addressee text NOT NULL,
    uw_subject text NOT NULL,
    uw_text text NOT NULL,
    uw_html text,
    uw_from text NOT NULL,
    uw_replyto text,
    CONSTRAINT uw_Email_emails_pkey PRIMARY KEY (uw_id));

CREATE TABLE uw_Email_attachments(
    uw_id int8 NOT NULL,
    uw_emailid int8 NOT NULL,
    uw_filename text NOT NULL,
    uw_content bytea NOT NULL,
    CONSTRAINT uw_Email_attachments_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Email_attachments_EmailId
    FOREIGN KEY (uw_emailId) REFERENCES uw_Email_emails (uw_id) ON DELETE CASCADE);

CREATE TABLE uw_Email_statusses(
    uw_emailid int8 NOT NULL,
    uw_version int8 NOT NULL,
    uw_status text NOT NULL,
    uw_stamp timestamp NOT NULL,
    uw_islastversion bool NOT NULL,
    CONSTRAINT uw_Email_statusses_pkey PRIMARY KEY (uw_version, uw_emailId),
    CONSTRAINT uw_Email_statusses_EmailId
    FOREIGN KEY (uw_emailId) REFERENCES uw_Email_emails (uw_id) ON DELETE CASCADE);

CREATE SEQUENCE uw_Message_MessageId_seq;

CREATE TABLE uw_Message_messages(
    uw_id int8 NOT NULL,
    uw_senderadmin bool NOT NULL,
    uw_senderteacherid int8,
    uw_senderstudentid int8,
    uw_receiveradmin bool NOT NULL,
    uw_receiverteacherid int8,
    uw_receiverstudentid int8,
    uw_date date NOT NULL,
    uw_time time NOT NULL,
    uw_read bool NOT NULL,
    uw_stamp timestamp NOT NULL,
    uw_text text NOT NULL,
    uw_emailsent bool NOT NULL,
    CONSTRAINT uw_Message_messages_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Message_messages_Sender
    CHECK (((uw_senderAdmin = TRUE) AND ((uw_senderTeacherId IS NULL) AND (uw_senderStudentId IS NULL))) OR (((uw_senderAdmin = FALSE) AND ((NOT (uw_senderTeacherId IS NULL)) AND (uw_senderStudentId IS NULL))) OR ((uw_senderAdmin = FALSE) AND ((uw_senderTeacherId IS NULL) AND (NOT (uw_senderStudentId IS NULL)))))),
    CONSTRAINT uw_Message_messages_Receiver
    CHECK (((uw_receiverAdmin = TRUE) AND ((uw_receiverTeacherId IS NULL) AND (uw_receiverStudentId IS NULL))) OR (((uw_receiverAdmin = FALSE) AND ((NOT (uw_receiverTeacherId IS NULL)) AND (uw_receiverStudentId IS NULL))) OR ((uw_receiverAdmin = FALSE) AND ((uw_receiverTeacherId IS NULL) AND (NOT (uw_receiverStudentId IS NULL)))))),
    CONSTRAINT uw_Message_messages_SenderTeacherId
    FOREIGN KEY (uw_senderTeacherId) REFERENCES uw_Teacher_teachers (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Message_messages_SenderStudentId
    FOREIGN KEY (uw_senderStudentId) REFERENCES uw_Student_students (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Message_messages_ReceiverTeacherId
    FOREIGN KEY (uw_receiverTeacherId) REFERENCES uw_Teacher_teachers (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Message_messages_ReceiverStudentId
    FOREIGN KEY (uw_receiverStudentId) REFERENCES uw_Student_students (uw_id) ON DELETE CASCADE);

CREATE TABLE uw_Message_messageemails(
    uw_messageid int8 NOT NULL,
    uw_emailid int8 NOT NULL,
    CONSTRAINT uw_Message_messageemails_pkey PRIMARY KEY
    (uw_emailId, uw_messageId),
    CONSTRAINT uw_Message_messageemails_MessageId
    FOREIGN KEY (uw_messageId) REFERENCES uw_Message_messages (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Message_messageemails_EmailId
    FOREIGN KEY (uw_emailId) REFERENCES uw_Email_emails (uw_id) ON DELETE CASCADE);

CREATE TABLE uw_Message_repliesformessages(
    uw_replyid int8 NOT NULL,
    uw_replyidstring text NOT NULL,
    uw_messageid int8 NOT NULL,
    uw_secret text NOT NULL,
    uw_toadmin bool NOT NULL,
    CONSTRAINT uw_Message_repliesformessages_pkey PRIMARY KEY (uw_replyId),
    CONSTRAINT uw_Message_repliesformessages_MessageId
    FOREIGN KEY (uw_messageId) REFERENCES uw_Message_messages (uw_id) ON DELETE CASCADE);

CREATE VIEW
uw_Message_messagesWithCounterparties
AS
SELECT T_Messages.uw_date AS uw_Date, T_Messages.uw_emailSent AS uw_EmailSent, T_Messages.uw_id AS uw_Id, T_Messages.uw_read AS uw_Read, T_Messages.uw_receiverAdmin AS uw_ReceiverAdmin, T_Receiverstudents.uw_firstName AS uw_ReceiverStudentFirstName, T_Receiverstudents.uw_id AS uw_ReceiverStudentId, T_Receiverstudents.uw_lastName AS uw_ReceiverStudentLastName, T_Receiverteachers.uw_firstName AS uw_ReceiverTeacherFirstName, T_Receiverteachers.uw_id AS uw_ReceiverTeacherId, T_Receiverteachers.uw_lastName AS uw_ReceiverTeacherLastName, T_Messages.uw_senderAdmin AS uw_SenderAdmin, T_Senderstudents.uw_firstName AS uw_SenderStudentFirstName, T_Senderstudents.uw_id AS uw_SenderStudentId, T_Senderstudents.uw_lastName AS uw_SenderStudentLastName, T_Senderteachers.uw_firstName AS uw_SenderTeacherFirstName, T_Senderteachers.uw_id AS uw_SenderTeacherId, T_Senderteachers.uw_lastName AS uw_SenderTeacherLastName, T_Messages.uw_stamp AS uw_Stamp, T_Messages.uw_text AS uw_Text, T_Messages.uw_time AS uw_Time FROM uw_Message_messages AS T_Messages LEFT JOIN uw_Student_students AS T_Senderstudents ON ((T_Messages.uw_senderStudentId = T_Senderstudents.uw_id) OR ((T_Messages.uw_senderStudentId) IS NULL AND (T_Senderstudents.uw_id) IS NULL)) LEFT JOIN uw_Teacher_teachers AS T_Senderteachers ON ((T_Messages.uw_senderTeacherId = T_Senderteachers.uw_id) OR ((T_Messages.uw_senderTeacherId) IS NULL AND (T_Senderteachers.uw_id) IS NULL)) LEFT JOIN uw_Student_students AS T_Receiverstudents ON ((T_Messages.uw_receiverStudentId = T_Receiverstudents.uw_id) OR ((T_Messages.uw_receiverStudentId) IS NULL AND (T_Receiverstudents.uw_id) IS NULL)) LEFT JOIN uw_Teacher_teachers AS T_Receiverteachers ON ((T_Messages.uw_receiverTeacherId = T_Receiverteachers.uw_id) OR ((T_Messages.uw_receiverTeacherId) IS NULL AND (T_Receiverteachers.uw_id) IS NULL));

CREATE TABLE uw_Message_fullMessageReplies(
    uw_messageid int8 NOT NULL,
    uw_text text NOT NULL,
    uw_bodyplain text NOT NULL,
    CONSTRAINT uw_Message_fullMessageReplies_pkey PRIMARY KEY (uw_messageId));

CREATE TABLE uw_Lesson_lessongroups(
    uw_id int8 NOT NULL,
    uw_internalteacherid int8 NOT NULL,
    uw_restlessons int8 NOT NULL,
    uw_instrumentid int8 NOT NULL,
    uw_lessonduration int8 NOT NULL,
    uw_startsfromperiod bool NOT NULL,
    uw_startsinperiod int8 NOT NULL,
    uw_firstlesson date,
    uw_lastlesson date,
    uw_description text,
    uw_formulaid int8 NOT NULL,
    uw_complement int8,
    uw_weekday text NOT NULL,
    uw_time time NOT NULL,
    uw_planningmode text NOT NULL,
    uw_type_ text NOT NULL,
    uw_location text NOT NULL,
    uw_roomid int8,
    CONSTRAINT uw_Lesson_lessongroups_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Lesson_lessongroups_InternalTeacherId
    FOREIGN KEY (uw_internalTeacherId) REFERENCES uw_Teacher_internalTeachers (uw_internalTeacherId) ON DELETE RESTRICT,
    CONSTRAINT uw_Lesson_lessongroups_InstrumentId
    FOREIGN KEY (uw_instrumentId) REFERENCES uw_Config_instruments (uw_id) ON DELETE RESTRICT,
    CONSTRAINT uw_Lesson_lessongroups_StartsInPeriod
    FOREIGN KEY (uw_startsInPeriod) REFERENCES uw_Config_periods (uw_id) ON DELETE RESTRICT,
    CONSTRAINT uw_Lesson_lessongroups_RoomId
    FOREIGN KEY (uw_roomId) REFERENCES uw_Room_rooms (uw_id) ON DELETE SET NULL,
    CONSTRAINT uw_Lesson_lessongroups_Complement
    FOREIGN KEY (uw_complement) REFERENCES uw_Lesson_lessongroups (uw_id) ON DELETE SET NULL,
    CONSTRAINT uw_Lesson_lessongroups_FormulaId
    FOREIGN KEY (uw_formulaId) REFERENCES uw_Config_formulas (uw_id) ON DELETE RESTRICT);

CREATE TABLE uw_Lesson_lessongroupinvoicelines(
    uw_lessongroupid int8 NOT NULL,
    uw_type_ text NOT NULL,
    uw_description text NOT NULL,
    uw_amount float8 NOT NULL,
    uw_vat float8 NOT NULL,
    uw_order int8 NOT NULL,
    CONSTRAINT uw_Lesson_lessongroupinvoicelines_pkey PRIMARY KEY
    (uw_order, uw_lessongroupId),
    CONSTRAINT uw_Lesson_lessongroupinvoicelines_LessongroupId
    FOREIGN KEY (uw_lessongroupId) REFERENCES uw_Lesson_lessongroups (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Lesson_lessongroupinvoicelines_Order
    CHECK (uw_order >= 0::int8),
    CONSTRAINT uw_Lesson_lessongroupinvoicelines_VAT
    CHECK (uw_vAT >= 0::float8));

CREATE TABLE uw_Lesson_enrollmentsincludingstopped(
    uw_id int8 NOT NULL,
    uw_studentid studentid NOT NULL,
    uw_lessongroupid int8 NOT NULL,
    uw_status text NOT NULL,
    uw_created date NOT NULL,
    uw_allowreenrollment bool NOT NULL,
    CONSTRAINT uw_Lesson_enrollmentsincludingstopped_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Lesson_enrollmentsincludingstopped_StudentId
    FOREIGN KEY (uw_studentId) REFERENCES uw_Student_students (uw_id) ON DELETE RESTRICT,
    CONSTRAINT uw_Lesson_enrollmentsincludingstopped_LessongroupId
    FOREIGN KEY (uw_lessongroupId) REFERENCES uw_Lesson_lessongroups (uw_id) ON DELETE CASCADE);

CREATE TABLE uw_Lesson_enrollmentrequests(
    uw_id int8 NOT NULL,
    uw_studentid studentid NOT NULL,
    uw_status text NOT NULL,
    uw_secret text NOT NULL,
    uw_created timestamp NOT NULL,
    uw_updated timestamp NOT NULL,
    uw_lessongroupid int8,
    uw_enrollmentrequestprivateid int8,
    uw_familydiscountname text,
    uw_reserveduntil date,
    uw_showonplanninguntil date,
    uw_origin text NOT NULL,
    CONSTRAINT uw_Lesson_enrollmentrequests_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Lesson_enrollmentrequests_StudentId
    FOREIGN KEY (uw_studentId) REFERENCES uw_Student_students (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Lesson_enrollmentrequests_LessongroupId
    FOREIGN KEY (uw_lessongroupId) REFERENCES uw_Lesson_lessongroups (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Lesson_enrollmentrequests_EitherLessongroupOrPrivate
    CHECK (((uw_lessongroupId IS NULL) AND (NOT (uw_enrollmentrequestPrivateId IS NULL))) OR ((NOT (uw_lessongroupId IS NULL)) AND (uw_enrollmentrequestPrivateId IS NULL))));

CREATE TABLE uw_Lesson_privateenrollmentrequests(
    uw_id int8 NOT NULL,
    uw_firstlesson date NOT NULL,
    uw_lastlesson date NOT NULL,
    uw_startsinperiod int8 NOT NULL,
    uw_weekday text NOT NULL,
    uw_time time NOT NULL,
    uw_formulaid int8 NOT NULL,
    uw_instrumentid int8 NOT NULL,
    uw_internalteacherid int8,
    uw_enrollmentrequestid int8 NOT NULL,
    CONSTRAINT uw_Lesson_privateenrollmentrequests_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Lesson_privateenrollmentrequests_FormulaId
    FOREIGN KEY (uw_formulaId) REFERENCES uw_Config_formulas (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Lesson_privateenrollmentrequests_InstrumentId
    FOREIGN KEY (uw_instrumentId) REFERENCES uw_Config_instruments (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Lesson_privateenrollmentrequests_InternalTeacherId
    FOREIGN KEY (uw_internalTeacherId) REFERENCES uw_Teacher_internalTeachers (uw_internalTeacherId) ON DELETE CASCADE,
    CONSTRAINT uw_Lesson_privateenrollmentrequests_EnrollmentrequestId
    FOREIGN KEY (uw_enrollmentrequestId) REFERENCES uw_Lesson_enrollmentrequests (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Lesson_privateenrollmentrequests_StartsInPeriod
    FOREIGN KEY (uw_startsInPeriod) REFERENCES uw_Config_periods (uw_id) ON DELETE RESTRICT);

CREATE TABLE uw_Lesson_lessonsincludingremoved(
    uw_id int8 NOT NULL,
    uw_lessongroupid int8 NOT NULL,
    uw_plannedteacherid int8 NOT NULL,
    uw_teacherid int8 NOT NULL,
    uw_date date NOT NULL,
    uw_time time NOT NULL,
    uw_creation text NOT NULL,
    uw_removedreason text,
    uw_replacement int8,
    uw_location text NOT NULL,
    uw_roomid int8,
    CONSTRAINT uw_Lesson_lessonsincludingremoved_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Lesson_lessonsincludingremoved_LessongroupId
    FOREIGN KEY (uw_lessongroupId) REFERENCES uw_Lesson_lessongroups (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Lesson_lessonsincludingremoved_TeacherId
    FOREIGN KEY (uw_teacherId) REFERENCES uw_Teacher_teachers (uw_id) ON DELETE RESTRICT,
    CONSTRAINT uw_Lesson_lessonsincludingremoved_Replacement
    FOREIGN KEY (uw_replacement) REFERENCES uw_Lesson_lessonsincludingremoved (uw_id) ON DELETE SET NULL,
    CONSTRAINT uw_Lesson_lessonsincludingremoved_RoomId
    FOREIGN KEY (uw_roomId) REFERENCES uw_Room_rooms (uw_id) ON DELETE SET NULL);

CREATE VIEW
uw_Lesson_lessons
AS
SELECT T_Lessonsincludingremoved.uw_creation AS uw_Creation, T_Lessonsincludingremoved.uw_date AS uw_Date, T_Lessongroups.uw_lessonDuration AS uw_Duration, T_Lessonsincludingremoved.uw_id AS uw_Id, T_Lessonsincludingremoved.uw_lessongroupId AS uw_LessongroupId, T_Lessonsincludingremoved.uw_location AS uw_Location, T_Lessonsincludingremoved.uw_plannedTeacherId AS uw_PlannedTeacherId, T_Lessonsincludingremoved.uw_roomId AS uw_RoomId, T_Lessonsincludingremoved.uw_teacherId AS uw_TeacherId, T_Lessonsincludingremoved.uw_time AS uw_Time FROM uw_Lesson_lessonsincludingremoved AS T_Lessonsincludingremoved JOIN uw_Lesson_lessongroups AS T_Lessongroups ON (T_Lessongroups.uw_id = T_Lessonsincludingremoved.uw_lessongroupId) WHERE (T_Lessonsincludingremoved.uw_removedReason IS NULL);

CREATE TABLE uw_Lesson_holidaysskippedduringplanning(
    uw_date date NOT NULL,
    uw_holidaydescription text NOT NULL,
    uw_lessongroupid int8 NOT NULL,
    CONSTRAINT uw_Lesson_holidaysskippedduringplanning_pkey PRIMARY KEY
    (uw_lessongroupId, uw_date),
    CONSTRAINT uw_Lesson_holidaysskippedduringplanning_LessongroupId
    FOREIGN KEY (uw_lessongroupId) REFERENCES uw_Lesson_lessongroups (uw_id) ON DELETE CASCADE);

CREATE TABLE uw_Lesson_finance_placeholderInvoices(
    uw_id int8 NOT NULL,
    uw_due date NOT NULL,
    uw_enrollmentrequestid int8 NOT NULL,
    CONSTRAINT uw_Lesson_finance_placeholderInvoices_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Lesson_finance_placeholderInvoices_EnrollmentrequestId_Uniq
    UNIQUE (uw_enrollmentrequestId));

CREATE TABLE uw_Lesson_finance_placeholderInvoicelines(
    uw_placeholderinvoiceid int8 NOT NULL,
    uw_description text NOT NULL,
    uw_amount float8 NOT NULL,
    uw_vat float8 NOT NULL,
    uw_order int8 NOT NULL,
    CONSTRAINT uw_Lesson_finance_placeholderInvoicelines_pkey PRIMARY KEY
    (uw_order, uw_placeholderInvoiceId),
    CONSTRAINT uw_Lesson_finance_placeholderInvoicelines_PlaceholderInvoiceId
    FOREIGN KEY (uw_placeholderInvoiceId) REFERENCES uw_Lesson_finance_placeholderInvoices (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Lesson_finance_placeholderInvoicelines_Order_Valid
    CHECK (uw_order >= 0::int8),
    CONSTRAINT uw_Lesson_finance_placeholderInvoicelines_VAT_Valid
    CHECK (uw_vAT >= 0::float8));

CREATE TABLE uw_Lesson_finance_invoices(
    uw_id int8 NOT NULL,
    uw_due date NOT NULL,
    uw_externalid int8 NOT NULL,
    uw_enrollmentrequestid int8,
    uw_enrollmentid int8,
    uw_externalidstring text NOT NULL,
    CONSTRAINT uw_Lesson_finance_invoices_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Lesson_finance_invoices_ExternalId_Valid
    CHECK (uw_externalId > 0::int8),
    CONSTRAINT uw_Lesson_finance_invoices_ExternalId_Unique
    UNIQUE (uw_externalId),
    CONSTRAINT uw_Lesson_finance_invoices_EnrollmentrequestId_Unique
    UNIQUE (uw_enrollmentrequestId),
    CONSTRAINT uw_Lesson_finance_invoices_EnrollmentId_Unique
    UNIQUE (uw_enrollmentId));

CREATE TABLE uw_Lesson_finance_invoicelines(
    uw_invoiceid int8 NOT NULL,
    uw_description text NOT NULL,
    uw_amount float8 NOT NULL,
    uw_vat float8 NOT NULL,
    uw_order int8 NOT NULL,
    CONSTRAINT uw_Lesson_finance_invoicelines_pkey PRIMARY KEY
    (uw_order, uw_invoiceId),
    CONSTRAINT uw_Lesson_finance_invoicelines_InvoiceId
    FOREIGN KEY (uw_invoiceId) REFERENCES uw_Lesson_finance_invoices (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Lesson_finance_invoicelines_Order_Valid
    CHECK (uw_order >= 0::int8),
    CONSTRAINT uw_Lesson_finance_invoicelines_VAT_Valid
    CHECK (uw_vAT >= 0::float8));

CREATE TABLE uw_Lesson_finance_requestedoptionalinvoicelines(
    uw_enrollmentrequestid int8 NOT NULL,
    uw_description text NOT NULL,
    uw_amount float8 NOT NULL,
    CONSTRAINT uw_Lesson_finance_requestedoptionalinvoicelines_pkey PRIMARY KEY
    (uw_amount, uw_enrollmentrequestId, uw_description),
    CONSTRAINT
    uw_Lesson_finance_requestedoptionalinvoicelines_EnrollmentrequestId
    FOREIGN KEY (uw_enrollmentrequestId) REFERENCES uw_Lesson_enrollmentrequests (uw_id) ON DELETE CASCADE);

CREATE TABLE uw_Lesson_finance_creditnotes(
    uw_externalid int8 NOT NULL,
    uw_amount float8 NOT NULL,
    uw_date date NOT NULL,
    uw_id int8 NOT NULL,
    uw_invoiceid int8 NOT NULL,
    CONSTRAINT uw_Lesson_finance_creditnotes_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Lesson_finance_creditnotes_InvoiceId
    FOREIGN KEY (uw_invoiceId) REFERENCES uw_Lesson_finance_invoices (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Lesson_finance_creditnotes_Amount_Valid
    CHECK (uw_amount >= 0::float8),
    CONSTRAINT uw_Lesson_finance_creditnotes_ExternalId_Valid
    CHECK (uw_externalId > 0::int8),
    CONSTRAINT uw_Lesson_finance_creditnotes_ExternalId_Unique
    UNIQUE (uw_externalId));

CREATE TABLE uw_Lesson_finance_payments(
    uw_amount float8 NOT NULL,
    uw_date date NOT NULL,
    uw_paymentproviderid text,
    uw_method text NOT NULL,
    uw_invoiceid int8 NOT NULL,
    CONSTRAINT uw_Lesson_finance_payments_InvoiceId
    FOREIGN KEY (uw_invoiceId) REFERENCES uw_Lesson_finance_invoices (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Lesson_finance_payments_Amount CHECK (uw_amount >= 0::float8));

CREATE TABLE uw_Lesson_finance_periodfees(
    uw_studentid int8 NOT NULL,
    uw_periodid int8 NOT NULL,
    uw_amount float8 NOT NULL,
    uw_method text,
    uw_familydiscount float8 NOT NULL,
    uw_paid float8 NOT NULL,
    uw_due date NOT NULL,
    CONSTRAINT uw_Lesson_finance_periodfees_pkey PRIMARY KEY
    (uw_periodId, uw_studentId),
    CONSTRAINT uw_Lesson_finance_periodfees_StudentId
    FOREIGN KEY (uw_studentId) REFERENCES uw_Student_students (uw_id) ON DELETE CASCADE);

CREATE VIEW
uw_Lesson_finance_paymentsT
AS
SELECT T_Payments.uw_invoiceId AS uw_InvoiceId, SUM(T_Payments.uw_amount) AS uw_TotalAmount FROM uw_Lesson_finance_payments AS T_Payments GROUP BY T_Payments.uw_InvoiceId;

CREATE VIEW
uw_Lesson_finance_invoicelinesT
AS
SELECT T_Invoicelines.uw_invoiceId AS uw_InvoiceId, SUM(T_Invoicelines.uw_amount) AS uw_TotalAmount FROM uw_Lesson_finance_invoicelines AS T_Invoicelines GROUP BY T_Invoicelines.uw_InvoiceId;

CREATE VIEW
uw_Lesson_finance_creditnotesT
AS
SELECT T_Creditnotes.uw_invoiceId AS uw_InvoiceId, SUM(T_Creditnotes.uw_amount) AS uw_TotalAmount FROM uw_Lesson_finance_creditnotes AS T_Creditnotes GROUP BY T_Creditnotes.uw_InvoiceId;

CREATE TABLE uw_Lesson_status_studentpresences(
    uw_lessonid int8 NOT NULL,
    uw_studentid int8 NOT NULL,
    uw_status text NOT NULL,
    uw_createdby text NOT NULL,
    uw_createdon date NOT NULL,
    uw_comments text NOT NULL,
    uw_storagefileid text,
    uw_needsadmincheck bool NOT NULL,
    CONSTRAINT uw_Lesson_status_studentpresences_pkey PRIMARY KEY
    (uw_studentId, uw_lessonId),
    CONSTRAINT uw_Lesson_status_studentpresences_LessonId
    FOREIGN KEY (uw_lessonId) REFERENCES uw_Lesson_lessonsincludingremoved (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Lesson_status_studentpresences_StudentId
    FOREIGN KEY (uw_studentId) REFERENCES uw_Student_students (uw_id) ON DELETE CASCADE);

CREATE VIEW
uw_Lesson_extended_extendedLessonsView
AS
SELECT T_Lessonsincludingremoved.uw_creation AS uw_Creation, T_Lessonsincludingremoved.uw_date AS uw_Date, T_Lessongroups.uw_lessonDuration AS uw_Duration, T_Enrollmentsincludingstopped.uw_id AS uw_EnrollmentId, T_Enrollmentsincludingstopped.uw_status AS uw_EnrollmentStatus, T_Lessonsincludingremoved.uw_id AS uw_Id, T_Instruments.uw_description AS uw_InstrumentDescription, T_Instruments.uw_id AS uw_InstrumentId, T_Lessonsincludingremoved.uw_lessongroupId AS uw_LessongroupId, T_Lessongroups.uw_lastLesson AS uw_Lessongroups_LastLesson, T_Lessonsincludingremoved.uw_location AS uw_Location, T_PT.uw_firstName AS uw_PlannedTeacherFirstName, T_PT.uw_id AS uw_PlannedTeacherId, T_PT.uw_lastName AS uw_PlannedTeacherLastName, T_Lessonsincludingremoved.uw_removedReason AS uw_RemovedReason, T_Repl.uw_date AS uw_ReplacementDate, T_Repl.uw_time AS uw_ReplacementTime, T_Rooms.uw_description AS uw_RoomDescription, T_Lessonsincludingremoved.uw_roomId AS uw_RoomId, T_Studentpresences.uw_status AS uw_Status, T_Studentpresences.uw_comments AS uw_StatusComments, T_Studentpresences.uw_createdBy AS uw_StatusCreatedBy, T_Studentpresences.uw_createdOn AS uw_StatusCreatedOn, T_Studentpresences.uw_needsAdminCheck AS uw_StatusNeedsAdminCheck, T_Studentpresences.uw_storageFileId AS uw_StatusStorageFileId, T_Students.uw_firstName AS uw_StudentFirstName, T_Students.uw_id AS uw_StudentId, T_Students.uw_lastName AS uw_StudentLastName, T_TE.uw_firstName AS uw_TeacherFirstName, T_TE.uw_id AS uw_TeacherId, T_TE.uw_lastName AS uw_TeacherLastName, T_Lessonsincludingremoved.uw_time AS uw_Time, T_Lessongroups.uw_type_ AS uw_Type_ FROM uw_Lesson_lessonsincludingremoved AS T_Lessonsincludingremoved JOIN uw_Lesson_lessongroups AS T_Lessongroups ON (T_Lessonsincludingremoved.uw_lessongroupId = T_Lessongroups.uw_id) LEFT JOIN uw_Lesson_enrollmentsincludingstopped AS T_Enrollmentsincludingstopped ON (T_Enrollmentsincludingstopped.uw_lessongroupId = T_Lessongroups.uw_id) LEFT JOIN uw_Student_students AS T_Students ON ((T_Enrollmentsincludingstopped.uw_studentId = T_Students.uw_id) OR ((T_Enrollmentsincludingstopped.uw_studentId) IS NULL AND (T_Students.uw_id) IS NULL)) JOIN uw_Teacher_teachers AS T_TE ON (T_TE.uw_id = T_Lessonsincludingremoved.uw_teacherId) JOIN uw_Teacher_teachers AS T_PT ON (T_PT.uw_id = T_Lessonsincludingremoved.uw_plannedTeacherId) JOIN uw_Config_instruments AS T_Instruments ON (T_Instruments.uw_id = T_Lessongroups.uw_instrumentId) LEFT JOIN uw_Room_rooms AS T_Rooms ON ((T_Lessonsincludingremoved.uw_roomId = T_Rooms.uw_id) OR ((T_Lessonsincludingremoved.uw_roomId) IS NULL AND (T_Rooms.uw_id) IS NULL)) LEFT JOIN uw_Lesson_status_studentpresences AS T_Studentpresences ON ((T_Studentpresences.uw_lessonId = T_Lessonsincludingremoved.uw_id) AND ((T_Studentpresences.uw_studentId = T_Enrollmentsincludingstopped.uw_studentId) OR ((T_Studentpresences.uw_studentId) IS NULL AND (T_Enrollmentsincludingstopped.uw_studentId) IS NULL))) LEFT JOIN uw_Lesson_lessonsincludingremoved AS T_Repl ON ((T_Repl.uw_id = T_Lessonsincludingremoved.uw_replacement) OR ((T_Repl.uw_id) IS NULL AND (T_Lessonsincludingremoved.uw_replacement) IS NULL));

CREATE TABLE uw_Note_textnotes(
    uw_id int8 NOT NULL,
    uw_lessonid int8 NOT NULL,
    uw_content text NOT NULL,
    uw_studentid int8,
    uw_teacherid int8,
    uw_stamp timestamp NOT NULL,
    CONSTRAINT uw_Note_textnotes_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Note_textnotes_LessonId
    FOREIGN KEY (uw_lessonId) REFERENCES uw_Lesson_lessonsincludingremoved (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Note_textnotes_StudentId
    FOREIGN KEY (uw_studentId) REFERENCES uw_Student_students (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Note_textnotes_TeacherId
    FOREIGN KEY (uw_teacherId) REFERENCES uw_Teacher_teachers (uw_id) ON DELETE CASCADE);

CREATE TABLE uw_Note_filenotes(
    uw_id int8 NOT NULL,
    uw_lessonid int8 NOT NULL,
    uw_description text NOT NULL,
    uw_studentid int8,
    uw_teacherid int8,
    uw_stamp timestamp NOT NULL,
    uw_mimetype text NOT NULL,
    uw_storagefileid text NOT NULL,
    CONSTRAINT uw_Note_filenotes_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Note_filenotes_LessonId
    FOREIGN KEY (uw_lessonId) REFERENCES uw_Lesson_lessonsincludingremoved (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Note_filenotes_StudentId
    FOREIGN KEY (uw_studentId) REFERENCES uw_Student_students (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Note_filenotes_TeacherId
    FOREIGN KEY (uw_teacherId) REFERENCES uw_Teacher_teachers (uw_id) ON DELETE CASCADE);

CREATE TABLE uw_Note_repliesfornotes(
    uw_replyid int8 NOT NULL,
    uw_replyidstring text NOT NULL,
    uw_lessonid int8 NOT NULL,
    uw_studentid int8,
    uw_teacherid int8,
    uw_admin bool NOT NULL,
    uw_secret text NOT NULL,
    CONSTRAINT uw_Note_repliesfornotes_pkey PRIMARY KEY (uw_replyId),
    CONSTRAINT uw_Note_repliesfornotes_LessonId
    FOREIGN KEY (uw_lessonId) REFERENCES uw_Lesson_lessonsincludingremoved (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Note_repliesfornotes_StudentId
    FOREIGN KEY (uw_studentId) REFERENCES uw_Student_students (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Note_repliesfornotes_TeacherId
    FOREIGN KEY (uw_teacherId) REFERENCES uw_Teacher_teachers (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Note_repliesfornotes_Receiver
    CHECK (((uw_admin = TRUE) AND ((uw_teacherId IS NULL) AND (uw_studentId IS NULL))) OR (((uw_admin = FALSE) AND ((NOT (uw_teacherId IS NULL)) AND (uw_studentId IS NULL))) OR ((uw_admin = FALSE) AND ((uw_teacherId IS NULL) AND (NOT (uw_studentId IS NULL)))))));

CREATE SEQUENCE uw_Note_viewednotesSeq;

CREATE TABLE uw_Note_viewednotes(
    uw_id int8 NOT NULL,
    uw_teacherid int8,
    uw_studentid int8,
    uw_lessongroupid int8 NOT NULL,
    uw_stamp timestamp NOT NULL,
    CONSTRAINT uw_Note_viewednotes_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Note_viewednotes_TeacherId
    FOREIGN KEY (uw_teacherId) REFERENCES uw_Teacher_teachers (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Note_viewednotes_StudentId
    FOREIGN KEY (uw_studentId) REFERENCES uw_Student_students (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Note_viewednotes_LessongroupId
    FOREIGN KEY (uw_lessongroupId) REFERENCES uw_Lesson_lessongroups (uw_id) ON DELETE CASCADE,
    CONSTRAINT uw_Note_viewednotes_TeacherOrStudent
    CHECK (((uw_teacherId IS NULL) AND (NOT (uw_studentId IS NULL))) OR ((uw_studentId IS NULL) AND (NOT (uw_teacherId IS NULL)))));

CREATE VIEW
uw_Note_notestamps
AS
((SELECT T_Textnotes.uw_lessonId AS uw_LessonId, T_Textnotes.uw_stamp AS uw_Stamp FROM uw_Note_textnotes AS T_Textnotes) UNION (SELECT T_Filenotes.uw_lessonId AS uw_LessonId, T_Filenotes.uw_stamp AS uw_Stamp FROM uw_Note_filenotes AS T_Filenotes));

CREATE TABLE uw_Session_credentials(
    uw_email text NOT NULL,
    uw_hash text NOT NULL,
    uw_createdon timestamp NOT NULL,
    CONSTRAINT uw_Session_credentials_pkey PRIMARY KEY (uw_email));

CREATE TABLE uw_Session_resettingcredentials(
    uw_email text NOT NULL,
    uw_since timestamp NOT NULL,
    uw_random int8 NOT NULL,
    CONSTRAINT uw_Session_resettingcredentials_pkey PRIMARY KEY (uw_email));

CREATE TABLE uw_Session_Emailsecret_secrets(
    uw_email text NOT NULL,
    uw_secret text NOT NULL,
    uw_stamp timestamp NOT NULL,
    CONSTRAINT uw_Session_Emailsecret_secrets_pkey PRIMARY KEY
    (uw_stamp, uw_email));

CREATE SEQUENCE uw_Event_EventId_seq;

CREATE TABLE uw_Event_events(
    uw_id int8 NOT NULL,
    uw_description text NOT NULL,
    uw_text text NOT NULL,
    uw_html text NOT NULL,
    uw_attachment text,
    uw_attachmentname text,
    uw_date date NOT NULL,
    CONSTRAINT uw_Event_events_pkey PRIMARY KEY (uw_id));

CREATE SEQUENCE uw_Evaluation_EvaluationSectionId_seq;

CREATE TABLE uw_Evaluation_evaluations(
    uw_id int8 NOT NULL,
    uw_enrollmentid int8 NOT NULL,
    uw_created date NOT NULL,
    uw_modified date NOT NULL,
    uw_finalized date,
    CONSTRAINT uw_Evaluation_evaluations_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Evaluation_evaluations_EnrollmentId
    FOREIGN KEY (uw_enrollmentId) REFERENCES uw_Lesson_enrollmentsincludingstopped (uw_id) ON DELETE CASCADE);

CREATE TABLE uw_Evaluation_evaluationSections(
    uw_id int8 NOT NULL,
    uw_evaluationid int8 NOT NULL,
    uw_title text NOT NULL,
    uw_text text NOT NULL,
    CONSTRAINT uw_Evaluation_evaluationSections_pkey PRIMARY KEY (uw_id),
    CONSTRAINT uw_Evaluation_evaluationSections_EvaluationId
    FOREIGN KEY (uw_evaluationId) REFERENCES uw_Evaluation_evaluations (uw_id) ON DELETE CASCADE);

CREATE TABLE uw_Payenrollment_onlinepayments(
    uw_paymentid text NOT NULL,
    uw_checkouturl text NOT NULL,
    uw_enrollmentid int8,
    uw_enrollmentrequestid int8,
    uw_amount float8 NOT NULL,
    uw_createdon timestamp NOT NULL,
    uw_status text NOT NULL,
    uw_description text NOT NULL,
    CONSTRAINT uw_Payenrollment_onlinepayments_pkey PRIMARY KEY (uw_paymentId),
    CONSTRAINT uw_Payenrollment_onlinepayments_EnrollmentOrRequest
    CHECK (((uw_enrollmentId IS NULL) AND (NOT (uw_enrollmentrequestId IS NULL))) OR ((uw_enrollmentrequestId IS NULL) AND (NOT (uw_enrollmentId IS NULL)))));

CREATE OR REPLACE FUNCTION getEmailsToSend() RETURNS SETOF RECORD AS $$
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

CREATE OR REPLACE FUNCTION insertNewEmailStatus(uw_emailid int, version int, uw_status text) RETURNS INT AS $$
  INSERT INTO uw_email_statusses 
    (uw_emailid, uw_version, uw_status, uw_stamp, uw_islastversion) 
  VALUES
    (uw_emailid, version, uw_status, CURRENT_TIMESTAMP, TRUE)
  RETURNING uw_emailid;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION getStudent(uw_studentid studentid) RETURNS RECORD AS $$
  SELECT s.uw_firstname, s.uw_lastname, COALESCE(emails.emails, ARRAY[]) AS emails
  FROM uw_student_students s
  LEFT JOIN (SELECT em.uw_studentid, array_agg(json_build_object('id', em.uw_id, 'email', em.uw_email)) as emails
                from uw_student_studentemails em
              group by uw_studentid
  ) emails ON s.uw_id = emails.uw_studentid;
  $$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION getStudentNestedJoin(uw_studentid studentid) RETURNS RECORD AS $$
  SELECT
  s.uw_firstname,
  s.uw_lastname,
  (SELECT array_agg(json_build_object('id', em.uw_id, 'email', em.uw_email)) as emails
     from uw_student_studentemails em
    where em.uw_studentid = s.uw_id
    group by uw_studentid) AS emails
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
