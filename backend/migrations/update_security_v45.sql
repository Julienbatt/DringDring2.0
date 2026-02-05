-- Allow courier with can_dispatch to list couriers in their admin region
DROP POLICY IF EXISTS courier_dispatch_region_select_policy ON public.courier;
CREATE POLICY courier_dispatch_region_select_policy ON public.courier
  FOR SELECT
  USING (
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role' = 'courier'
    AND EXISTS (
      SELECT 1
      FROM public.courier co
      WHERE co.user_id = auth.uid()
        AND co.can_dispatch = true
        AND co.admin_region_id = public.courier.admin_region_id
    )
  );
