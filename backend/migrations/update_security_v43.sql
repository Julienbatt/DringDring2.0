-- Security: accept top-level claims for admin region + role in client RLS

CREATE OR REPLACE FUNCTION public.get_my_admin_region_id() RETURNS uuid AS $$
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
$$ LANGUAGE plpgsql STABLE;

DO $$
BEGIN
  IF to_regclass('public.client') IS NOT NULL THEN
    DROP POLICY IF EXISTS client_read_policy ON public.client;
    CREATE POLICY client_read_policy ON public.client FOR SELECT USING (
      COALESCE(
        current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role',
        current_setting('request.jwt.claims', true)::jsonb ->> 'role'
      ) = 'super_admin'
      OR (
        COALESCE(
          current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role',
          current_setting('request.jwt.claims', true)::jsonb ->> 'role'
        ) IN ('admin_region', 'shop')
        AND city_id IN (
          SELECT id FROM public.city
          WHERE admin_region_id = get_my_admin_region_id()
        )
      )
      OR (
        COALESCE(
          current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role',
          current_setting('request.jwt.claims', true)::jsonb ->> 'role'
        ) = 'city'
        AND city_id = NULLIF(
          COALESCE(
            current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'city_id',
            current_setting('request.jwt.claims', true)::jsonb ->> 'city_id'
          ),
          ''
        )::uuid
      )
      OR (
        COALESCE(
          current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role',
          current_setting('request.jwt.claims', true)::jsonb ->> 'role'
        ) = 'hq'
        AND city_id IN (
          SELECT c.id
          FROM public.shop s
          JOIN public.city c ON c.id = s.city_id
          WHERE s.hq_id = NULLIF(
            COALESCE(
              current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'hq_id',
              current_setting('request.jwt.claims', true)::jsonb ->> 'hq_id'
            ),
            ''
          )::uuid
        )
      )
    );

    DROP POLICY IF EXISTS client_manage_policy ON public.client;
    CREATE POLICY client_manage_policy ON public.client
      FOR ALL
      USING (
        COALESCE(
          current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role',
          current_setting('request.jwt.claims', true)::jsonb ->> 'role'
        ) = 'super_admin'
        OR (
          COALESCE(
            current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role',
            current_setting('request.jwt.claims', true)::jsonb ->> 'role'
          ) = 'admin_region'
          AND city_id IN (
            SELECT id FROM public.city
            WHERE admin_region_id = get_my_admin_region_id()
          )
        )
      )
      WITH CHECK (
        COALESCE(
          current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role',
          current_setting('request.jwt.claims', true)::jsonb ->> 'role'
        ) = 'super_admin'
        OR (
          COALESCE(
            current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role',
            current_setting('request.jwt.claims', true)::jsonb ->> 'role'
          ) = 'admin_region'
          AND city_id IN (
            SELECT id FROM public.city
            WHERE admin_region_id = get_my_admin_region_id()
          )
        )
      );
  END IF;

  IF to_regprocedure('public.get_my_admin_region_id()') IS NOT NULL THEN
    ALTER FUNCTION public.get_my_admin_region_id() SET search_path = public;
  END IF;
END $$;
