
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  merchant_name TEXT NOT NULL DEFAULT 'Demo Merchant',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  lifetime_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  previous_success_count INT NOT NULL DEFAULT 0,
  previous_failure_count INT NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'low',
  opted_out BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own customers" ON public.customers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX customers_user_idx ON public.customers(user_id);

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  transaction_ref TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  occurred_at TIMESTAMPTZ NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL,
  failure_reason TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  checkout_status TEXT,
  subscription_status TEXT,
  recovery_probability INT NOT NULL DEFAULT 0,
  recovery_status TEXT NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, transaction_ref)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transactions" ON public.transactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX tx_user_status_idx ON public.transactions(user_id, status);
CREATE INDEX tx_user_time_idx ON public.transactions(user_id, occurred_at DESC);
CREATE INDEX tx_customer_idx ON public.transactions(customer_id);
CREATE INDEX tx_recovery_idx ON public.transactions(user_id, recovery_status);

CREATE TABLE public.recovery_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.transactions ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers ON DELETE CASCADE,
  amount_at_risk NUMERIC(12,2) NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'medium',
  recovery_probability INT NOT NULL DEFAULT 0,
  priority_score NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  retry_count INT NOT NULL DEFAULT 0,
  reminder_count INT NOT NULL DEFAULT 0,
  reengagement_count INT NOT NULL DEFAULT 0,
  alt_method_count INT NOT NULL DEFAULT 0,
  recommended_action TEXT,
  stop_reason TEXT,
  recovered_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  recovered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (transaction_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_cases TO authenticated;
GRANT ALL ON public.recovery_cases TO service_role;
ALTER TABLE public.recovery_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cases" ON public.recovery_cases FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX cases_user_status_idx ON public.recovery_cases(user_id, status);
CREATE INDEX cases_prob_idx ON public.recovery_cases(user_id, recovery_probability DESC);
CREATE INDEX cases_priority_idx ON public.recovery_cases(user_id, priority_score DESC);
CREATE TRIGGER cases_updated BEFORE UPDATE ON public.recovery_cases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.recovery_cases ON DELETE CASCADE,
  diagnosis TEXT NOT NULL,
  recovery_probability INT NOT NULL,
  risk_level TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  reason TEXT NOT NULL,
  next_attempt_at TIMESTAMPTZ,
  stop_reason TEXT,
  confidence INT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ai',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_decisions TO authenticated;
GRANT ALL ON public.ai_decisions TO service_role;
ALTER TABLE public.ai_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own decisions" ON public.ai_decisions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX decisions_case_idx ON public.ai_decisions(case_id);
CREATE INDEX decisions_user_time_idx ON public.ai_decisions(user_id, created_at DESC);

CREATE TABLE public.recovery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.recovery_cases ON DELETE CASCADE,
  decision_id UUID REFERENCES public.ai_decisions ON DELETE SET NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  recovered_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_attempts TO authenticated;
GRANT ALL ON public.recovery_attempts TO service_role;
ALTER TABLE public.recovery_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attempts" ON public.recovery_attempts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX attempts_case_idx ON public.recovery_attempts(case_id);
CREATE INDEX attempts_user_time_idx ON public.recovery_attempts(user_id, created_at DESC);

CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  transaction_ref TEXT,
  customer_id UUID,
  case_id UUID,
  actor TEXT NOT NULL DEFAULT 'system',
  action TEXT,
  reason TEXT,
  result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own audit" ON public.audit_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "append own audit" ON public.audit_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX audit_user_time_idx ON public.audit_events(user_id, created_at DESC);

CREATE TABLE public.merchant_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  max_retries INT NOT NULL DEFAULT 2,
  recovery_window_hours INT NOT NULL DEFAULT 168,
  min_recovery_probability INT NOT NULL DEFAULT 35,
  max_interventions INT NOT NULL DEFAULT 4,
  escalation_threshold_amount NUMERIC(12,2) NOT NULL DEFAULT 2000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_settings TO authenticated;
GRANT ALL ON public.merchant_settings TO service_role;
ALTER TABLE public.merchant_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.merchant_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER settings_updated BEFORE UPDATE ON public.merchant_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
