-- Allow courier with can_dispatch to access dispatch flows (read/update deliveries in their region)
-- and allow couriers to read their own courier row.

-- Courier can read their own row
DROP POLICY IF EXISTS courier_self_select_policy ON public.courier;
CREATE POLICY courier_self_select_policy ON public.courier
  FOR SELECT
  USING (
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role' = 'courier'
    AND user_id = auth.uid()
  );

-- Courier with can_dispatch can see deliveries in their admin region
DROP POLICY IF EXISTS delivery_courier_dispatch_select_policy ON public.delivery;
CREATE POLICY delivery_courier_dispatch_select_policy ON public.delivery
  FOR SELECT
  USING (
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role' = 'courier'
    AND EXISTS (
      SELECT 1
      FROM public.courier co
      JOIN public.shop s ON s.id = public.delivery.shop_id
      JOIN public.city c ON c.id = s.city_id
      WHERE co.user_id = auth.uid()
        AND co.can_dispatch = true
        AND c.admin_region_id = co.admin_region_id
    )
  );

-- Courier with can_dispatch can assign delivery (update)
DROP POLICY IF EXISTS delivery_courier_dispatch_update_policy ON public.delivery;
CREATE POLICY delivery_courier_dispatch_update_policy ON public.delivery
  FOR UPDATE
  USING (
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role' = 'courier'
    AND EXISTS (
      SELECT 1
      FROM public.courier co
      JOIN public.shop s ON s.id = public.delivery.shop_id
      JOIN public.city c ON c.id = s.city_id
      WHERE co.user_id = auth.uid()
        AND co.can_dispatch = true
        AND c.admin_region_id = co.admin_region_id
    )
  )
  WITH CHECK (
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role' = 'courier'
    AND EXISTS (
      SELECT 1
      FROM public.courier co
      JOIN public.shop s ON s.id = public.delivery.shop_id
      JOIN public.city c ON c.id = s.city_id
      WHERE co.user_id = auth.uid()
        AND co.can_dispatch = true
        AND c.admin_region_id = co.admin_region_id
    )
  );

-- Courier with can_dispatch can insert delivery_status for deliveries in their region
DROP POLICY IF EXISTS delivery_status_courier_dispatch_insert_policy ON public.delivery_status;
CREATE POLICY delivery_status_courier_dispatch_insert_policy ON public.delivery_status
  FOR INSERT
  WITH CHECK (
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role' = 'courier'
    AND EXISTS (
      SELECT 1
      FROM public.courier co
      JOIN public.delivery d ON d.id = public.delivery_status.delivery_id
      JOIN public.shop s ON s.id = d.shop_id
      JOIN public.city c ON c.id = s.city_id
      WHERE co.user_id = auth.uid()
        AND co.can_dispatch = true
        AND c.admin_region_id = co.admin_region_id
    )
  );
