--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

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

-- Ensure required extensions exist (Supabase keeps these in the `extensions` schema)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: get_my_admin_region_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_admin_region_id() RETURNS uuid
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
    claims jsonb;
    region_id text;
BEGIN
    BEGIN
        claims := current_setting('request.jwt.claims', true)::jsonb;
    EXCEPTION WHEN OTHERS THEN
        claims := NULL;
    END;

    IF claims IS NULL THEN
        RETURN NULL;
    END IF;

    region_id := COALESCE(
        claims -> 'app_metadata' ->> 'admin_region_id',
        claims -> 'app_metadata' ->> 'adminRegionId',
        claims ->> 'admin_region_id',
        claims ->> 'adminRegionId'
    );

    IF region_id IS NOT NULL THEN
        RETURN region_id::uuid;
    END IF;

    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
    BEGIN
      INSERT INTO public.profiles (id, role, admin_region_id, city_id, hq_id, shop_id, client_id)
      VALUES (
        new.id,
        COALESCE(new.raw_app_meta_data ->> 'role', 'customer'),
        NULLIF(new.raw_app_meta_data ->> 'admin_region_id', '')::uuid,
        NULLIF(new.raw_app_meta_data ->> 'city_id', '')::uuid,
        NULLIF(new.raw_app_meta_data ->> 'hq_id', '')::uuid,
        NULLIF(new.raw_app_meta_data ->> 'shop_id', '')::uuid,
        NULLIF(new.raw_app_meta_data ->> 'client_id', '')::uuid
      )
      ON CONFLICT (id) DO NOTHING;

      RETURN new;
    END;
    $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_region; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_region (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    canton_id uuid,
    name text NOT NULL,
    active boolean DEFAULT true,
    address text,
    contact_email text,
    contact_person text,
    phone text,
    billing_name text,
    billing_iban text,
    billing_street text,
    billing_house_num text,
    billing_postal_code text,
    billing_city text,
    billing_country text,
    billing_logo_path text,
    internal_billing_name text,
    internal_billing_iban text,
    internal_billing_street text,
    internal_billing_house_num text,
    internal_billing_postal_code text,
    internal_billing_city text,
    internal_billing_country text,
    internal_billing_logo_path text
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value_numeric numeric(8,4),
    effective_from date DEFAULT (date_trunc('month'::text, now()))::date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_document; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_document (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    recipient_type text NOT NULL,
    recipient_id uuid NOT NULL,
    period_month date NOT NULL,
    amount_ht numeric(12,2) DEFAULT 0 NOT NULL,
    amount_vat numeric(12,2) DEFAULT 0 NOT NULL,
    amount_ttc numeric(12,2) DEFAULT 0 NOT NULL,
    vat_rate numeric(8,4) DEFAULT 0 NOT NULL,
    pdf_url text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    creditor_name_snapshot text,
    creditor_iban_snapshot text,
    creditor_street_snapshot text,
    creditor_house_num_snapshot text,
    creditor_postal_code_snapshot text,
    creditor_city_snapshot text,
    creditor_country_snapshot text,
    reference_snapshot text,
    payment_message_snapshot text,
    recipient_name_snapshot text,
    recipient_street_snapshot text,
    recipient_house_num_snapshot text,
    recipient_postal_code_snapshot text,
    recipient_city_snapshot text,
    recipient_country_snapshot text,
    pdf_sha256 text,
    pdf_generated_at timestamp with time zone
);


--
-- Name: billing_document_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_document_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    shop_id uuid,
    delivery_id uuid,
    amount_due numeric(12,2) DEFAULT 0 NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_period; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_period (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    shop_id uuid,
    period_month date NOT NULL,
    frozen_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    frozen_by uuid,
    frozen_by_name text,
    pdf_url text,
    pdf_sha256 text,
    pdf_generated_at timestamp with time zone,
    frozen_comment text,
    comment text
);


--
-- Name: billing_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_run (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_region_id uuid NOT NULL,
    period_month date NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: canton; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canton (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    code text NOT NULL
);


--
-- Name: city; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.city (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    canton_id uuid,
    admin_region_id uuid,
    name text NOT NULL,
    address text,
    contact_person text,
    email text,
    phone text,
    parent_city_id uuid
);


--
-- Name: city_postal_code; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.city_postal_code (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    city_id uuid NOT NULL,
    postal_code text NOT NULL
);


--
-- Name: client; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    address text,
    postal_code text,
    city_name text,
    city_id uuid,
    is_cms boolean DEFAULT false,
    floor text,
    door_code text,
    phone text,
    active boolean DEFAULT true,
    lat double precision,
    lng double precision,
    email text,
    account_invite_status text,
    account_invite_error text,
    account_invited_at timestamp with time zone
);


--
-- Name: courier; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courier (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    first_name text NOT NULL,
    last_name text NOT NULL,
    courier_number text NOT NULL,
    phone_number text,
    email text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    admin_region_id uuid,
    can_dispatch boolean DEFAULT false NOT NULL
);


--
-- Name: delivery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    shop_id uuid NOT NULL,
    hq_id uuid,
    admin_region_id uuid,
    city_id uuid,
    canton_id uuid,
    delivery_date date NOT NULL,
    client_id uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    courier_id uuid,
    distance_km double precision,
    co2_saved_kg double precision
);


--
-- Name: delivery_financial; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_financial (
    delivery_id uuid NOT NULL,
    tariff_version_id uuid,
    total_price numeric(10,2) NOT NULL,
    share_client numeric(10,2) DEFAULT 0 NOT NULL,
    share_shop numeric(10,2) DEFAULT 0 NOT NULL,
    share_city numeric(10,2) DEFAULT 0 NOT NULL,
    share_admin_region numeric(10,2) DEFAULT 0 NOT NULL,
    cms_subsidy numeric(10,2) DEFAULT 0 NOT NULL
);


--
-- Name: delivery_logistics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_logistics (
    delivery_id uuid NOT NULL,
    client_name text,
    address text,
    postal_code text,
    city_name text,
    time_window text,
    short_code text,
    bags integer,
    order_amount numeric(10,2),
    is_cms boolean DEFAULT false,
    notes text,
    basket_value numeric(10,2),
    floor text,
    door_code text
);


