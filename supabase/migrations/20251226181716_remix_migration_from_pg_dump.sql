CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



SET default_table_access_method = heap;

--
-- Name: email_generations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_generations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    source text DEFAULT 'app'::text NOT NULL,
    scenario_name text,
    input_json jsonb NOT NULL,
    prompt_version text NOT NULL,
    model_name text NOT NULL,
    subject text,
    body text NOT NULL,
    word_count integer,
    has_em_dash boolean,
    cliche_count integer,
    validator_passed boolean,
    validator_errors jsonb,
    latency_ms integer,
    session_id uuid
);


--
-- Name: prolific_post_survey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prolific_post_survey (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    comparison_rating integer,
    likelihood_change text,
    likelihood_reasons jsonb,
    changes_before_sending jsonb,
    what_felt_off text,
    most_useful_part text,
    whats_missing text,
    CONSTRAINT prolific_post_survey_comparison_rating_check CHECK (((comparison_rating >= 1) AND (comparison_rating <= 5))),
    CONSTRAINT prolific_post_survey_likelihood_change_check CHECK ((likelihood_change = ANY (ARRAY['significantly_more'::text, 'somewhat_more'::text, 'no_change'::text, 'less_likely'::text])))
);


--
-- Name: prolific_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prolific_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    prolific_id text NOT NULL,
    profession text NOT NULL,
    cold_email_frequency text NOT NULL,
    completed_at timestamp with time zone,
    study_id text,
    prolific_session_id text
);


--
-- Name: prolific_step_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prolific_step_tracking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid,
    prolific_id text NOT NULL,
    step_name text NOT NULL,
    step_number integer NOT NULL,
    event_type text NOT NULL,
    event_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT prolific_step_tracking_event_type_check CHECK ((event_type = ANY (ARRAY['enter'::text, 'exit'::text, 'error'::text, 'action'::text])))
);


--
-- Name: email_generations email_generations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_generations
    ADD CONSTRAINT email_generations_pkey PRIMARY KEY (id);


--
-- Name: prolific_post_survey prolific_post_survey_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prolific_post_survey
    ADD CONSTRAINT prolific_post_survey_pkey PRIMARY KEY (id);


--
-- Name: prolific_sessions prolific_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prolific_sessions
    ADD CONSTRAINT prolific_sessions_pkey PRIMARY KEY (id);


--
-- Name: prolific_step_tracking prolific_step_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prolific_step_tracking
    ADD CONSTRAINT prolific_step_tracking_pkey PRIMARY KEY (id);


--
-- Name: idx_email_generations_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_generations_created_at ON public.email_generations USING btree (created_at DESC);


--
-- Name: idx_email_generations_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_generations_session_id ON public.email_generations USING btree (session_id);


--
-- Name: idx_prolific_sessions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prolific_sessions_created_at ON public.prolific_sessions USING btree (created_at);


--
-- Name: idx_prolific_sessions_prolific_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prolific_sessions_prolific_id ON public.prolific_sessions USING btree (prolific_id);


--
-- Name: idx_step_tracking_prolific; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_step_tracking_prolific ON public.prolific_step_tracking USING btree (prolific_id);


--
-- Name: idx_step_tracking_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_step_tracking_session ON public.prolific_step_tracking USING btree (session_id);


--
-- Name: idx_step_tracking_step; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_step_tracking_step ON public.prolific_step_tracking USING btree (step_name, event_type);


--
-- Name: email_generations email_generations_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_generations
    ADD CONSTRAINT email_generations_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.prolific_sessions(id) ON DELETE SET NULL;


--
-- Name: prolific_post_survey prolific_post_survey_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prolific_post_survey
    ADD CONSTRAINT prolific_post_survey_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.prolific_sessions(id);


--
-- Name: prolific_step_tracking prolific_step_tracking_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prolific_step_tracking
    ADD CONSTRAINT prolific_step_tracking_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.prolific_sessions(id);


--
-- Name: prolific_post_survey Allow public insert for survey responses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert for survey responses" ON public.prolific_post_survey FOR INSERT WITH CHECK (true);


--
-- Name: prolific_post_survey Allow public select for survey responses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public select for survey responses" ON public.prolific_post_survey FOR SELECT USING (true);


--
-- Name: email_generations No direct client access to email_generations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No direct client access to email_generations" ON public.email_generations USING (false) WITH CHECK (false);


--
-- Name: prolific_sessions No direct client access to prolific_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No direct client access to prolific_sessions" ON public.prolific_sessions USING (false) WITH CHECK (false);


--
-- Name: prolific_step_tracking No direct client access to prolific_step_tracking; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No direct client access to prolific_step_tracking" ON public.prolific_step_tracking AS RESTRICTIVE USING (false) WITH CHECK (false);


--
-- Name: email_generations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_generations ENABLE ROW LEVEL SECURITY;

--
-- Name: prolific_post_survey; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prolific_post_survey ENABLE ROW LEVEL SECURITY;

--
-- Name: prolific_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prolific_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: prolific_step_tracking; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prolific_step_tracking ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;