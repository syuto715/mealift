-- Harden public_foods approval and public read boundaries.
--
-- Scope:
--   1. Direct client writes to public.public_foods can no longer route a row
--      to approved by supplying approval_score/status.
--   2. The normal app upload path uses SECURITY DEFINER RPC
--      submit_public_food(payload jsonb), which computes approval_score on
--      the server and then lets the trigger route the row.
--   3. Approved community foods are exposed through a safe projection view;
--      the raw table no longer has the global approved-row SELECT policy.

-- Server-side score calculation. This mirrors the existing client-side
-- weights closely enough for routing while keeping the trust boundary in DB.
create or replace function public.compute_public_food_approval_score(
  p_user_id uuid,
  p_submission_id uuid,
  p_name_ja text,
  p_calories_per_serving real,
  p_protein_g real,
  p_fat_g real,
  p_carb_g real
)
returns integer
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  atwater real;
  denom real;
  deviation real;
  pfc_points real := 0;
  approved_count integer := 0;
  rejected_count integer := 0;
  history_points real := 0;
  similarity_points real := 0;
  auth_points real := 5;
  email_verified boolean := false;
  has_similarity boolean := false;
  raw_points real := 0;
  -- The old client scorer excluded barcodeMatch='skipped' from maxPossible,
  -- but source-photo proof is client-controlled here. Keep the image weight
  -- in the denominator without awarding image points until photos are
  -- represented by server-owned upload metadata.
  max_possible real := 85;
  score integer;
begin
  if p_user_id is null then
    return 0;
  end if;

  if
    p_calories_per_serving is not null and p_calories_per_serving >= 0 and
    p_protein_g is not null and p_protein_g >= 0 and
    p_fat_g is not null and p_fat_g >= 0 and
    p_carb_g is not null and p_carb_g >= 0
  then
    atwater := 4 * p_protein_g + 9 * p_fat_g + 4 * p_carb_g;
    denom := greatest(p_calories_per_serving, atwater, 1);
    deviation := abs(atwater - p_calories_per_serving) / denom;

    if deviation < 0.05 then
      pfc_points := 30;
    elsif deviation < 0.10 then
      pfc_points := 24;
    elsif deviation < 0.20 then
      pfc_points := 12;
    else
      pfc_points := 0;
    end if;
  end if;

  select
    count(*) filter (where status = 'approved'),
    count(*) filter (where status = 'rejected')
  into approved_count, rejected_count
  from public.public_foods
  where submitted_by = p_user_id
    and (p_submission_id is null or id <> p_submission_id);

  history_points :=
    20 * ((approved_count + 1)::real / (approved_count + rejected_count + 2)::real);

  if nullif(btrim(coalesce(p_name_ja, '')), '') is not null then
    select exists (
      select 1
      from public.public_foods pf
      where pf.status = 'approved'
        and (p_submission_id is null or pf.id <> p_submission_id)
        and (
          position(lower(btrim(p_name_ja)) in lower(pf.name_ja)) > 0
          or position(lower(pf.name_ja) in lower(btrim(p_name_ja))) > 0
        )
    ) into has_similarity;
    if has_similarity then
      similarity_points := 10;
    end if;
  end if;

  select (u.email_confirmed_at is not null)
  into email_verified
  from auth.users u
  where u.id = p_user_id;

  if coalesce(email_verified, false) then
    auth_points := 10;
  end if;

  raw_points :=
    pfc_points + history_points + similarity_points + auth_points;
  score := round(((raw_points / max_possible) * 100)::numeric)::integer;
  return least(100, greatest(0, score));
end;
$$;

revoke all on function public.compute_public_food_approval_score(
  uuid, uuid, text, real, real, real, real
) from public;

-- Replace the old trigger body. Untrusted table inserts are always routed to
-- pending_review with approval_score reset. The submit_public_food RPC sets a
-- transaction-local flag after computing a server-side score.
create or replace function public.auto_route_public_food()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rpc_submit boolean :=
    current_setting('mealift.trusted_public_food_submit', true) = 'on';
  admin_submit boolean :=
    auth.role() = 'service_role'
    or session_user in ('postgres', 'supabase_admin');
  effective_score integer := 0;
