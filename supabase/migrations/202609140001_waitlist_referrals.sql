BEGIN;
-- This migration only touches the website waitlist. No mobile dependencies.
-- Lock through backfill/constraint installation so concurrent signups cannot slip in.
LOCK TABLE public.waitlist_entries IN ACCESS EXCLUSIVE MODE;

CREATE FUNCTION public.waitlist_random_referral_code() RETURNS text
LANGUAGE sql VOLATILE SET search_path = '' AS $$
  SELECT pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 10));
$$;
REVOKE ALL ON FUNCTION public.waitlist_random_referral_code() FROM PUBLIC, anon, authenticated, service_role;

-- Only missing codes are backfilled. Keep original timestamps, status and relationships.
ALTER TABLE public.waitlist_entries DISABLE TRIGGER waitlist_updated_at;
DO $$
DECLARE entry_id uuid; candidate text; attempts integer; constraint_name text;
BEGIN
  FOR entry_id IN SELECT id FROM public.waitlist_entries WHERE referral_code IS NULL LOOP
    attempts := 0;
    LOOP
      attempts := attempts + 1;
      IF attempts > 20 THEN RAISE EXCEPTION 'Referral code generation unavailable'; END IF;
      candidate := public.waitlist_random_referral_code();
      BEGIN
        UPDATE public.waitlist_entries SET referral_code = candidate WHERE id = entry_id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS constraint_name = CONSTRAINT_NAME;
        IF constraint_name <> 'waitlist_entries_referral_code_key' THEN RAISE; END IF;
      END;
    END LOOP;
  END LOOP;
END;
$$;
ALTER TABLE public.waitlist_entries ENABLE TRIGGER waitlist_updated_at;
ALTER TABLE public.waitlist_entries ALTER COLUMN referral_code SET NOT NULL;
-- Pre-existing non-null codes are preserved; fail for review rather than silently replace them.
ALTER TABLE public.waitlist_entries ADD CONSTRAINT waitlist_referral_code_format CHECK (referral_code ~ '^[A-F0-9]{10}$');

CREATE FUNCTION public.join_waitlist(p_entry jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  signup_email text;
  source_code text;
  source_id uuid;
  inserted_id uuid;
  candidate text;
  attempts integer := 0;
  constraint_name text;
BEGIN
  IF pg_catalog.jsonb_typeof(p_entry) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid waitlist submission' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_entry) AS field(name)
    WHERE name NOT IN ('email','city_region','gender','interested_in','is_18_plus','heard_from','utm_source','utm_medium','utm_campaign','referral_code')) THEN
    RAISE EXCEPTION 'Invalid waitlist submission' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(p_entry) AS field(name,value)
    WHERE name <> 'is_18_plus' AND pg_catalog.jsonb_typeof(value) <> 'string')
    OR p_entry->'is_18_plus' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'Invalid waitlist submission' USING ERRCODE = '22023';
  END IF;
  signup_email := pg_catalog.lower(pg_catalog.btrim(p_entry->>'email'));
  IF signup_email IS NULL OR signup_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Invalid waitlist submission' USING ERRCODE = '22023';
  END IF;
  source_code := pg_catalog.upper(pg_catalog.btrim(p_entry->>'referral_code'));
  IF source_code IS NOT NULL AND source_code !~ '^[A-F0-9]{10}$' THEN
    RAISE EXCEPTION 'Invalid waitlist submission' USING ERRCODE = '22023';
  END IF;
  -- Serialize normalized-email submissions before generating a code. Hash collisions
  -- only serialize unrelated signups; they do not change identity or attribution.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(signup_email, 0));
  IF EXISTS (SELECT 1 FROM public.waitlist_entries WHERE email = signup_email) THEN
    RETURN NULL;
  END IF;
  -- Unknown and self-referral codes both become an ordinary signup.
  -- KEY SHARE prevents concurrent deletion of the referrer until this transaction ends.
  SELECT id INTO source_id FROM public.waitlist_entries
    WHERE referral_code = source_code AND email <> signup_email FOR KEY SHARE;
  LOOP
    attempts := attempts + 1;
    IF attempts > 20 THEN RAISE EXCEPTION 'Referral code generation unavailable'; END IF;
    candidate := public.waitlist_random_referral_code();
    IF EXISTS (SELECT 1 FROM public.waitlist_entries WHERE referral_code = candidate) THEN CONTINUE; END IF;
    inserted_id := NULL;
    BEGIN
      INSERT INTO public.waitlist_entries(email,city_region,gender,interested_in,is_18_plus,heard_from,utm_source,utm_medium,utm_campaign,referral_code,referred_by)
      VALUES (signup_email,pg_catalog.btrim(p_entry->>'city_region'),pg_catalog.btrim(p_entry->>'gender'),pg_catalog.btrim(p_entry->>'interested_in'),true,
        nullif(pg_catalog.btrim(p_entry->>'heard_from'),''),nullif(pg_catalog.btrim(p_entry->>'utm_source'),''),
        nullif(pg_catalog.btrim(p_entry->>'utm_medium'),''),nullif(pg_catalog.btrim(p_entry->>'utm_campaign'),''),candidate,source_id)
      ON CONFLICT (email) DO NOTHING RETURNING id INTO inserted_id;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS constraint_name = CONSTRAINT_NAME;
      IF constraint_name <> 'waitlist_entries_referral_code_key' THEN RAISE; END IF;
      CONTINUE;
    END;
    -- Defensive conflict handling for privileged inserts outside this RPC.
    IF inserted_id IS NULL THEN RETURN NULL; END IF;
    IF source_id IS NOT NULL THEN
      UPDATE public.waitlist_entries SET referral_count = referral_count + 1 WHERE id = source_id;
    END IF;
    -- Only a newly inserted entry can return its genuinely owned code.
    RETURN candidate;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.join_waitlist(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_waitlist(jsonb) TO service_role;
REVOKE ALL ON TABLE public.waitlist_entries FROM PUBLIC, anon, authenticated, service_role;
COMMIT;

