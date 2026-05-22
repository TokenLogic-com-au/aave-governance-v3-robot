# GSM Fee Claimer — CRE Automation Workflow

This workflow uses the Chainlink Runtime Environment (CRE) to distribute accrued fees from GHO Stability Module (GSM) contracts to the treasury. On each cron tick it reads `getAccruedFees` on every configured GSM and, for each one with accrued fees, submits a signed CRE report to the already-deployed `MailboxCRE` contract which forwards `distributeFeesToTreasury()` on-chain.

## Architecture

```
CRE Workflow (cron)
  └─ for each GSM:
       └─ getAccruedFees(gsm)          # off-chain read
            └─ [fees > 0]
                 └─ runtime.report()   # sign & encode (gsm, distributeFeesToTreasury) payload
                      └─ writeReport → MailboxCRE.onReport()
                                             └─ gsm.distributeFeesToTreasury()
```

`distributeFeesToTreasury()` is a permissionless public function — no custom receiver contract is needed. The workflow sends one report per GSM with fees, directly to the `MailboxCRE` that is already deployed on each chain.

## Config files

Two configs are committed, one per environment:

| File                     | Target                | Purpose                            |
| ------------------------ | --------------------- | ---------------------------------- |
| `config.production.json` | `production-settings` | Full set of GSMs across all chains |
| `config.staging.json`    | `staging-settings`    | For testing                        |

### Config schema

```jsonc
{
  "schedule": "0 0 * * * *", // cron expression for how often to run
  "evms": [
    {
      "chainName": "ethereum-mainnet", // CRE chain selector name
      "mailboxAddress": "0x...", // deployed MailboxCRE address on this chain
      "gsms": [
        { "address": "0x..." } // GSM contract address
      ]
    }
  ]
}
```

## Setup

If `bun` is not already installed, see https://bun.sh/docs/installation.

```bash
cd cre/gsm-fee-claimer && bun install
```

Export the RPC URLs before running `cre workflow ...` (the CLI does not load `.env` automatically):

```bash
set -a; source .env; set +a
```

## Simulate

Run from the **project root** (the parent of `gsm-fee-claimer/`):

```bash
# staging
cre workflow simulate ./gsm-fee-claimer --target=staging-settings

# production
cre workflow simulate ./gsm-fee-claimer --target=production-settings
```

Simulation performs the full off-chain logic including `getAccruedFees` reads and gas estimation, but does not submit any transactions.

## Deploy

```bash
# staging
cre workflow deploy ./gsm-fee-claimer --target=staging-settings

# production
cre workflow deploy ./gsm-fee-claimer --target=production-settings
```

The workflow name is set in `workflow.yaml` (`gsm-fee-claimer-staging` / `gsm-fee-claimer-production`). Deploying again with the same name updates the existing workflow.

## Adding a new GSM

1. Add an entry to the `gsms` array of the matching `chainName` block in `config.production.json` (and optionally `config.staging.json`):

```json
{ "address": "0x<gsm-address>" }
```

2. If the chain is not yet listed, add a new `evms` entry with the `chainName`, the `mailboxAddress` of the deployed `MailboxCRE` on that chain, and the `gsms` array. Make sure the `chainName` is added to `cre/project.yaml` with an RPC URL.

3. Simulate, then deploy.
