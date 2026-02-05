-- RLS: allow admin_region to manage billing_period; allow role-based read access

DO $$
BEGIN
  IF to_regclass('public.billing_period') IS NOT NULL THEN
    ALTER TABLE public.billing_period ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS billing_period_read_policy ON public.billing_period;
    CREATE POLICY billing_period_read_policy ON public.billing_period
      FOR SELECT
      USING (
        current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role'
        OR current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role' = 'super_admin'
        OR (
          current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role' = 'admin_region'
          AND shop_id IN (
            SELECT s.id
            FROM public.shop s
            JOIN public.city c ON c.id = s.city_id
            WHERE c.admin_region_id = get_my_admin_region_id()
          )
        )
        OR (
          current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role' = 'shop'
          AND shop_id = NULLIF(
            current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'shop_id',
            ''
          )::uuid
        )
        OR (
          current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role' = 'hq'
          AND shop_id IN (
            SELECT s.id
            FROM public.shop s
            WHERE s.hq_id = NULLIF(
              current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'hq_id',
              ''
            )::uuid
          )
        )
        OR (
          current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role' = 'city'
          AND shop_id IN (
            SELECT s.id
            FROM public.shop s
            WHERE s.city_id = NULLIF(
              current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'city_id',
              ''
            )::uuid
          )
        )
      );

    DROP POLICY IF EXISTS billing_period_manage_policy ON public.billing_period;
    CREATE POLICY billing_period_manage_policy ON public.billing_period
      FOR ALL
      USING (
        current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role'
        OR current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role' = 'super_admin'
        OR (
          current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role' = 'admin_region'
          AND shop_id IN (
            SELECT s.id
            FROM public.shop s
            JOIN public.city c ON c.id = s.city_id
            WHERE c.admin_region_id = get_my_admin_region_id()
          )
        )
      )
      WITH CHECK (
        current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role'
        OR current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role' = 'super_admin'
        OR (
          current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role' = 'admin_region'
          AND shop_id IN (
            SELECT s.id
            FROM public.shop s
            JOIN public.city c ON c.id = s.city_id
            WHERE c.admin_region_id = get_my_admin_region_id()
          )
        )
      );
  END IF;
END $$;