--
-- Name: delivery_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_status (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    delivery_id uuid,
    status text NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT delivery_status_status_check CHECK ((status = ANY (ARRAY['created'::text, 'assigned'::text, 'picked_up'::text, 'delivered'::text, 'issue'::text, 'validated'::text, 'invoiced'::text, 'cancelled'::text])))
);


--
-- Name: hq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hq (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    address text,
    contact_person text,
    email text,
    phone text
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    role text NOT NULL,
    admin_region_id uuid,
    city_id uuid,
    hq_id uuid,
    shop_id uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    client_id uuid,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['super_admin'::text, 'admin_region'::text, 'city'::text, 'hq'::text, 'shop'::text, 'courier'::text, 'customer'::text])))
);


--
-- Name: shop; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    hq_id uuid,
    city_id uuid,
    tariff_version_id uuid,
    name text NOT NULL,
    address text,
    contact_person text,
    email text,
    phone text,
    lat double precision,
    lng double precision
);


--
-- Name: tariff_grid; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tariff_grid (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    admin_region_id uuid NOT NULL,
    active boolean DEFAULT true
);


--
-- Name: tariff_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tariff_version (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tariff_grid_id uuid NOT NULL,
    rule_type text NOT NULL,
    rule jsonb NOT NULL,
    share jsonb NOT NULL,
    valid_from date NOT NULL,
    valid_to date,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT tariff_version_valid_range CHECK (((valid_to IS NULL) OR (valid_to >= valid_from)))
);


--
-- Name: view_city_billing; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.view_city_billing WITH (security_invoker='true') AS
 SELECT c.id AS city_id,
    c.name AS city_name,
    (date_trunc('month'::text, (d.delivery_date)::timestamp with time zone))::date AS billing_month,
    count(d.id) AS total_deliveries,
    sum(f.share_city) AS total_amount_due,
    sum(f.total_price) AS total_volume_chf
   FROM ((((public.delivery d
     JOIN public.shop s ON ((s.id = d.shop_id)))
     JOIN public.city c ON ((c.id = s.city_id)))
     JOIN public.delivery_financial f ON ((f.delivery_id = d.id)))
     LEFT JOIN LATERAL ( SELECT delivery_status.status
           FROM public.delivery_status
          WHERE (delivery_status.delivery_id = d.id)
          ORDER BY delivery_status.updated_at DESC
         LIMIT 1) st ON (true))
  WHERE (COALESCE(st.status, ''::text) <> 'cancelled'::text)
  GROUP BY c.id, c.name, ((date_trunc('month'::text, (d.delivery_date)::timestamp with time zone))::date);


--
-- Name: view_city_billing_shops; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.view_city_billing_shops WITH (security_invoker='true') AS
 SELECT s.id AS shop_id,
    s.name AS shop_name,
    c.id AS city_id,
    c.name AS city_name,
    (date_trunc('month'::text, (d.delivery_date)::timestamp with time zone))::date AS billing_month,
    count(d.id) AS total_deliveries,
    sum(f.share_city) AS total_subvention_due,
    sum(f.total_price) AS total_volume_chf
   FROM ((((public.delivery d
     JOIN public.shop s ON ((s.id = d.shop_id)))
     JOIN public.city c ON ((c.id = s.city_id)))
     JOIN public.delivery_financial f ON ((f.delivery_id = d.id)))
     LEFT JOIN LATERAL ( SELECT delivery_status.status
           FROM public.delivery_status
          WHERE (delivery_status.delivery_id = d.id)
          ORDER BY delivery_status.updated_at DESC
         LIMIT 1) st ON (true))
  WHERE (COALESCE(st.status, ''::text) <> 'cancelled'::text)
  GROUP BY s.id, s.name, c.id, c.name, ((date_trunc('month'::text, (d.delivery_date)::timestamp with time zone))::date);


--
-- Name: view_hq_billing_shops; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.view_hq_billing_shops WITH (security_invoker='true') AS
 SELECT h.name AS hq_name,
    s.id AS shop_id,
    s.name AS shop_name,
    c.name AS city_name,
    (date_trunc('month'::text, (d.delivery_date)::timestamp with time zone))::date AS billing_month,
    count(d.id) AS total_deliveries,
    sum((f.share_city + f.share_admin_region)) AS total_subvention_due,
    sum(f.total_price) AS total_volume_chf,
    (bp.id IS NOT NULL) AS is_frozen
   FROM ((((((public.delivery d
     JOIN public.shop s ON ((s.id = d.shop_id)))
     JOIN public.city c ON ((c.id = s.city_id)))
     LEFT JOIN public.hq h ON ((h.id = s.hq_id)))
     JOIN public.delivery_financial f ON ((f.delivery_id = d.id)))
     LEFT JOIN public.billing_period bp ON (((bp.shop_id = s.id) AND (bp.period_month = (date_trunc('month'::text, (d.delivery_date)::timestamp with time zone))::date))))
     LEFT JOIN LATERAL ( SELECT delivery_status.status
           FROM public.delivery_status
          WHERE (delivery_status.delivery_id = d.id)
          ORDER BY delivery_status.updated_at DESC
         LIMIT 1) st ON (true))
  WHERE (COALESCE(st.status, ''::text) <> 'cancelled'::text)
  GROUP BY h.name, s.id, s.name, c.name, ((date_trunc('month'::text, (d.delivery_date)::timestamp with time zone))::date), bp.id;


--
-- Name: admin_region admin_region_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_region
    ADD CONSTRAINT admin_region_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key, effective_from);


--
-- Name: billing_document_line billing_document_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_document_line
    ADD CONSTRAINT billing_document_line_pkey PRIMARY KEY (id);


--
-- Name: billing_document billing_document_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_document
    ADD CONSTRAINT billing_document_pkey PRIMARY KEY (id);


--
-- Name: billing_document billing_document_recipient_type_recipient_id_period_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_document
    ADD CONSTRAINT billing_document_recipient_type_recipient_id_period_month_key UNIQUE (recipient_type, recipient_id, period_month);


--
-- Name: billing_period billing_period_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_period
    ADD CONSTRAINT billing_period_pkey PRIMARY KEY (id);


--
-- Name: billing_period billing_period_shop_id_period_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_period
    ADD CONSTRAINT billing_period_shop_id_period_month_key UNIQUE (shop_id, period_month);