begin
  if tg_op not in ('INSERT', 'UPDATE') then
    return new;
  end if;

  if not rpc_submit then
    if admin_submit then
      return new;
    end if;

    if tg_op = 'UPDATE' then
      if
        old.status = 'approved'
        and (to_jsonb(new) - 'use_count' - 'updated_at')
          = (to_jsonb(old) - 'use_count' - 'updated_at')
      then
        return new;
      end if;

      new.status := old.status;
      new.approval_score := old.approval_score;
      new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at;
      new.rejection_reason := old.rejection_reason;
      new.flag_count := old.flag_count;
      new.use_count := old.use_count;
      return new;
    end if;

    new.status := 'pending_review';
    new.approval_score := 0;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.rejection_reason := null;
    new.flag_count := 0;
    new.use_count := 0;
    return new;
  end if;

  effective_score := coalesce(new.approval_score, 0);

  if effective_score >= 70 then
    new.status := 'approved';
    new.reviewed_at := now();
    new.rejection_reason := null;
  elsif effective_score >= 50 then
    new.status := 'pending_review';
    new.reviewed_at := null;
    new.rejection_reason := null;
  else
    new.status := 'rejected';
    new.reviewed_at := now();
    new.rejection_reason := coalesce(
      new.rejection_reason,
      'auto-rejected: server approval score below threshold'
    );
  end if;

  new.reviewed_by := null;
  return new;
end;
$$;

drop trigger if exists trg_auto_route_public_food on public.public_foods;
create trigger trg_auto_route_public_food
  before insert or update on public.public_foods
  for each row execute function public.auto_route_public_food();

