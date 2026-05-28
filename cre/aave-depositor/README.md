# Aave Depositor — CRE Automation Workflow

This workflow uses the Chainlink Runtime Environment (CRE) to deposit idle USDC and other reserve assets sitting in an Aave Collector into the Aave V3 lending pools, and to migrate residual V2 aToken balances into V3. On each cron tick it inspects every active V3 reserve, computes the eligible deposit amount per token (subject to supply cap room and a configurable USD threshold), batches all calls into a single multicall, and submits a signed CRE report to the `AaveIntentExecutor` contract which forwards the multicall through the Roles Modifier to the Aave Steward.

## Architecture

```
CRE Workflow (cron)
  ├─ getAllReservesTokens(dataProviderV3)
  ├─ getAssetsPrices(priceOracle, tokens)
  ├─ batchGetReserveConfigurationData(tokens)
  ├─ batchGetReserveCaps(tokens)
  ├─ batchGetErc20Balances(collector, tokens)
  ├─ buildDepositCalls(...)         # one steward.depositV3 per eligible token
  ├─ buildMigrationCalls(...)       # one steward.migrateV2toV3 per V2 aToken with balance (V2 chains only)
  └─ runtime.report() → writeReport → AaveIntentExecutor.onReport()
                                           └─ roles.execTransactionWithRole(steward, multicall)
                                                 └─ steward.multicall([depositV3, ..., migrateV2toV3, ...])
```

### AaveIntentExecutor

`AaveIntentExecutor` ([src/contracts/cre-receivers/AaveIntentExecutor.sol](../../src/contracts/cre-receivers/AaveIntentExecutor.sol)) is the on-chain receiver. It extends `ReceiverTemplate` (which implements the CRE `IReceiver` interface) and, on `onReport`, decodes the report as raw `bytes` (the Steward multicall payload) and forwards it via `IRoles(roles).execTransactionWithRole(steward, ..., roleKey, ...)`. The Roles Modifier mediates which functions on the Steward the bot is permitted to call.

## Deployment model

CRE has a global per-workflow RPC call limit. With ~10-15 active reserves per chain, a single chain already exhausts that budget. **One workflow instance is deployed per chain** — `staging-ethereum-settings`, `staging-arbitrum-settings`, `staging-base-settings`, `staging-optimism-settings` are each separate workflow registrations pointing at a per-chain config JSON. The config schema is a single-chain flat object (one JSON per chain, not a multi-chain `evms[]` array) to reflect this operating model.

## Config files

| File                           | Target                      | Purpose                                              |
| ------------------------------ | --------------------------- | ---------------------------------------------------- |
| `config.staging.ethereum.json` | `staging-ethereum-settings` | Ethereum mainnet (Core V3 + Prime V3 + V2 migration) |
| `config.staging.arbitrum.json` | `staging-arbitrum-settings` | Arbitrum (Core V3 only)                              |
| `config.staging.base.json`     | `staging-base-settings`     | Base (Core V3 only)                                  |
| `config.staging.optimism.json` | `staging-optimism-settings` | Optimism (Core V3 only)                              |
| `config.production.json`       | `production-settings`       | Placeholder for production rollout                   |

### Config schema

```jsonc
{
  "schedule": "0 0 12 */14 * *",
  "chainName": "ethereum-mainnet", // CRE chain selector name
  "executor": "0x...", // deployed AaveIntentExecutor address
  "steward": "0x...", // Aave Steward (target of the multicall)
  "dataProviderV3": "0x...",
  "dataProviderV2": "0x...", // optional — omit on chains without V2
  "collector": "0x...", // Aave Collector (source of idle funds)
  "priceOracle": "0x...",
  "corePoolV3": "0x...",
  "primePoolV3": "0x...", // optional — omit if no prime pool
  "corePoolV2": "0x...", // optional — omit on chains without V2
  "depositMinUsd": "100000000000", // 8-decimal USD; tokens below this are skipped
  "migrationMinUsd": "500000000000",
  "migrationBps": "9000", // 90% — fraction of V2 aToken balance to migrate
  "maxBps": "10000",
  "ignoredTokens": ["0x..."], // tokens the bot must not touch
  "primeTokens": ["0x..."] // tokens routed to the prime pool instead of core
}
```

The `_rolesModifier` and `_roleKey` annotations in the JSONs are deployment metadata (constructor args of the `AaveIntentExecutor`) — they are read by the deployment script, not by the workflow at runtime.

## Setup

If `bun` is not already installed, see https://bun.sh/docs/installation.

```bash
cd cre/aave-depositor && bun install
```

Populate `.env` at the repo root with one RPC URL per chain:

```env
RPC_URL_ETHEREUM=https://...
RPC_URL_ARBITRUM=https://...
RPC_URL_BASE=https://...
RPC_URL_OPTIMISM=https://...
```

Export the vars before running `cre workflow ...` (the CLI does not load `.env` automatically):

```bash
set -a; source .env; set +a
```

## Test

```bash
cd cre/aave-depositor && bun test
```

## Simulate

Run from the **project root** (the parent of `aave-depositor/`):

```bash
cre workflow simulate ./aave-depositor --target=staging-ethereum-settings
cre workflow simulate ./aave-depositor --target=staging-arbitrum-settings
cre workflow simulate ./aave-depositor --target=staging-base-settings
cre workflow simulate ./aave-depositor --target=staging-optimism-settings
```

Simulation runs the full off-chain pipeline (all view calls + intent encoding + gas estimation) but does not broadcast unless `--broadcast` is passed.

## Deploy

```bash
cre workflow deploy ./aave-depositor --target=staging-ethereum-settings
# ... one deploy per chain
```

The workflow name is set in `workflow.yaml` (`aave-depositor-staging-<chain>` / `aave-depositor-production`). Deploying again with the same name updates the existing workflow.

## Adding a new chain

1. Add an RPC entry for the chain in [cre/project.yaml](../project.yaml) under a new `staging-<chain>` target.
2. Create a `config.staging.<chain>.json` mirroring an existing per-chain config, populating the chain's executor / steward / data providers / collector / price oracle / pool addresses.
3. Add a `staging-<chain>` block to [workflow.yaml](workflow.yaml) pointing at the new config.
4. Deploy `AaveIntentExecutor.sol` on the chain (with the chain's Roles Modifier + roleKey as constructor args) and grant it the relevant role on the Steward via the Roles Modifier.
5. Simulate, then deploy the workflow.
