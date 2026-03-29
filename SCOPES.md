# Xero OAuth Scope Bundle

This repo ships with a default read-only scope bundle in `wrangler.jsonc` under `vars.XERO_OAUTH_SCOPES`.

## Default scope bundle

- `openid`
- `profile`
- `email`
- `offline_access`
- `accounting.invoices`
- `accounting.contacts`
- `accounting.settings`
- `accounting.banktransactions`
- `accounting.payments.read`
- `accounting.budgets.read`
- `accounting.manualjournals`
- `accounting.reports.balancesheet.read`
- `accounting.reports.profitandloss.read`
- `accounting.reports.trialbalance.read`
- `accounting.reports.executivesummary.read`
- `accounting.reports.aged.read`
- `accounting.reports.budgetsummary.read`

## Tool to scope mapping

- `list_invoices`, `get_invoice`, `list_credit_notes`, `get_credit_note`, `list_quotes` -> `accounting.invoices`
- `list_contacts` -> `accounting.contacts`
- `list_accounts`, `list_organisations`, `list_tracking_categories`, `list_tax_rates`, `list_items` -> `accounting.settings`
- `list_bank_transactions`, `get_bank_transaction` -> `accounting.banktransactions`
- `list_payments` -> `accounting.payments.read`
- `list_budgets` -> `accounting.budgets.read`
- `list_manual_journals` -> `accounting.manualjournals`
- `get_balance_sheet` -> `accounting.reports.balancesheet.read`
- `get_profit_and_loss` -> `accounting.reports.profitandloss.read`
- `get_trial_balance` -> `accounting.reports.trialbalance.read`
- `get_executive_summary` -> `accounting.reports.executivesummary.read`
- `get_aged_receivables`, `get_aged_payables` -> `accounting.reports.aged.read`
- `get_budget_summary` -> `accounting.reports.budgetsummary.read`
- `list_repeating_invoices` -> `accounting.invoices`
- `list_purchase_orders`, `get_purchase_order` -> Xero procurement/invoice scope family; validate in your tenant

## Known platform constraints

- `list_journals` may still return 401 in some Xero app/account setups even with OAuth scopes present.
- `list_receipts` and `list_expense_claims` may require additional product entitlements.

## Customizing scopes

Use a reduced or expanded scope string by setting `XERO_OAUTH_SCOPES` in `wrangler.jsonc` (or environment-specific config) and redeploying.

When scopes change, reconnect and run `add_xero_organisation` to refresh consent, then verify with `auth_status` and `list_tenants`.