--
-- Name: billing_run billing_run_admin_region_id_period_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_run
    ADD CONSTRAINT billing_run_admin_region_id_period_month_key UNIQUE (admin_region_id, period_month);


--
-- Name: billing_run billing_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_run
    ADD CONSTRAINT billing_run_pkey PRIMARY KEY (id);


--
-- Name: canton canton_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canton
    ADD CONSTRAINT canton_code_key UNIQUE (code);


--
-- Name: canton canton_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canton
    ADD CONSTRAINT canton_pkey PRIMARY KEY (id);


--
-- Name: city city_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.city
    ADD CONSTRAINT city_pkey PRIMARY KEY (id);


--
-- Name: city_postal_code city_postal_code_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.city_postal_code
    ADD CONSTRAINT city_postal_code_pkey PRIMARY KEY (id);


--
-- Name: city_postal_code city_postal_code_postal_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.city_postal_code
    ADD CONSTRAINT city_postal_code_postal_code_key UNIQUE (postal_code);


--
-- Name: client client_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client
    ADD CONSTRAINT client_pkey PRIMARY KEY (id);


--
-- Name: courier courier_courier_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier
    ADD CONSTRAINT courier_courier_number_key UNIQUE (courier_number);


--
-- Name: courier courier_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier
    ADD CONSTRAINT courier_pkey PRIMARY KEY (id);


--
-- Name: delivery_financial delivery_financial_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_financial
    ADD CONSTRAINT delivery_financial_pkey PRIMARY KEY (delivery_id);


--
-- Name: delivery_logistics delivery_logistics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_logistics
    ADD CONSTRAINT delivery_logistics_pkey PRIMARY KEY (delivery_id);


--
-- Name: delivery delivery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery
    ADD CONSTRAINT delivery_pkey PRIMARY KEY (id);


--
-- Name: delivery_status delivery_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_status
    ADD CONSTRAINT delivery_status_pkey PRIMARY KEY (id);


--
-- Name: hq hq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hq
    ADD CONSTRAINT hq_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: shop shop_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop
    ADD CONSTRAINT shop_pkey PRIMARY KEY (id);


--
-- Name: tariff_grid tariff_grid_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tariff_grid
    ADD CONSTRAINT tariff_grid_pkey PRIMARY KEY (id);


--
-- Name: tariff_version tariff_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tariff_version
    ADD CONSTRAINT tariff_version_pkey PRIMARY KEY (id);


--
-- Name: idx_billing_document_line_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_document_line_doc ON public.billing_document_line USING btree (document_id);


--
-- Name: idx_billing_document_line_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_document_line_document ON public.billing_document_line USING btree (document_id);


--
-- Name: idx_billing_document_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_document_recipient ON public.billing_document USING btree (recipient_type, recipient_id, period_month);


--
-- Name: idx_billing_document_run_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_document_run_recipient ON public.billing_document USING btree (run_id, recipient_type, recipient_id);


--
-- Name: idx_billing_run_admin_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_run_admin_period ON public.billing_run USING btree (admin_region_id, period_month);


--
-- Name: idx_billing_run_region_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_run_region_month ON public.billing_run USING btree (admin_region_id, period_month);


--
-- Name: idx_city_postal_code_city_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_city_postal_code_city_id ON public.city_postal_code USING btree (city_id);


--
-- Name: idx_delivery_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_city ON public.delivery USING btree (city_id);


--
-- Name: idx_delivery_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_client ON public.delivery USING btree (client_id);


--
-- Name: idx_delivery_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_date ON public.delivery USING btree (delivery_date);


--
-- Name: idx_delivery_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_region ON public.delivery USING btree (admin_region_id);


--
-- Name: idx_delivery_shop_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_shop_date ON public.delivery USING btree (shop_id, delivery_date);


--
-- Name: idx_delivery_status_delivery_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_status_delivery_id ON public.delivery_status USING btree (delivery_id);


--
-- Name: idx_delivery_status_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_status_latest ON public.delivery_status USING btree (delivery_id, updated_at DESC);


--
-- Name: idx_tariff_grid_admin_region_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tariff_grid_admin_region_id ON public.tariff_grid USING btree (admin_region_id);


--
-- Name: idx_tariff_version_grid_valid_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tariff_version_grid_valid_from ON public.tariff_version USING btree (tariff_grid_id, valid_from DESC);


--
-- Name: idx_tariff_version_tariff_grid_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tariff_version_tariff_grid_id ON public.tariff_version USING btree (tariff_grid_id);


--
-- Name: uniq_tariff_version_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_tariff_version_active ON public.tariff_version USING btree (tariff_grid_id) WHERE (valid_to IS NULL);


--
-- Name: admin_region admin_region_canton_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_region
    ADD CONSTRAINT admin_region_canton_id_fkey FOREIGN KEY (canton_id) REFERENCES public.canton(id);


--
-- Name: billing_document_line billing_document_line_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_document_line
    ADD CONSTRAINT billing_document_line_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.delivery(id);


--
-- Name: billing_document_line billing_document_line_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_document_line
    ADD CONSTRAINT billing_document_line_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.billing_document(id) ON DELETE CASCADE;


--
-- Name: billing_document_line billing_document_line_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_document_line
    ADD CONSTRAINT billing_document_line_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id);


--
-- Name: billing_document billing_document_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_document
    ADD CONSTRAINT billing_document_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.billing_run(id) ON DELETE CASCADE;


--
-- Name: billing_period billing_period_frozen_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_period
    ADD CONSTRAINT billing_period_frozen_by_fkey FOREIGN KEY (frozen_by) REFERENCES auth.users(id);


--
-- Name: billing_period billing_period_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_period
    ADD CONSTRAINT billing_period_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id);


--
-- Name: billing_run billing_run_admin_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_run
    ADD CONSTRAINT billing_run_admin_region_id_fkey FOREIGN KEY (admin_region_id) REFERENCES public.admin_region(id) ON DELETE CASCADE;


--
-- Name: city city_admin_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.city
    ADD CONSTRAINT city_admin_region_id_fkey FOREIGN KEY (admin_region_id) REFERENCES public.admin_region(id);


--
-- Name: city city_canton_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.city
    ADD CONSTRAINT city_canton_id_fkey FOREIGN KEY (canton_id) REFERENCES public.canton(id);


