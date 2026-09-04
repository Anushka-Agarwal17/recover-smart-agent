# Revenue Guardian AI

Build a complete production-quality full-stack web application called RecoverAI — AI Revenue Recovery Agent.

1. PRODUCT PURPOSE

Build an AI-native revenue recovery platform for online merchants.

The platform helps merchants identify revenue at risk from failed payments, checkout abandonment, and subscription payment failures. It diagnoses the likely cause, estimates recovery probability, selects an appropriate bounded recovery intervention, executes a simulated recovery workflow, applies stopping rules, and measures the resulting recovery outcomes.

This should be a standalone fintech SaaS product, not a hackathon template.

Do NOT mention any hackathon, competition, Razorpay, judging criteria, student project, or external event anywhere in the product UI, landing page, metadata, or application copy.

The product should feel like a real commercial fintech product that could independently exist in the market.

IMPORTANT:

This is initially a DEMO/SIMULATION environment using synthetic payment data.

Do NOT claim that real money was recovered.

Clearly label simulated actions and simulated recovered revenue as simulated/demo data.

==================================================
2. CORE PRODUCT WORKFLOW

The product must demonstrate this complete workflow:

DETECT → DIAGNOSE → DECIDE → ACT → VERIFY → STOP/ESCALATE → MEASURE

The system should feel like a real fintech operations platform, not a generic AI dashboard.

The AI agent must NOT be a simple chatbot.

The AI agent must make structured recovery decisions using:

transaction context

customer payment history

failure reason

amount

previous recovery attempts

recovery probability

merchant-configured rules

predefined safety guardrails

The AI must only be able to select from predefined recovery actions.

==================================================
3. PRODUCT POSITIONING

Core product statement:

"RecoverAI doesn't just tell merchants that revenue is being lost. It identifies the problem, explains why it happened, chooses a safe recovery action, executes the action, knows when to stop, and measures the outcome."

Primary value propositions:

Detect revenue at risk

Diagnose why recovery may be possible

Choose the next best action

Execute bounded recovery workflows

Stop automatically when rules require it

Measure recovery performance

==================================================
4. TECH STACK

Use:

React

TypeScript

Vite

Tailwind CSS

shadcn/ui where appropriate

Recharts for data visualization

Supabase PostgreSQL for persistent data

Supabase Authentication

Supabase Edge Functions for backend/server-side business logic

Server-side AI integration through an Edge Function

Strict TypeScript

Zod or equivalent server-side validation

Clean modular architecture

Do NOT put API keys or secrets in frontend code.

All AI/API calls must happen server-side through Edge Functions.

All critical validation, authorization, recovery decisions and state transitions must be enforced server-side.

==================================================
5. VISUAL DESIGN

Create a premium modern fintech SaaS interface.

Design direction:

sophisticated dark dashboard

near-black background

white/off-white typography

subtle emerald/green accent for positive financial metrics

subtle red/orange for risk and failed payments

blue accent for AI/system information

glass-like cards only when visually useful

subtle borders

generous spacing

modern rounded cards

professional typography

no excessive gradients

no childish illustrations

no generic AI robot graphics

no unnecessary animations

The visual quality should resemble a premium fintech operations console.

Brand:

Product name:
RecoverAI

Tagline:
"Recover revenue before it disappears."

Use a clean professional wordmark/logo treatment for RecoverAI.

Do not use Razorpay branding or logos.

The application must be responsive on:

desktop

tablet

mobile

Use smooth but restrained animations for:

KPI changes

table loading

agent decision states

notifications

charts

Accessibility:

readable contrast

keyboard navigation

visible focus states

semantic buttons

accessible tables

tooltips where needed

==================================================
6. APPLICATION STRUCTURE

Create these main sections:

Overview

Revenue at Risk

Recovery Queue

AI Agent

Transactions

Customers

Recovery Analytics

Audit Trail

Settings

Use a professional left sidebar navigation.

Top bar should contain:

merchant name

environment badge: "DEMO / SYNTHETIC DATA"

notification icon

user profile

date/time indicator

==================================================
7. LANDING / LOGIN

Create a polished landing/login experience.

Landing page headline:

"Recover revenue before it disappears."

Subheadline:

"An AI recovery agent that detects payment risk, chooses the right intervention, and measures what gets recovered."

Show three value cards:

Detect revenue leakage

Decide the next best action

Recover and measure

Add a clear "Launch Demo" / "Sign in" CTA.

Do not require complicated onboarding.

==================================================
8. DASHBOARD / OVERVIEW