-- Trusted app upload path. Client-provided submitted_by/status/review fields
-- and approval_score are ignored; the authenticated user and score come from
-- the server context.
create or replace function public.submit_public_food(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
  v_name_ja text;
  v_name_en text;
  v_brand text;
  v_barcode text;
  v_serving_size_g real;
  v_serving_unit text;
  v_serving_description text;
  v_calories_per_serving real;
  v_protein_g real;
  v_fat_g real;
  v_carb_g real;
  v_fiber_g real;
  v_sugar_g real;
  v_salt_g real;
  v_sodium_mg real;
  v_saturated_fat_g real;
  v_cholesterol_mg real;
  v_calcium_mg real;
  v_iron_mg real;
  v_vitamin_a_ug real;
  v_vitamin_b1_mg real;
  v_vitamin_b2_mg real;
  v_vitamin_c_mg real;
  v_vitamin_d_ug real;
  v_vitamin_e_mg real;
  v_potassium_mg real;
  v_magnesium_mg real;
  v_zinc_mg real;
  v_source_type text;
  v_source_photo_url text;
  v_notes text;
  v_food_category text;
  v_score integer;
  v_row public.public_foods%rowtype;
begin
  if v_user_id is null then
    raise exception 'submit_public_food requires an authenticated user'
      using errcode = '28000';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'submit_public_food payload must be a JSON object'
      using errcode = '22023';
  end if;

  v_id := coalesce(nullif(payload->>'id', '')::uuid, gen_random_uuid());
  v_name_ja := nullif(btrim(payload->>'name_ja'), '');
  v_name_en := nullif(btrim(payload->>'name_en'), '');
  v_brand := nullif(btrim(payload->>'brand'), '');
  v_barcode := nullif(btrim(payload->>'barcode'), '');
  v_serving_size_g := coalesce((payload->>'serving_size_g')::real, 100);
  v_serving_unit := coalesce(nullif(btrim(payload->>'serving_unit'), ''), 'g');
  v_serving_description := nullif(btrim(payload->>'serving_description'), '');
  v_calories_per_serving := (payload->>'calories_per_serving')::real;
  v_protein_g := coalesce((payload->>'protein_g')::real, 0);
  v_fat_g := coalesce((payload->>'fat_g')::real, 0);
  v_carb_g := coalesce((payload->>'carb_g')::real, 0);
  v_fiber_g := (payload->>'fiber_g')::real;
  v_sugar_g := (payload->>'sugar_g')::real;
  v_salt_g := (payload->>'salt_g')::real;
  v_sodium_mg := (payload->>'sodium_mg')::real;
  v_saturated_fat_g := (payload->>'saturated_fat_g')::real;
  v_cholesterol_mg := (payload->>'cholesterol_mg')::real;
  v_calcium_mg := (payload->>'calcium_mg')::real;
  v_iron_mg := (payload->>'iron_mg')::real;
  v_vitamin_a_ug := (payload->>'vitamin_a_ug')::real;
  v_vitamin_b1_mg := (payload->>'vitamin_b1_mg')::real;
  v_vitamin_b2_mg := (payload->>'vitamin_b2_mg')::real;
  v_vitamin_c_mg := (payload->>'vitamin_c_mg')::real;
  v_vitamin_d_ug := (payload->>'vitamin_d_ug')::real;
  v_vitamin_e_mg := (payload->>'vitamin_e_mg')::real;
  v_potassium_mg := (payload->>'potassium_mg')::real;
  v_magnesium_mg := (payload->>'magnesium_mg')::real;
  v_zinc_mg := (payload->>'zinc_mg')::real;
  v_source_type := coalesce(nullif(btrim(payload->>'source_type'), ''), 'other');
  v_source_photo_url := nullif(btrim(payload->>'source_photo_url'), '');
  v_notes := nullif(btrim(payload->>'notes'), '');
  v_food_category := coalesce(nullif(btrim(payload->>'food_category'), ''), 'other');

  v_score := public.compute_public_food_approval_score(
    v_user_id,
    v_id,
    v_name_ja,
    v_calories_per_serving,
    v_protein_g,
    v_fat_g,
    v_carb_g
  );

  perform set_config('mealift.trusted_public_food_submit', 'on', true);

  insert into public.public_foods (
    id,
    name_ja, name_en, brand, barcode,
    serving_size_g, serving_unit, serving_description,
    calories_per_serving, protein_g, fat_g, carb_g,
    fiber_g, sugar_g, salt_g, sodium_mg,
    saturated_fat_g, cholesterol_mg,
    calcium_mg, iron_mg, vitamin_a_ug, vitamin_b1_mg, vitamin_b2_mg,
    vitamin_c_mg, vitamin_d_ug, vitamin_e_mg,
    potassium_mg, magnesium_mg, zinc_mg,
    source_type, source_photo_url, notes, food_category,
    submitted_by, approval_score
  ) values (
    v_id,
    v_name_ja, v_name_en, v_brand, v_barcode,
    v_serving_size_g, v_serving_unit, v_serving_description,
    v_calories_per_serving, v_protein_g, v_fat_g, v_carb_g,
    v_fiber_g, v_sugar_g, v_salt_g, v_sodium_mg,
    v_saturated_fat_g, v_cholesterol_mg,
    v_calcium_mg, v_iron_mg, v_vitamin_a_ug, v_vitamin_b1_mg, v_vitamin_b2_mg,
    v_vitamin_c_mg, v_vitamin_d_ug, v_vitamin_e_mg,
    v_potassium_mg, v_magnesium_mg, v_zinc_mg,
    v_source_type, v_source_photo_url, v_notes, v_food_category,
    v_user_id, v_score
  )
  on conflict (id) do update set
    name_ja = excluded.name_ja,
    name_en = excluded.name_en,
    brand = excluded.brand,
    barcode = excluded.barcode,
    serving_size_g = excluded.serving_size_g,
    serving_unit = excluded.serving_unit,
    serving_description = excluded.serving_description,
    calories_per_serving = excluded.calories_per_serving,
    protein_g = excluded.protein_g,
    fat_g = excluded.fat_g,
    carb_g = excluded.carb_g,
    fiber_g = excluded.fiber_g,
    sugar_g = excluded.sugar_g,
    salt_g = excluded.salt_g,
    sodium_mg = excluded.sodium_mg,
    saturated_fat_g = excluded.saturated_fat_g,
    cholesterol_mg = excluded.cholesterol_mg,
    calcium_mg = excluded.calcium_mg,
    iron_mg = excluded.iron_mg,
    vitamin_a_ug = excluded.vitamin_a_ug,
    vitamin_b1_mg = excluded.vitamin_b1_mg,
    vitamin_b2_mg = excluded.vitamin_b2_mg,
    vitamin_c_mg = excluded.vitamin_c_mg,
    vitamin_d_ug = excluded.vitamin_d_ug,
    vitamin_e_mg = excluded.vitamin_e_mg,
    potassium_mg = excluded.potassium_mg,
    magnesium_mg = excluded.magnesium_mg,
    zinc_mg = excluded.zinc_mg,
    source_type = excluded.source_type,
    source_photo_url = excluded.source_photo_url,
    notes = excluded.notes,
    food_category = excluded.food_category,
    status = excluded.status,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    rejection_reason = excluded.rejection_reason,
    approval_score = excluded.approval_score,
    updated_at = now()
  where public.public_foods.submitted_by = v_user_id
    and public.public_foods.status = 'pending_review'
  returning * into v_row;

  if not found then
    raise exception 'public food submission is not updatable'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.submit_public_food(jsonb) from public;
grant execute on function public.submit_public_food(jsonb) to authenticated;

-- Safe public projection. Do not include submitted_by, reviewed_by,
-- source_photo_url, notes, rejection_reason, approval_score, or internal
-- moderation counters.
create or replace view public.approved_public_foods
with (security_barrier = true)
as
select
  id,
  name_ja,
  name_en,
  brand,
  barcode,
  serving_size_g,
  serving_unit,
  calories_per_serving,
  protein_g,
  fat_g,
  carb_g,
  fiber_g,
  status,
  use_count,
  updated_at
from public.public_foods
where status = 'approved';

revoke all on public.approved_public_foods from public;
grant select on public.approved_public_foods to anon, authenticated;

-- Remove the old global raw-table read. Submitters still keep
-- own_submissions_readable for their own rows.
drop policy if exists "approved_foods_readable_by_all" on public.public_foods;
