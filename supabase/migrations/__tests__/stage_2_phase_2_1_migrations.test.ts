// v1.5 Stage 2 Phase 2.1 — Supabase migration shape pins.
//
// Mirrors the v30 SQLite migration test convention (assert on the
// emitted SQL string contents) but applied to the new Supabase
// migration .sql files. The migrations are applied by Syuto via
// `supabase db push` outside jest; this contract pin protects the
// shape that the Stage 2 epic doc §5.1 + §6 prescribe, so a future
// edit that drifts (e.g. drops the chain-cascade RLS or moves the
// ai_lookup_logs DDL out of Phase 2.1) is caught locally.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const RESTAURANTS_SQL = readFileSync(
  resolve(__dirname, '../20260520000000_create_restaurants.sql'),
  'utf8',
);
const MENU_ITEMS_SQL = readFileSync(
  resolve(__dirname, '../20260520000001_create_restaurant_menu_items.sql'),
  'utf8',
);
const AI_LOOKUP_LOGS_SQL = readFileSync(
  resolve(__dirname, '../20260520000002_create_ai_lookup_logs.sql'),
  'utf8',
);

describe('20260520000000_create_restaurants — DDL contract', () => {
  it('creates restaurant_chain_categories FIRST (Codex round 1 Critical #4 — FK reference order)', () => {
    // The categories CREATE must appear before the restaurants
    // CREATE so the `category_id uuid references restaurant_chain_categories(id)`
    // FK resolves at parse time.
    const catIdx = RESTAURANTS_SQL.indexOf(
      'create table if not exists public.restaurant_chain_categories',
    );
    const restIdx = RESTAURANTS_SQL.indexOf(
      'create table if not exists public.restaurants',
    );
    expect(catIdx).toBeGreaterThan(-1);
    expect(restIdx).toBeGreaterThan(-1);
    expect(catIdx).toBeLessThan(restIdx);
  });

  it('restaurants.restaurant_type has the 4-value CHECK (DEC-7 enum)', () => {
    expect(RESTAURANTS_SQL).toMatch(
      /restaurant_type[\s\S]*?check[\s\S]*?'dining'[\s\S]*?'convenience'[\s\S]*?'cafe_bakery'[\s\S]*?'combo_meal'/i,
    );
  });

  it('takedown_flag defaults to false (admin-set; opt-in suppression)', () => {
    expect(RESTAURANTS_SQL).toMatch(
      /takedown_flag\s+boolean\s+not\s+null\s+default\s+false/i,
    );
  });

  it('set_updated_at trigger lands (delta-pull contract — Codex Important #4)', () => {
    expect(RESTAURANTS_SQL).toMatch(/create or replace function public\.set_updated_at_restaurants/);
    expect(RESTAURANTS_SQL).toMatch(/create trigger set_updated_at_restaurants_trg/);
  });

  it('RLS filters takedown_flag = false on public read', () => {
    expect(RESTAURANTS_SQL).toMatch(
      /create policy "Public read non-takedown restaurants"[\s\S]*?using \(takedown_flag = false\)/,
    );
  });

  it('aliases column is text[] with gin index (mirror side-table on SQLite — Codex Important #3)', () => {
    expect(RESTAURANTS_SQL).toMatch(/aliases text\[\] not null default '\{\}'/);
    expect(RESTAURANTS_SQL).toMatch(/restaurants_aliases_idx[\s\S]*using gin \(aliases\)/);
  });
});