Create a high-quality executive dashboard.

Top KPI cards:

Total Revenue at Risk

Recoverable Revenue

Revenue Recovered

Recovery Rate

Failed Payments

Active Recovery Cases

Each KPI should have:

value

comparison to previous period where data exists

small contextual explanation

IMPORTANT:

All values must come from the database and actual calculations.

Do NOT hardcode fake KPI values into the UI.

Main dashboard sections:

A. Revenue Recovery Funnel

Show:

At Risk
→ Eligible for Recovery
→ Intervention Sent
→ Retry Attempted
→ Recovered

B. Revenue at Risk trend

Line chart over time.

C. Failure reason distribution

Bar/donut chart.

Possible reasons:

insufficient_funds

bank_declined

network_error

authentication_failed

expired_card

checkout_abandoned

subscription_failed

unknown

D. Recovery performance by intervention

Show:

Smart Retry

Payment Reminder

Alternate Payment Suggestion

Checkout Re-engagement

Escalation

Show:

attempts

successes

recovered amount

recovery rate

E. Recent AI decisions

Show the latest agent decisions with:

transaction ID

customer

amount

risk

recommended action

confidence

status

==================================================
9. REVENUE AT RISK PAGE

Create a powerful table of revenue-risk cases.

Columns:

Transaction ID

Customer

Amount

Failure/Drop-off reason

Time since failure

Previous successful payments

Recovery probability

Revenue at risk

Recommended action

Status

Filters:

high risk

medium risk

low risk

payment failed

checkout abandoned

subscription failed

amount range

date range

status

Search by:

transaction ID

customer

email

Clicking a row opens a detailed case view.

==================================================
10. CASE DETAIL PAGE

For each revenue-risk case show:

Customer profile:

customer name

masked email

customer lifetime value

previous payment count

previous successful payments

previous failed payments

Transaction:

transaction ID

amount

timestamp

payment method

failure reason

retry count

AI diagnosis:

Show a concise explanation based only on available data.

Example:

"High recovery potential because this customer has 8 previous successful payments and only 1 recent failure."

Show:

Recovery probability:
78%

Risk level:
Medium

Recommended action:
Smart Retry

Reason:
"Historical behavior suggests this is likely to be a temporary payment failure."

Do not display invented customer information.

==================================================
11. AI REVENUE RECOVERY AGENT

This is the central product capability.

Do NOT build this as a generic chatbot.

Build an actual structured AI agent workflow.

Agent input:

transaction

customer history

payment history

failure reason

amount

previous recovery attempts

time since failure

merchant recovery rules

Agent output must be structured JSON:

{
"diagnosis": "...",
"recovery_probability": 0-100,
"risk_level": "low|medium|high",
"recommended_action": "...",
"reason": "...",
"next_attempt_at": "...",
"stop_reason": "...",
"confidence": 0-100
}

The backend must validate this output before saving it.

Never allow arbitrary AI-generated actions.

==================================================
12. BOUNDED RECOVERY ACTIONS

The agent may ONLY choose from these predefined actions:

SMART_RETRY

PAYMENT_REMINDER

ALTERNATE_PAYMENT_METHOD

CHECKOUT_REENGAGEMENT

ESCALATE

NO_ACTION

The AI cannot invent new action types.

Each action has predefined rules.

SMART_RETRY:

maximum 2 retry attempts

minimum delay between attempts

never retry indefinitely

PAYMENT_REMINDER:

maximum 2 reminders

minimum time between reminders

CHECKOUT_REENGAGEMENT:

maximum 2 attempts

ESCALATE:

used when automatic recovery is not appropriate

NO_ACTION:

used when recovery probability is too low or stopping conditions are reached

==================================================
13. STOPPING RULES

Implement explicit recovery guardrails.

Stop recovery when:

payment succeeds

maximum retry count is reached

maximum intervention count is reached

recovery probability falls below threshold

transaction is outside recovery window

customer has opted out

case is escalated

amount/risk rules prohibit further automated attempts

Show the exact stopping reason in the audit trail.

==================================================
14. SIMULATED RECOVERY ENGINE

Create a backend simulation engine.

When an intervention is executed:

create a recovery_attempt record

record timestamp

record action

record reason

record AI decision ID

calculate simulated outcome

Possible outcomes:

SUCCESS
FAILED
NO_RESPONSE
ESCALATED

The simulation must use deterministic or seeded logic so the same dataset produces reproducible results.

Do NOT randomly change dashboard numbers every page refresh.