--
-- Name: city city_parent_city_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.city
    ADD CONSTRAINT city_parent_city_id_fkey FOREIGN KEY (parent_city_id) REFERENCES public.city(id);


--
-- Name: city_postal_code city_postal_code_city_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.city_postal_code
    ADD CONSTRAINT city_postal_code_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.city(id) ON DELETE CASCADE;


--
-- Name: client client_city_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client
    ADD CONSTRAINT client_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.city(id);


--
-- Name: courier courier_admin_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier
    ADD CONSTRAINT courier_admin_region_id_fkey FOREIGN KEY (admin_region_id) REFERENCES public.admin_region(id);


--
-- Name: courier courier_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courier
    ADD CONSTRAINT courier_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: delivery delivery_admin_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery
    ADD CONSTRAINT delivery_admin_region_id_fkey FOREIGN KEY (admin_region_id) REFERENCES public.admin_region(id);


--
-- Name: delivery delivery_canton_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery
    ADD CONSTRAINT delivery_canton_id_fkey FOREIGN KEY (canton_id) REFERENCES public.canton(id);


--
-- Name: delivery delivery_city_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery
    ADD CONSTRAINT delivery_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.city(id);


--
-- Name: delivery delivery_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery
    ADD CONSTRAINT delivery_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id);


--
-- Name: delivery delivery_courier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery
    ADD CONSTRAINT delivery_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES public.courier(id);


--
-- Name: delivery_financial delivery_financial_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_financial
    ADD CONSTRAINT delivery_financial_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.delivery(id) ON DELETE CASCADE;


--
-- Name: delivery_financial delivery_financial_tariff_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_financial
    ADD CONSTRAINT delivery_financial_tariff_version_id_fkey FOREIGN KEY (tariff_version_id) REFERENCES public.tariff_version(id);


--
-- Name: delivery delivery_hq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery
    ADD CONSTRAINT delivery_hq_id_fkey FOREIGN KEY (hq_id) REFERENCES public.hq(id);


--
-- Name: delivery_logistics delivery_logistics_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_logistics
    ADD CONSTRAINT delivery_logistics_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.delivery(id) ON DELETE CASCADE;


--
-- Name: delivery delivery_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery
    ADD CONSTRAINT delivery_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id);


--
-- Name: delivery_status delivery_status_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_status
    ADD CONSTRAINT delivery_status_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.delivery(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_admin_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_admin_region_id_fkey FOREIGN KEY (admin_region_id) REFERENCES public.admin_region(id);


--
-- Name: profiles profiles_city_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.city(id);


--
-- Name: profiles profiles_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_hq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_hq_id_fkey FOREIGN KEY (hq_id) REFERENCES public.hq(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id);


--
-- Name: shop shop_city_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop
    ADD CONSTRAINT shop_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.city(id);


--
-- Name: shop shop_hq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop
    ADD CONSTRAINT shop_hq_id_fkey FOREIGN KEY (hq_id) REFERENCES public.hq(id);


--
-- Name: shop shop_tariff_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop
    ADD CONSTRAINT shop_tariff_version_id_fkey FOREIGN KEY (tariff_version_id) REFERENCES public.tariff_version(id);


--
-- Name: tariff_version tariff_version_tariff_grid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tariff_version
    ADD CONSTRAINT tariff_version_tariff_grid_fkey FOREIGN KEY (tariff_grid_id) REFERENCES public.tariff_grid(id);


--
-- Name: tariff_version tariff_version_tariff_grid_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tariff_version
    ADD CONSTRAINT tariff_version_tariff_grid_id_fkey FOREIGN KEY (tariff_grid_id) REFERENCES public.tariff_grid(id);


--
-- Name: admin_region; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_region ENABLE ROW LEVEL SECURITY;

--
-- Name: city admin_region_city_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_region_city_policy ON public.city FOR SELECT USING (((admin_region_id = public.get_my_admin_region_id()) OR (public.get_my_admin_region_id() IS NULL)));


--
-- Name: courier admin_region_courier_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_region_courier_policy ON public.courier USING ((admin_region_id = public.get_my_admin_region_id()));


--
-- Name: delivery admin_region_delivery_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_region_delivery_policy ON public.delivery FOR SELECT USING ((shop_id IN ( SELECT s.id
   FROM (public.shop s
     JOIN public.city c ON ((c.id = s.city_id)))
  WHERE (c.admin_region_id = public.get_my_admin_region_id()))));


--
-- Name: admin_region admin_region_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_region_read_policy ON public.admin_region FOR SELECT USING ((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'authenticated'::text));


--
-- Name: shop admin_region_shop_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_region_shop_policy ON public.shop USING ((city_id IN ( SELECT city.id
   FROM public.city
  WHERE (city.admin_region_id = public.get_my_admin_region_id()))));


--
-- Name: admin_region admin_region_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_region_update_policy ON public.admin_region FOR UPDATE USING (((((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'admin_region'::text) AND (id = public.get_my_admin_region_id())) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text))) WITH CHECK (((((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'admin_region'::text) AND (id = public.get_my_admin_region_id())) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings app_settings_manage_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_manage_policy ON public.app_settings USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text))) WITH CHECK (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: app_settings app_settings_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_read_policy ON public.app_settings FOR SELECT USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['super_admin'::text, 'admin_region'::text, 'hq'::text, 'city'::text, 'shop'::text, 'customer'::text]))));


--
-- Name: billing_document; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_document ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_document_line; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_document_line ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_document_line billing_document_line_manage_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_document_line_manage_policy ON public.billing_document_line USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['super_admin'::text, 'admin_region'::text])))) WITH CHECK (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['super_admin'::text, 'admin_region'::text]))));


--
-- Name: billing_document_line billing_document_line_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_document_line_read_policy ON public.billing_document_line FOR SELECT USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['super_admin'::text, 'admin_region'::text]))));


--
-- Name: billing_document billing_document_manage_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_document_manage_policy ON public.billing_document USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['super_admin'::text, 'admin_region'::text])))) WITH CHECK (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['super_admin'::text, 'admin_region'::text]))));


--
-- Name: billing_document billing_document_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_document_read_policy ON public.billing_document FOR SELECT USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['super_admin'::text, 'admin_region'::text]))));


