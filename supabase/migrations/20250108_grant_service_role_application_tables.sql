-- Migration: 20250108_grant_service_role_application_tables.sql
-- Grant necessary table privileges to service_role for application tables
-- so trusted admin Edge Functions and server tasks can manage answers,
-- student_question_order, questions, and submissions without affecting RLS or client roles.

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.questions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_question_order TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.answers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.submissions TO service_role;
