-- Phase 2 / DISP-03: append-only audit trail for delivery corrections.

CREATE TABLE IF NOT EXISTS public.delivery_correction_audit (
    id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    delivery_id uuid NOT NULL,
    actor_user_id uuid NOT NULL,
    actor_role text NOT NULL,
    field text NOT NULL,
    old_value jsonb,
    new_value jsonb,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ONLY public.delivery_correction_audit
    ADD CONSTRAINT delivery_correction_audit_delivery_id_fkey
    FOREIGN KEY (delivery_id) REFERENCES public.delivery(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.delivery_correction_audit
    ADD CONSTRAINT delivery_correction_audit_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS delivery_correction_audit_delivery_created_idx
    ON public.delivery_correction_audit (delivery_id, created_at DESC);

CREATE INDEX IF NOT EXISTS delivery_correction_audit_actor_created_idx
    ON public.delivery_correction_audit (actor_user_id, created_at DESC);

ALTER TABLE public.delivery_correction_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_correction_audit_write_policy
    ON public.delivery_correction_audit
    FOR INSERT
    WITH CHECK (
        ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text
    );

CREATE POLICY delivery_correction_audit_read_policy
    ON public.delivery_correction_audit
    FOR SELECT
    USING (
        ((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text
        OR (((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'super_admin'::text
        OR (
            (((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'admin_region'::text
            AND delivery_id IN (
                SELECT d.id FROM public.delivery d
                JOIN public.shop s ON s.id = d.shop_id
                JOIN public.city c ON c.id = s.city_id
                WHERE c.admin_region_id = public.get_my_admin_region_id()
            )
        )
        OR (
            (((current_setting('request.jwt.claims'::text, true))::jsonb -> 'app_metadata'::text) ->> 'role'::text) = 'courier'::text
            AND delivery_id IN (
                SELECT d.id FROM public.delivery d
                JOIN public.courier co ON co.id = d.courier_id
                WHERE co.user_id = auth.uid()
            )
        )
    );