--
-- Name: billing_period; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_period ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_period billing_period_manage_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_period_manage_policy ON public.billing_period USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'admin_region'::text) AND (shop_id IN ( SELECT s.id
   FROM (public.shop s
     JOIN public.city c ON ((c.id = s.city_id)))
  WHERE (c.admin_region_id = public.get_my_admin_region_id())))))) WITH CHECK (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'admin_region'::text) AND (shop_id IN ( SELECT s.id
   FROM (public.shop s
     JOIN public.city c ON ((c.id = s.city_id)))
  WHERE (c.admin_region_id = public.get_my_admin_region_id()))))));


--
-- Name: billing_period billing_period_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_period_read_policy ON public.billing_period FOR SELECT USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'admin_region'::text) AND (shop_id IN ( SELECT s.id
   FROM (public.shop s
     JOIN public.city c ON ((c.id = s.city_id)))
  WHERE (c.admin_region_id = public.get_my_admin_region_id())))) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'shop'::text) AND (shop_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'shop_id'::text), ''::text))::uuid)) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'hq'::text) AND (shop_id IN ( SELECT s.id
   FROM public.shop s
  WHERE (s.hq_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'hq_id'::text), ''::text))::uuid)))) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'city'::text) AND (shop_id IN ( SELECT s.id
   FROM public.shop s
  WHERE (s.city_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'city_id'::text), ''::text))::uuid))))));


--
-- Name: billing_run; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_run ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_run billing_run_manage_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_run_manage_policy ON public.billing_run USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['super_admin'::text, 'admin_region'::text])))) WITH CHECK (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['super_admin'::text, 'admin_region'::text]))));


--
-- Name: billing_run billing_run_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_run_read_policy ON public.billing_run FOR SELECT USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['super_admin'::text, 'admin_region'::text]))));


--
-- Name: canton; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.canton ENABLE ROW LEVEL SECURITY;

--
-- Name: canton canton_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY canton_read_policy ON public.canton FOR SELECT USING ((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'authenticated'::text));


--
-- Name: city; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.city ENABLE ROW LEVEL SECURITY;

--
-- Name: city_postal_code; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.city_postal_code ENABLE ROW LEVEL SECURITY;

--
-- Name: city_postal_code city_postal_code_manage_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY city_postal_code_manage_policy ON public.city_postal_code USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'admin_region'::text) AND (EXISTS ( SELECT 1
   FROM public.city c
  WHERE ((c.id = city_postal_code.city_id) AND (c.admin_region_id = public.get_my_admin_region_id()))))) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'city'::text) AND (city_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'city_id'::text), ''::text))::uuid)))) WITH CHECK (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'admin_region'::text) AND (EXISTS ( SELECT 1
   FROM public.city c
  WHERE ((c.id = city_postal_code.city_id) AND (c.admin_region_id = public.get_my_admin_region_id()))))) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'city'::text) AND (city_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'city_id'::text), ''::text))::uuid))));


--
-- Name: city_postal_code city_postal_code_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY city_postal_code_read_policy ON public.city_postal_code FOR SELECT USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'admin_region'::text) AND (EXISTS ( SELECT 1
   FROM public.city c
  WHERE ((c.id = city_postal_code.city_id) AND (c.admin_region_id = public.get_my_admin_region_id()))))) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'city'::text) AND (city_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'city_id'::text), ''::text))::uuid))));


--
-- Name: client; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client ENABLE ROW LEVEL SECURITY;

--
-- Name: client client_manage_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_manage_policy ON public.client USING (((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'super_admin'::text) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'admin_region'::text) AND (city_id IN ( SELECT city.id
   FROM public.city
  WHERE (city.admin_region_id = public.get_my_admin_region_id())))))) WITH CHECK (((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'super_admin'::text) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'admin_region'::text) AND (city_id IN ( SELECT city.id
   FROM public.city
  WHERE (city.admin_region_id = public.get_my_admin_region_id()))))));


--
-- Name: client client_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_read_policy ON public.client FOR SELECT USING (((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'super_admin'::text) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = ANY (ARRAY['admin_region'::text, 'shop'::text])) AND (city_id IN ( SELECT city.id
   FROM public.city
  WHERE (city.admin_region_id = public.get_my_admin_region_id())))) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'city'::text) AND (city_id = (NULLIF(COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'city_id'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'city_id'::text)), ''::text))::uuid)) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'hq'::text) AND (city_id IN ( SELECT c.id
   FROM (public.shop s
     JOIN public.city c ON ((c.id = s.city_id)))
  WHERE (s.hq_id = (NULLIF(COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'hq_id'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'hq_id'::text)), ''::text))::uuid))))));


--
-- Name: client client_shop_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_shop_insert_policy ON public.client FOR INSERT WITH CHECK (((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'shop'::text) AND (city_id IN ( SELECT c.id
   FROM (public.shop s
     JOIN public.city c ON ((c.id = s.city_id)))
  WHERE ((s.id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'shop_id'::text), ''::text))::uuid) AND (c.admin_region_id = ( SELECT c2.admin_region_id
           FROM (public.shop s2
             JOIN public.city c2 ON ((c2.id = s2.city_id)))
          WHERE (s2.id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'shop_id'::text), ''::text))::uuid))))))));


--
-- Name: client client_shop_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_shop_read_policy ON public.client FOR SELECT USING (((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'shop'::text) AND (city_id IN ( SELECT c.id
   FROM (public.shop s
     JOIN public.city c ON ((c.id = s.city_id)))
  WHERE ((s.id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'shop_id'::text), ''::text))::uuid) AND (c.admin_region_id = ( SELECT c2.admin_region_id
           FROM (public.shop s2
             JOIN public.city c2 ON ((c2.id = s2.city_id)))
          WHERE (s2.id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'shop_id'::text), ''::text))::uuid))))))));


--
-- Name: client client_update_self_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_update_self_policy ON public.client FOR UPDATE USING ((((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'customer'::text) AND (id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'client_id'::text), ''::text))::uuid))) WITH CHECK ((((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'customer'::text) AND (id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'client_id'::text), ''::text))::uuid)));


--
-- Name: courier; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courier ENABLE ROW LEVEL SECURITY;