describe('20260520000001_create_restaurant_menu_items — DDL contract', () => {
  it('FK to restaurants(id) with cascade delete', () => {
    expect(MENU_ITEMS_SQL).toMatch(
      /restaurant_id uuid not null\s+references public\.restaurants\(id\)\s+on delete cascade/,
    );
  });

  it('public-read RLS policy joins the parent chain takedown flag (Codex Critical #3 fix)', () => {
    // The policy must include the EXISTS subquery against
    // restaurants.takedown_flag. Without this, chain-level takedown
    // does NOT cascade to menu items.
    expect(MENU_ITEMS_SQL).toMatch(
      /create policy "Public read non-takedown menu items"[\s\S]*?using \([\s\S]*?takedown_flag = false[\s\S]*?exists\s*\(\s*select 1 from public\.restaurants r[\s\S]*?r\.id = restaurant_menu_items\.restaurant_id[\s\S]*?r\.takedown_flag = false/,
    );
  });

  it('set_updated_at trigger lands here too (per-table; delta-pull contract)', () => {
    expect(MENU_ITEMS_SQL).toMatch(
      /create or replace function public\.set_updated_at_restaurant_menu_items/,
    );
    expect(MENU_ITEMS_SQL).toMatch(
      /create trigger set_updated_at_restaurant_menu_items_trg/,
    );
  });

  it('barcode partial index (where barcode is not null) — コンビニ PB lookup', () => {
    expect(MENU_ITEMS_SQL).toMatch(
      /create index if not exists restaurant_menu_items_barcode_idx[\s\S]*?where barcode is not null/,
    );
  });

  it('menu_item_versions audit table lands in the same migration', () => {
    expect(MENU_ITEMS_SQL).toMatch(
      /create table if not exists public\.restaurant_menu_item_versions/,
    );
    expect(MENU_ITEMS_SQL).toMatch(/changed_by text not null/);
  });

  it('menu_item_versions history-capture trigger fires AFTER UPDATE when version advances (Codex Phase 2.2a round 1 Important fix)', () => {
    // The Phase 2.2 seed migration uses ON CONFLICT DO UPDATE +
    // `version = restaurant_menu_items.version + 1`. Without this
    // trigger, every re-apply mutates the live row + bumps version
    // without snapshotting the prior payload into the versions
    // audit table, defeating the audit-trail intent in epic §5.1.
    expect(MENU_ITEMS_SQL).toMatch(
      /create or replace function public\.capture_restaurant_menu_item_version/,
    );
    expect(MENU_ITEMS_SQL).toMatch(
      /if new\.version is distinct from old\.version then/,
    );
    expect(MENU_ITEMS_SQL).toMatch(
      /create trigger capture_restaurant_menu_item_version_trg[\s\S]*after update on public\.restaurant_menu_items/,
    );
  });

  it('menu_item_versions RLS gates on parent chain + menu takedown (Codex Phase 2.1 round 1 Important fix)', () => {
    // Earlier draft used `using (true)` which leaked historical
    // snapshots of taken-down chains. The policy must EXIST the
    // parent menu_item AND its parent chain, both with
    // takedown_flag = false.
    expect(MENU_ITEMS_SQL).toMatch(
      /create policy "Public read non-takedown versions"[\s\S]*?using \([\s\S]*?exists[\s\S]*?restaurant_menu_items mi[\s\S]*?join public\.restaurants r[\s\S]*?mi\.takedown_flag = false[\s\S]*?r\.takedown_flag = false/,
    );
  });

  it('CHECK band on calories (< 3000), protein (< 200), fat (< 300), carb (< 500)', () => {
    expect(MENU_ITEMS_SQL).toMatch(/calories_per_serving[\s\S]*check \([\s\S]*?< 3000/);
    expect(MENU_ITEMS_SQL).toMatch(/protein_g[\s\S]*check \([\s\S]*?< 200/);
    expect(MENU_ITEMS_SQL).toMatch(/fat_g[\s\S]*check \([\s\S]*?< 300/);
    expect(MENU_ITEMS_SQL).toMatch(/carb_g[\s\S]*check \([\s\S]*?< 500/);
  });
});

describe('20260520000002_create_ai_lookup_logs — DDL contract', () => {
  it('lands in Phase 2.1 (NOT Phase 2.5 — Codex Critical #1 fix)', () => {
    // The migration filename + phase header SHOULD reflect Phase
    // 2.1 — the table is the quota+replay store for
    // restaurant-menu-lookup from day one.
    expect(AI_LOOKUP_LOGS_SQL).toMatch(/Phase 2\.1/);
  });

  it('declares the documented column set in §5.1 (id + user_id + function_name + input + response_payload + response_status + idempotency_key + created_at — Codex round 2 OPEN #1 fix)', () => {
    expect(AI_LOOKUP_LOGS_SQL).toMatch(/id uuid primary key/);
    expect(AI_LOOKUP_LOGS_SQL).toMatch(/user_id uuid not null/);
    expect(AI_LOOKUP_LOGS_SQL).toMatch(/function_name text not null/);
    expect(AI_LOOKUP_LOGS_SQL).toMatch(/input jsonb not null/);
    expect(AI_LOOKUP_LOGS_SQL).toMatch(/response_payload jsonb/);
    expect(AI_LOOKUP_LOGS_SQL).toMatch(/response_status int not null/);
    expect(AI_LOOKUP_LOGS_SQL).toMatch(/idempotency_key text/);
    expect(AI_LOOKUP_LOGS_SQL).toMatch(/created_at timestamptz/);
  });

  it('partial unique on (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL (Drafting 109)', () => {
    expect(AI_LOOKUP_LOGS_SQL).toMatch(
      /create unique index[\s\S]*ai_lookup_logs_idempotency_key_unique[\s\S]*on public\.ai_lookup_logs \(user_id, idempotency_key\)[\s\S]*where idempotency_key is not null/,
    );
  });

  it('RLS restricts SELECT to auth.uid() = user_id (own-user-only)', () => {
    expect(AI_LOOKUP_LOGS_SQL).toMatch(
      /create policy "Users read own lookup logs"[\s\S]*for select[\s\S]*using \(auth\.uid\(\) = user_id\)/,
    );
  });

  it('user_id FK cascades on auth.users delete', () => {
    expect(AI_LOOKUP_LOGS_SQL).toMatch(
      /user_id uuid not null references auth\.users\(id\) on delete cascade/,
    );
  });

  it('user-month read index covers (user_id, function_name, created_at desc) — quota gate path', () => {
    expect(AI_LOOKUP_LOGS_SQL).toMatch(
      /ai_lookup_logs_user_month_idx[\s\S]*on public\.ai_lookup_logs \(user_id, function_name, created_at desc\)/,
    );
  });
});
