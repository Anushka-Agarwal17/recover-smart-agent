-- =============================================================
-- RecoverAI — full schema migration for your own Supabase project
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================

-- ── 1. profiles ───────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  merchant_name text not null default 'Demo Merchant',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "owner" on public.profiles
  using (auth.uid() = id) with check (auth.uid() = id);

-- ── 2. merchant_settings ──────────────────────────────────────
create table if not exists public.merchant_settings (
  user_id                     uuid primary key references auth.users(id) on delete cascade,
  max_retries                 integer not null default 2,
  recovery_window_hours       integer not null default 72,
  min_recovery_probability    integer not null default 30,
  max_interventions           integer not null default 4,
  escalation_threshold_amount numeric(12,2) not null default 500,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
alter table public.merchant_settings enable row level security;
create policy "owner" on public.merchant_settings
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 3. customers ──────────────────────────────────────────────
create table if not exists public.customers (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  external_id             text not null,
  name                    text not null,
  email                   text not null,
  lifetime_value          numeric(12,2) not null default 0,
  previous_success_count  integer not null default 0,
  previous_failure_count  integer not null default 0,
  risk_level              text not null default 'low',
  opted_out               boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id, external_id)
);
alter table public.customers enable row level security;
create policy "owner" on public.customers
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 4. transactions ───────────────────────────────────────────
create table if not exists public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  transaction_ref     text not null,
  customer_id         uuid not null references public.customers(id) on delete cascade,
  amount              numeric(12,2) not null,
  currency            text not null default 'USD',
  occurred_at         timestamptz not null,
  payment_method      text not null,
  status              text not null,
  failure_reason      text,
  retry_count         integer not null default 0,
  checkout_status     text,
  subscription_status text,
  recovery_probability numeric(5,2) not null default 0,
  recovery_status     text not null default 'none',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, transaction_ref)
);
alter table public.transactions enable row level security;
create policy "owner" on public.transactions
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 5. recovery_cases ─────────────────────────────────────────
create table if not exists public.recovery_cases (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  transaction_id        uuid not null unique references public.transactions(id) on delete cascade,
  customer_id           uuid not null references public.customers(id) on delete cascade,
  amount_at_risk        numeric(12,2) not null,
  risk_level            text not null default 'medium',
  recovery_probability  numeric(5,2) not null default 0,
  priority_score        numeric(10,4) not null default 0,
  status                text not null default 'open',
  retry_count           integer not null default 0,
  reminder_count        integer not null default 0,
  reengagement_count    integer not null default 0,
  alt_method_count      integer not null default 0,
  recommended_action    text,
  stop_reason           text,
  recovered_amount      numeric(12,2) not null default 0,
  recovered_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table public.recovery_cases enable row level security;
create policy "owner" on public.recovery_cases
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 6. ai_decisions ───────────────────────────────────────────
create table if not exists public.ai_decisions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  case_id               uuid not null references public.recovery_cases(id) on delete cascade,
  diagnosis             text not null,
  recovery_probability  numeric(5,2) not null,
  risk_level            text not null,
  recommended_action    text not null,
  reason                text not null,
  confidence            numeric(5,2) not null default 0,
  next_attempt_at       timestamptz,
  stop_reason           text,
  source                text not null default 'rule_based_fallback',
  created_at            timestamptz not null default now()
);
alter table public.ai_decisions enable row level security;
create policy "owner" on public.ai_decisions
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 7. recovery_attempts ──────────────────────────────────────
create table if not exists public.recovery_attempts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  case_id          uuid not null references public.recovery_cases(id) on delete cascade,
  decision_id      uuid references public.ai_decisions(id) on delete set null,
  action           text not null,
  outcome          text not null,
  amount           numeric(12,2) not null default 0,
  recovered_amount numeric(12,2) not null default 0,
  reason           text,
  created_at       timestamptz not null default now()
);
alter table public.recovery_attempts enable row level security;
create policy "owner" on public.recovery_attempts
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 8. audit_events ───────────────────────────────────────────
create table if not exists public.audit_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  event_type      text not null,
  transaction_ref text,
  customer_id     uuid,
  case_id         uuid,
  actor           text not null default 'system',
  action          text,
  reason          text,
  result          text,
  created_at      timestamptz not null default now()
);
alter table public.audit_events enable row level security;
create policy "owner" on public.audit_events
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── useful indexes ────────────────────────────────────────────
create index if not exists idx_transactions_user    on public.transactions(user_id);
create index if not exists idx_transactions_cust    on public.transactions(customer_id);
create index if not exists idx_recovery_cases_user  on public.recovery_cases(user_id);
create index if not exists idx_recovery_cases_tx    on public.recovery_cases(transaction_id);
create index if not exists idx_ai_decisions_case    on public.ai_decisions(case_id);
create index if not exists idx_audit_user           on public.audit_events(user_id);
create index if not exists idx_customers_user       on public.customers(user_id);