--
-- Name: courier courier_dispatch_region_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courier_dispatch_region_select_policy ON public.courier FOR SELECT USING ((((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'courier'::text) AND (EXISTS ( SELECT 1
   FROM public.courier co
  WHERE ((co.user_id = auth.uid()) AND (co.can_dispatch = true) AND (co.admin_region_id = courier.admin_region_id))))));


--
-- Name: courier courier_self_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courier_self_select_policy ON public.courier FOR SELECT USING ((((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'courier'::text) AND (user_id = auth.uid())));


--
-- Name: delivery; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery delivery_city_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_city_select_policy ON public.delivery FOR SELECT USING (((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'city'::text) AND (city_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'city_id'::text), ''::text))::uuid)));


--
-- Name: delivery delivery_courier_dispatch_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_courier_dispatch_select_policy ON public.delivery FOR SELECT USING ((((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'courier'::text) AND (EXISTS ( SELECT 1
   FROM ((public.courier co
     JOIN public.shop s ON ((s.id = delivery.shop_id)))
     JOIN public.city c ON ((c.id = s.city_id)))
  WHERE ((co.user_id = auth.uid()) AND (co.can_dispatch = true) AND (c.admin_region_id = co.admin_region_id))))));


--
-- Name: delivery delivery_courier_dispatch_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_courier_dispatch_update_policy ON public.delivery FOR UPDATE USING ((((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'courier'::text) AND (EXISTS ( SELECT 1
   FROM ((public.courier co
     JOIN public.shop s ON ((s.id = delivery.shop_id)))
     JOIN public.city c ON ((c.id = s.city_id)))
  WHERE ((co.user_id = auth.uid()) AND (co.can_dispatch = true) AND (c.admin_region_id = co.admin_region_id)))))) WITH CHECK ((((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'courier'::text) AND (EXISTS ( SELECT 1
   FROM ((public.courier co
     JOIN public.shop s ON ((s.id = delivery.shop_id)))
     JOIN public.city c ON ((c.id = s.city_id)))
  WHERE ((co.user_id = auth.uid()) AND (co.can_dispatch = true) AND (c.admin_region_id = co.admin_region_id))))));


--
-- Name: delivery delivery_courier_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_courier_select_policy ON public.delivery FOR SELECT USING (((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'courier'::text) AND (courier_id = ( SELECT courier.id
   FROM public.courier
  WHERE ((courier.user_id = (NULLIF(((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'sub'::text), ''::text))::uuid) OR ((courier.email IS NOT NULL) AND (lower(courier.email) = lower(NULLIF(((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'email'::text), ''::text)))))
 LIMIT 1))));


--
-- Name: delivery_financial; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery_financial ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery_financial delivery_financial_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_financial_select_policy ON public.delivery_financial FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.delivery d
  WHERE ((d.id = delivery_financial.delivery_id) AND (((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'shop'::text) AND (d.shop_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'shop_id'::text), ''::text))::uuid)) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'admin_region'::text) AND (d.admin_region_id = public.get_my_admin_region_id())) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'city'::text) AND (d.city_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'city_id'::text), ''::text))::uuid)) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'hq'::text) AND (d.hq_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'hq_id'::text), ''::text))::uuid)) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'courier'::text) AND (d.courier_id = ( SELECT courier.id
           FROM public.courier
          WHERE ((courier.user_id = (NULLIF(((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'sub'::text), ''::text))::uuid) OR ((courier.email IS NOT NULL) AND (lower(courier.email) = lower(NULLIF(((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'email'::text), ''::text)))))
         LIMIT 1))))))));


--
-- Name: delivery_financial delivery_financial_shop_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_financial_shop_insert_policy ON public.delivery_financial FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.delivery d
  WHERE ((d.id = delivery_financial.delivery_id) AND (COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'shop'::text) AND (d.shop_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'shop_id'::text), ''::text))::uuid)))));


--
-- Name: delivery delivery_hq_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_hq_select_policy ON public.delivery FOR SELECT USING (((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'hq'::text) AND (hq_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'hq_id'::text), ''::text))::uuid)));


--
-- Name: delivery_logistics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery_logistics ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery_logistics delivery_logistics_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_logistics_select_policy ON public.delivery_logistics FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.delivery d
  WHERE ((d.id = delivery_logistics.delivery_id) AND (((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'shop'::text) AND (d.shop_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'shop_id'::text), ''::text))::uuid)) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'admin_region'::text) AND (d.admin_region_id = public.get_my_admin_region_id())) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'city'::text) AND (d.city_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'city_id'::text), ''::text))::uuid)) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'hq'::text) AND (d.hq_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'hq_id'::text), ''::text))::uuid)) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'courier'::text) AND (d.courier_id = ( SELECT courier.id
           FROM public.courier
          WHERE ((courier.user_id = (NULLIF(((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'sub'::text), ''::text))::uuid) OR ((courier.email IS NOT NULL) AND (lower(courier.email) = lower(NULLIF(((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'email'::text), ''::text)))))
         LIMIT 1))))))));


--
-- Name: delivery_logistics delivery_logistics_shop_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_logistics_shop_insert_policy ON public.delivery_logistics FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.delivery d
  WHERE ((d.id = delivery_logistics.delivery_id) AND (COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'shop'::text) AND (d.shop_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'shop_id'::text), ''::text))::uuid)))));


--
-- Name: delivery delivery_shop_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_shop_insert_policy ON public.delivery FOR INSERT WITH CHECK (((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'shop'::text) AND (shop_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'shop_id'::text), ''::text))::uuid)));


--
-- Name: delivery delivery_shop_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_shop_select_policy ON public.delivery FOR SELECT USING (((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'shop'::text) AND (shop_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'shop_id'::text), ''::text))::uuid)));


--
-- Name: delivery_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery_status ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery_status delivery_status_courier_dispatch_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_status_courier_dispatch_insert_policy ON public.delivery_status FOR INSERT WITH CHECK ((((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'courier'::text) AND (EXISTS ( SELECT 1
   FROM (((public.courier co
     JOIN public.delivery d ON ((d.id = delivery_status.delivery_id)))
     JOIN public.shop s ON ((s.id = d.shop_id)))
     JOIN public.city c ON ((c.id = s.city_id)))
  WHERE ((co.user_id = auth.uid()) AND (co.can_dispatch = true) AND (c.admin_region_id = co.admin_region_id))))));


--
-- Name: delivery_status delivery_status_courier_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_status_courier_insert_policy ON public.delivery_status FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.delivery d
  WHERE ((d.id = delivery_status.delivery_id) AND (COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'courier'::text) AND (d.courier_id = ( SELECT courier.id
           FROM public.courier
          WHERE ((courier.user_id = (NULLIF(((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'sub'::text), ''::text))::uuid) OR ((courier.email IS NOT NULL) AND (lower(courier.email) = lower(NULLIF(((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'email'::text), ''::text)))))
         LIMIT 1))))));