If a recovery succeeds:

mark the case recovered

record recovered amount

update analytics

stop further interventions

create an audit event

If it fails:

evaluate stopping rules

schedule another allowed action if eligible

otherwise stop/escalate

==================================================
15. MEASURED MONEY RECOVERY

Create metrics based on the complete synthetic transaction batch.

Metrics:

Total revenue at risk

Recoverable revenue

Attempted recovery amount

Recovered revenue

Recovery rate

Average recovery time

Recovery attempts

Successful recoveries

Failed recoveries

Escalations

Recovery rate formula:

recovered revenue / eligible revenue * 100

Do not fabricate metrics.

Calculate everything from transaction and recovery records.

==================================================
16. SYNTHETIC DATASET

Generate a realistic synthetic dataset of at least 500 transactions.

Prefer 1000 records if performance remains good.

Include:

transaction_id

customer_id

amount

currency

timestamp

payment_method

status

failure_reason

retry_count

checkout_status

subscription_status

customer_lifetime_value

previous_success_count

previous_failure_count

recovery_probability

recovery_status

Create at least 100 customers with different behavior patterns.

Include realistic distributions.

Make the dataset reproducible using a fixed seed.

Provide a "Reset Demo Data" option that safely recreates the synthetic dataset.

==================================================
17. TRANSACTIONS PAGE

Create a powerful transaction explorer.

Features:

searchable table

sorting

filtering

pagination

status badges

amount formatting

date formatting

transaction detail drawer/page

Status examples:

SUCCESS
FAILED
PENDING
ABANDONED
RECOVERED

Never expose unnecessary sensitive information.

Use masked customer information.

==================================================
18. CUSTOMERS PAGE

Show:

customer ID

customer name

masked email

lifetime value

total transactions

successful transactions

failed transactions

recovery history

current risk level

Click customer to view their payment timeline.

==================================================
19. RECOVERY QUEUE

Create a prioritized AI recovery queue.

Sort cases using:

revenue at risk

recovery probability

urgency

customer history

number of previous attempts

Each case should display:

Priority score

Recovery probability

Amount at risk

Recommended action

Add:

"Run AI Recovery Analysis"

button.

When clicked:

call secure Edge Function

analyze eligible cases

generate structured decisions

save decisions

update queue

Add loading state and error state.

==================================================
20. AUDIT TRAIL

Create a complete audit log.

Every important action must create an audit event.

Examples:

CASE_CREATED

AI_ANALYSIS_COMPLETED

RECOVERY_ACTION_SELECTED

RECOVERY_ATTEMPT_STARTED

RECOVERY_SUCCEEDED

RECOVERY_FAILED

STOPPING_RULE_TRIGGERED

ESCALATED

DATA_RESET

Columns:

timestamp

event type

transaction ID

customer ID

actor

action

reason

result

The audit trail must be append-only from the UI.

==================================================
21. AI EXPLAINABILITY

Every AI decision must be explainable.

Show:

"Why did the agent choose this?"

Example:

"Smart Retry was selected because the customer has 9 previous successful payments, the current failure reason is temporary bank decline, recovery probability is 81%, and only one retry has been attempted."

The explanation must be generated from actual available data.

Do not claim access to information that does not exist.

==================================================
22. DATABASE DESIGN

Create proper normalized Supabase tables.

Suggested tables:

profiles
customers
transactions
recovery_cases
ai_decisions
recovery_attempts
audit_events
merchant_settings

Use UUID primary keys where appropriate.

Add:

created_at

updated_at

Use foreign keys.

Add indexes for:

transaction status

timestamps

customer_id

recovery status

recovery probability

Enable Row Level Security.

Users should only access records belonging to their merchant/account.

Do not create overly permissive public policies.

==================================================
23. AUTHENTICATION

Implement secure authentication.

Use Supabase Auth.

Support:

email/password login

logout

protected application routes

Unauthenticated users must not access merchant data.

Authorization must be enforced server-side.

==================================================
24. BACKEND ARCHITECTURE

Create Edge Functions for:

analyze-recovery-case

run-recovery-batch

execute-recovery-action

generate-demo-data

reset-demo-data

get-recovery-analytics

All important business rules must live server-side.

Frontend should never directly modify:

recovery status

recovered revenue

AI decisions

audit events

retry counters

Those changes must go through backend functions.

==================================================
25. AI INTEGRATION

Use an AI model through a secure server-side Edge Function.

The AI should receive only the structured information necessary for the decision.

Force structured JSON output.

