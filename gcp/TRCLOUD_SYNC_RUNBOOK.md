# TRCloud Kitchen Sync Runbook

Project: `whtdk-500801`

## What This Job Does

- Backfill MR, GR, INC, PO from TRCloud company 14.
- Write canonical JSON snapshots for the app.
- Write NDJSON files for BigQuery or later analytics loads.
- Keep `latest.json` pointers in Cloud Storage.
- Track document hashes/update timestamps to detect documents changed today.

## Output Layout

```text
gs://kitchen-sepon-data/trcloud/snapshots/gr/latest.json
gs://kitchen-sepon-data/trcloud/snapshots/mr/latest.json
gs://kitchen-sepon-data/trcloud/snapshots/inc/latest.json
gs://kitchen-sepon-data/trcloud/snapshots/po/latest.json

gs://kitchen-sepon-data/trcloud/normalized/gr_orders.ndjson
gs://kitchen-sepon-data/trcloud/normalized/gr_lines.ndjson
gs://kitchen-sepon-data/trcloud/normalized/mr_orders.ndjson
gs://kitchen-sepon-data/trcloud/normalized/mr_lines.ndjson

gs://kitchen-sepon-data/trcloud/manifests/latest.json
gs://kitchen-sepon-data/trcloud/state/sync_state.json
```

## First-Time Setup

From repo root:

```powershell
gcloud config set project whtdk-500801
.\gcp\add_trcloud_secrets.ps1
.\gcp\deploy_trcloud_sync.ps1
```

`add_trcloud_secrets.ps1` prompts for TRCloud credentials and passkeys, then writes them to Secret Manager.

## First Backfill

```powershell
gcloud run jobs execute python-trcloud-fetch `
  --region asia-southeast1 `
  --wait `
  --args='^|^--mode=backfill|--from=2026-01-01|--to=2026-06-30'
```

## Delta Run

The scheduler runs every 30 minutes. Manual run:

```powershell
gcloud run jobs execute python-trcloud-fetch `
  --region asia-southeast1 `
  --wait `
  --args='^|^--mode=delta'
```

Default delta scans from `TRCLOUD_SCAN_FROM=2026-01-01` so MR/GR/PO edits on older documents can be caught from `gl.update_dt`.

For a faster but less complete run:

```powershell
gcloud run jobs execute python-trcloud-fetch `
  --region asia-southeast1 `
  --wait `
  --args='^|^--mode=delta|--fast-window|--lookback-days=14'
```

## Local Smoke Test

```powershell
python .\Python_K\trcloud_sync_runner.py --help
python .\Python_K\trcloud_sync_runner.py --mode=delta --doc-types=GR --skip-cloud --output-dir=.\out
```

The second command needs local TRCloud environment variables or a local `.env`.