--
-- Name: delivery_status delivery_status_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_status_read_policy ON public.delivery_status FOR SELECT USING ((((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'admin_region'::text) AND (EXISTS ( SELECT 1
   FROM public.delivery d
  WHERE ((d.id = delivery_status.delivery_id) AND (d.admin_region_id = public.get_my_admin_region_id()))))) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'shop'::text) AND (EXISTS ( SELECT 1
   FROM public.delivery d
  WHERE ((d.id = delivery_status.delivery_id) AND (d.shop_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'shop_id'::text), ''::text))::uuid))))) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'city'::text) AND (EXISTS ( SELECT 1
   FROM public.delivery d
  WHERE ((d.id = delivery_status.delivery_id) AND (d.city_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'city_id'::text), ''::text))::uuid))))) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'hq'::text) AND (EXISTS ( SELECT 1
   FROM public.delivery d
  WHERE ((d.id = delivery_status.delivery_id) AND (d.hq_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'hq_id'::text), ''::text))::uuid)))))));


--
-- Name: delivery_status delivery_status_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_status_select_policy ON public.delivery_status FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.delivery d
  WHERE ((d.id = delivery_status.delivery_id) AND (((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'shop'::text) AND (d.shop_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'shop_id'::text), ''::text))::uuid)) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'admin_region'::text) AND (d.admin_region_id = public.get_my_admin_region_id())) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'city'::text) AND (d.city_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'city_id'::text), ''::text))::uuid)) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'hq'::text) AND (d.hq_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'hq_id'::text), ''::text))::uuid)) OR ((COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'courier'::text) AND (d.courier_id = ( SELECT courier.id
           FROM public.courier
          WHERE ((courier.user_id = (NULLIF(((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'sub'::text), ''::text))::uuid) OR ((courier.email IS NOT NULL) AND (lower(courier.email) = lower(NULLIF(((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'email'::text), ''::text)))))
         LIMIT 1))))))));


--
-- Name: delivery_status delivery_status_shop_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delivery_status_shop_insert_policy ON public.delivery_status FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.delivery d
  WHERE ((d.id = delivery_status.delivery_id) AND (COALESCE((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text), ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text)) = 'shop'::text) AND (d.shop_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'shop_id'::text), ''::text))::uuid)))));


--
-- Name: hq; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hq ENABLE ROW LEVEL SECURITY;

--
-- Name: hq hq_manage_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hq_manage_policy ON public.hq USING (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['super_admin'::text, 'admin_region'::text]))) WITH CHECK (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['super_admin'::text, 'admin_region'::text])));


--
-- Name: hq hq_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hq_read_policy ON public.hq FOR SELECT USING ((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'authenticated'::text));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_self_read ON public.profiles FOR SELECT USING ((id = (NULLIF(((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'sub'::text), ''::text))::uuid));


--
-- Name: admin_region service_role_bypass_admin_region; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_bypass_admin_region ON public.admin_region USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: billing_period service_role_bypass_billing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_bypass_billing ON public.billing_period USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: canton service_role_bypass_canton; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_bypass_canton ON public.canton USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: city service_role_bypass_city; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_bypass_city ON public.city USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: client service_role_bypass_client; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_bypass_client ON public.client USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: courier service_role_bypass_courier; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_bypass_courier ON public.courier USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: delivery service_role_bypass_delivery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_bypass_delivery ON public.delivery USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: delivery_status service_role_bypass_delivery_status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_bypass_delivery_status ON public.delivery_status USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: delivery_financial service_role_bypass_financial; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_bypass_financial ON public.delivery_financial USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: hq service_role_bypass_hq; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_bypass_hq ON public.hq USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: delivery_logistics service_role_bypass_logistics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_bypass_logistics ON public.delivery_logistics USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: profiles service_role_bypass_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_bypass_profiles ON public.profiles USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: shop service_role_bypass_shop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_bypass_shop ON public.shop USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: tariff_grid service_role_bypass_tariff_grid; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_bypass_tariff_grid ON public.tariff_grid USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: tariff_version service_role_bypass_tariff_version; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_bypass_tariff_version ON public.tariff_version USING (((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: shop; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shop ENABLE ROW LEVEL SECURITY;

--
-- Name: tariff_grid; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tariff_grid ENABLE ROW LEVEL SECURITY;

--
-- Name: tariff_grid tariff_grid_manage_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tariff_grid_manage_policy ON public.tariff_grid USING (((admin_region_id = public.get_my_admin_region_id()) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text))) WITH CHECK (((admin_region_id = public.get_my_admin_region_id()) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: tariff_grid tariff_grid_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tariff_grid_read_policy ON public.tariff_grid FOR SELECT USING ((((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'admin_region'::text) AND (admin_region_id = public.get_my_admin_region_id())) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'shop'::text) AND (EXISTS ( SELECT 1
   FROM (public.shop s
     JOIN public.tariff_version tv ON ((s.tariff_version_id = tv.id)))
  WHERE ((s.id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'shop_id'::text), ''::text))::uuid) AND (tv.tariff_grid_id = tariff_grid.id))))) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'city'::text) AND (EXISTS ( SELECT 1
   FROM (public.shop s
     JOIN public.tariff_version tv ON ((s.tariff_version_id = tv.id)))
  WHERE ((s.city_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'city_id'::text), ''::text))::uuid) AND (tv.tariff_grid_id = tariff_grid.id))))) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'hq'::text) AND (EXISTS ( SELECT 1
   FROM (public.shop s
     JOIN public.tariff_version tv ON ((s.tariff_version_id = tv.id)))
  WHERE ((s.hq_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'hq_id'::text), ''::text))::uuid) AND (tv.tariff_grid_id = tariff_grid.id)))))));