Validate the response.

If AI fails:

do not crash the application

show a graceful error

preserve existing case state

allow retry

If AI produces invalid output:

reject it

log the failure

do not execute an action

Use bounded actions only.

==================================================
26. FALLBACK LOGIC

The system must remain functional even if the AI API is unavailable.

Implement deterministic fallback decision logic.

Example:

if recovery_probability >= 75 and retry_count < 2:
SMART_RETRY

elif recovery_probability >= 55 and reminder_count < 2:
PAYMENT_REMINDER

elif recovery_probability >= 40:
ALTERNATE_PAYMENT_METHOD

else:
ESCALATE

This fallback must be clearly labeled internally as rule-based fallback.

==================================================
27. ERROR HANDLING

Implement robust error handling.

Handle:

database unavailable

AI API unavailable

invalid AI response

timeout

empty dataset

malformed transaction

unauthorized request

duplicate recovery attempt

already recovered transaction

maximum retry reached

Never show raw stack traces to users.

Show human-readable error messages.

Log technical errors server-side.

==================================================
28. LOADING / EMPTY / ERROR STATES

Every data-dependent page must have:

loading skeleton

empty state

error state

retry button

Never show a blank page while data is loading.

==================================================
29. PERFORMANCE

Avoid unnecessary database requests.

Use:

pagination

indexed queries

server-side filtering where appropriate

batched analytics queries

memoized expensive frontend calculations

Do not load all 1000+ transactions into the browser unnecessarily.

==================================================
30. DEMO MODE

Add a visible:

"DEMO MODE — Synthetic Data"

badge.

Add a Demo Controls panel with:

Reset Demo

Run Recovery Batch

Generate AI Decisions

Simulate Recovery

Refresh Analytics

All demo actions must be safe and reproducible.

==================================================
31. GUIDED DEMO FLOW

Create a guided demo scenario.

The demo should allow the presenter to:

Open dashboard

Show revenue at risk

Open a high-value failed transaction

Show customer history

Run AI analysis

Show diagnosis

Show recovery probability

Show recommended action

Execute simulated recovery

Show successful recovery

Open audit trail

Show updated recovered revenue

Make this flow fast enough for a short product demonstration.

==================================================
32. ANALYTICS PAGE

Create charts for:

revenue at risk over time

recovered revenue over time

recovery rate

failure reasons

recovery action performance

recovery outcome distribution

recovery by payment method

All charts must be based on database data.

==================================================
33. SETTINGS

Allow merchant to configure safe recovery policies:

maximum retries

recovery window

minimum recovery probability

maximum automated intervention count

escalation threshold

Validate all settings.

Do not allow unsafe values.

Show a warning when changing important controls.

==================================================
34. SECURITY

Follow secure application architecture.

NEVER:

expose API keys in frontend

hardcode secrets

trust frontend validation

allow arbitrary AI actions

expose customer private information

allow users to modify audit logs

allow duplicate recovery execution

bypass server-side authorization

Use server-side validation.

Use RLS.

Use secure Edge Functions.

==================================================
35. CODE QUALITY

Use clean reusable components.

Suggested structure:

src/
components/
pages/
hooks/
lib/
services/
types/
utils/

Keep components reasonably small.

Avoid duplicated code.

Use clear names.

Use TypeScript types for:

transactions

customers

recovery cases

AI decisions

recovery actions

audit events

Add comments only where business logic needs explanation.

==================================================
36. FINAL QUALITY BAR

Before considering the project complete:

no TypeScript errors

no broken routes

no console errors

no missing loading states

no missing error states

no fake hardcoded analytics

no exposed secrets

all database tables have correct RLS

all backend functions validate inputs

AI failures are handled gracefully

recovery actions obey stopping rules

audit events are generated correctly

metrics are calculated from real database records

synthetic data is reproducible

mobile UI works

desktop UI looks polished

charts render correctly

search/filter/pagination work

demo reset works

Run tests and verify the main user journey end-to-end.

Do not declare the application complete until the major workflows have been tested.

==================================================
37. FINAL PRODUCT PRINCIPLE

The application should communicate one simple idea:

"RecoverAI doesn't just tell a merchant that revenue is being lost. It finds the problem, explains why it happened, chooses a safe recovery action, executes the action, knows when to stop, and measures what was recovered."

Build the application end-to-end with this principle.

Do not mention any external competition, hackathon, company, or track anywhere in the application.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://recover-smart-agent.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4c85a9c2-aef2-4075-8b76-9bc98fe0a599).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