--
-- Name: tariff_version; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tariff_version ENABLE ROW LEVEL SECURITY;

--
-- Name: tariff_version tariff_version_manage_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tariff_version_manage_policy ON public.tariff_version USING (((tariff_grid_id IN ( SELECT tariff_grid.id
   FROM public.tariff_grid
  WHERE (tariff_grid.admin_region_id = public.get_my_admin_region_id()))) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text))) WITH CHECK (((tariff_grid_id IN ( SELECT tariff_grid.id
   FROM public.tariff_grid
  WHERE (tariff_grid.admin_region_id = public.get_my_admin_region_id()))) OR ((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));


--
-- Name: tariff_version tariff_version_read_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tariff_version_read_policy ON public.tariff_version FOR SELECT USING ((((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'admin_region'::text) AND (tariff_grid_id IN ( SELECT tariff_grid.id
   FROM public.tariff_grid
  WHERE (tariff_grid.admin_region_id = public.get_my_admin_region_id())))) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'shop'::text) AND (EXISTS ( SELECT 1
   FROM public.shop s
  WHERE ((s.id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'shop_id'::text), ''::text))::uuid) AND (s.tariff_version_id = tariff_version.id))))) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'city'::text) AND (EXISTS ( SELECT 1
   FROM public.shop s
  WHERE ((s.city_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'city_id'::text), ''::text))::uuid) AND (s.tariff_version_id = tariff_version.id))))) OR (((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'hq'::text) AND (EXISTS ( SELECT 1
   FROM public.shop s
  WHERE ((s.hq_id = (NULLIF((((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'hq_id'::text), ''::text))::uuid) AND (s.tariff_version_id = tariff_version.id)))))));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--



--
-- Name: FUNCTION get_my_admin_region_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_my_admin_region_id() TO anon;
GRANT ALL ON FUNCTION public.get_my_admin_region_id() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_admin_region_id() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: TABLE admin_region; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_region TO anon;
GRANT ALL ON TABLE public.admin_region TO authenticated;
GRANT ALL ON TABLE public.admin_region TO service_role;


--
-- Name: TABLE app_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_settings TO anon;
GRANT ALL ON TABLE public.app_settings TO authenticated;
GRANT ALL ON TABLE public.app_settings TO service_role;


--
-- Name: TABLE billing_document; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_document TO anon;
GRANT ALL ON TABLE public.billing_document TO authenticated;
GRANT ALL ON TABLE public.billing_document TO service_role;


--
-- Name: TABLE billing_document_line; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_document_line TO anon;
GRANT ALL ON TABLE public.billing_document_line TO authenticated;
GRANT ALL ON TABLE public.billing_document_line TO service_role;


--
-- Name: TABLE billing_period; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_period TO anon;
GRANT ALL ON TABLE public.billing_period TO authenticated;
GRANT ALL ON TABLE public.billing_period TO service_role;


--
-- Name: TABLE billing_run; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_run TO anon;
GRANT ALL ON TABLE public.billing_run TO authenticated;
GRANT ALL ON TABLE public.billing_run TO service_role;


--
-- Name: TABLE canton; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.canton TO anon;
GRANT ALL ON TABLE public.canton TO authenticated;
GRANT ALL ON TABLE public.canton TO service_role;


--
-- Name: TABLE city; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.city TO anon;
GRANT ALL ON TABLE public.city TO authenticated;
GRANT ALL ON TABLE public.city TO service_role;


--
-- Name: TABLE city_postal_code; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.city_postal_code TO anon;
GRANT ALL ON TABLE public.city_postal_code TO authenticated;
GRANT ALL ON TABLE public.city_postal_code TO service_role;


--
-- Name: TABLE client; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.client TO anon;
GRANT ALL ON TABLE public.client TO authenticated;
GRANT ALL ON TABLE public.client TO service_role;


--
-- Name: TABLE courier; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.courier TO anon;
GRANT ALL ON TABLE public.courier TO authenticated;
GRANT ALL ON TABLE public.courier TO service_role;


--
-- Name: TABLE delivery; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.delivery TO anon;
GRANT ALL ON TABLE public.delivery TO authenticated;
GRANT ALL ON TABLE public.delivery TO service_role;


--
-- Name: TABLE delivery_financial; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.delivery_financial TO anon;
GRANT ALL ON TABLE public.delivery_financial TO authenticated;
GRANT ALL ON TABLE public.delivery_financial TO service_role;


--
-- Name: TABLE delivery_logistics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.delivery_logistics TO anon;
GRANT ALL ON TABLE public.delivery_logistics TO authenticated;
GRANT ALL ON TABLE public.delivery_logistics TO service_role;


--
-- Name: TABLE delivery_status; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.delivery_status TO anon;
GRANT ALL ON TABLE public.delivery_status TO authenticated;
GRANT ALL ON TABLE public.delivery_status TO service_role;


--
-- Name: TABLE hq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hq TO anon;
GRANT ALL ON TABLE public.hq TO authenticated;
GRANT ALL ON TABLE public.hq TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE shop; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shop TO anon;
GRANT ALL ON TABLE public.shop TO authenticated;
GRANT ALL ON TABLE public.shop TO service_role;


--
-- Name: TABLE tariff_grid; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tariff_grid TO anon;
GRANT ALL ON TABLE public.tariff_grid TO authenticated;
GRANT ALL ON TABLE public.tariff_grid TO service_role;


--
-- Name: TABLE tariff_version; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tariff_version TO anon;
GRANT ALL ON TABLE public.tariff_version TO authenticated;
GRANT ALL ON TABLE public.tariff_version TO service_role;


--
-- Name: TABLE view_city_billing; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.view_city_billing TO anon;
GRANT ALL ON TABLE public.view_city_billing TO authenticated;
GRANT ALL ON TABLE public.view_city_billing TO service_role;


--
-- Name: TABLE view_city_billing_shops; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.view_city_billing_shops TO anon;
GRANT ALL ON TABLE public.view_city_billing_shops TO authenticated;
GRANT ALL ON TABLE public.view_city_billing_shops TO service_role;


--
-- Name: TABLE view_hq_billing_shops; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.view_hq_billing_shops TO anon;
GRANT ALL ON TABLE public.view_hq_billing_shops TO authenticated;
GRANT ALL ON TABLE public.view_hq_billing_shops TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--


