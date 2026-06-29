# TRCloud to Google Cloud Sync Design

วันที่ออกแบบ: 2026-06-30

Google Cloud project:

- Project ID: `whtdk-500801`
- Project number: `789384746166`

เอกสารนี้ออกแบบ flow สำหรับดึงข้อมูล TRCloud ของระบบครัว โดยแยกเป็น 2 ชุดหลัก:

1. ชุดดึงทั้งหมดตั้งแต่ต้นปี
2. ชุดตรวจเอกสารที่มีการเปลี่ยนแปลงของวันนี้และช่วงล่าสุด

ห้ามเก็บ credential จริงใน repo ให้เก็บใน Google Secret Manager เท่านั้น


## เป้าหมาย

- ให้หน้าเว็บ/API อ่านข้อมูลเร็ว โดยโหลด `latest.json` เข้า memory
- เก็บ history ทุกครั้งที่ sync เพื่อ audit/replay ได้
- รองรับ analytics ด้วย NDJSON หรือ Parquet สำหรับ BigQuery
- ลดการยิง TRCloud สดจากหน้าเว็บ
- ตรวจเอกสารใหม่และเอกสารที่แก้ไขล่าสุดให้ได้มากที่สุดตาม field ที่ TRCloud เปิดให้


## รูปแบบข้อมูล 2 ชั้น

### 1. Canonical JSON Snapshot

ใช้สำหรับแอปและ NestJS API โดยตรง

โครงสร้างหลัก:

```json
{
  "schema_version": 2,
  "doc_type": "MR",
  "fetched_at": "2026-06-30T08:30:00+07:00",
  "date_from": "2026-01-01",
  "date_to": "2026-06-30",
  "source": "trcloud",
  "company_id": "14",
  "count": 1708,
  "summary": {
    "order_count": 1708,
    "line_count": 3839,
    "total_value_baht": 0,
    "unique_products": 0
  },
  "orders": [],
  "lines": [],
  "product_index": []
}
```

Path หลักบน Cloud Storage:

```text
gs://kitchen-sepon-data/trcloud/snapshots/gr/latest.json
gs://kitchen-sepon-data/trcloud/snapshots/mr/latest.json
gs://kitchen-sepon-data/trcloud/snapshots/inc/latest.json
gs://kitchen-sepon-data/trcloud/snapshots/po/latest.json
```

Path history แบบ partition:

```text
gs://kitchen-sepon-data/trcloud/snapshots/gr/dt=2026-06-30/run_id=20260630T083000/snapshot.json
gs://kitchen-sepon-data/trcloud/snapshots/mr/dt=2026-06-30/run_id=20260630T083000/snapshot.json
gs://kitchen-sepon-data/trcloud/snapshots/inc/dt=2026-06-30/run_id=20260630T083000/snapshot.json
gs://kitchen-sepon-data/trcloud/snapshots/po/dt=2026-06-30/run_id=20260630T083000/snapshot.json
```

แนวทางเขียนไฟล์:

1. Python เขียนไฟล์ history ก่อน
2. ตรวจว่า JSON ถูกต้องและจำนวน record ไม่ผิดปกติ
3. ค่อย copy/overwrite ไปที่ `latest.json`
4. เขียน manifest ของ run


### 2. NDJSON หรือ Parquet สำหรับ Analytics

ใช้สำหรับ BigQuery / report หนัก / historical analysis

NDJSON แยกตามชนิดและระดับข้อมูล:

```text
gs://kitchen-sepon-data/trcloud/normalized/mr_orders/dt=2026-06-30/run_id=20260630T083000/part-000.ndjson
gs://kitchen-sepon-data/trcloud/normalized/mr_lines/dt=2026-06-30/run_id=20260630T083000/part-000.ndjson
gs://kitchen-sepon-data/trcloud/normalized/gr_orders/dt=2026-06-30/run_id=20260630T083000/part-000.ndjson
gs://kitchen-sepon-data/trcloud/normalized/gr_lines/dt=2026-06-30/run_id=20260630T083000/part-000.ndjson
gs://kitchen-sepon-data/trcloud/normalized/inc_orders/dt=2026-06-30/run_id=20260630T083000/part-000.ndjson
gs://kitchen-sepon-data/trcloud/normalized/inc_lines/dt=2026-06-30/run_id=20260630T083000/part-000.ndjson
gs://kitchen-sepon-data/trcloud/normalized/po_orders/dt=2026-06-30/run_id=20260630T083000/part-000.ndjson
gs://kitchen-sepon-data/trcloud/normalized/po_lines/dt=2026-06-30/run_id=20260630T083000/part-000.ndjson
```

Parquet ใช้ภายหลังเมื่อ BigQuery/report เริ่มหนัก:

```text
gs://kitchen-sepon-data/trcloud/parquet/mr_orders/dt=2026-06-30/part-000.parquet
gs://kitchen-sepon-data/trcloud/parquet/mr_lines/dt=2026-06-30/part-000.parquet
```


## Services ที่ใช้บน Google Cloud

### Cloud Storage

Bucket:

```text
kitchen-sepon-data
```

ใช้เก็บ:

- Raw response
- Canonical snapshot
- Normalized NDJSON
- Run manifest


### Secret Manager

Secrets ที่ต้องมี:

```text
trcloud-erp-url
trcloud-username
trcloud-password
trcloud-device-id
trcloud-origin-passkey
trcloud-company-id
trcloud-company-passkey
database-url
```

หมายเหตุ:

- `trcloud-company-id` สำหรับข้อมูลครัวควรเป็น `14`
- login ใช้ origin company แล้ว switch เข้า company `14`
- ไม่ใส่ secret จริงใน `.env`, source code, Cloud Build log หรือ GitHub


### Cloud Run Jobs

ใช้รัน Python fetcher แบบงานรันแล้วจบ

Jobs หลัก:

```text
python-trcloud-backfill
python-trcloud-delta
python-trcloud-reconcile
```

#### python-trcloud-backfill

หน้าที่:

- ดึงข้อมูลทั้งหมดตั้งแต่ต้นปี
- เริ่มช่วง: `2026-01-01`
- ถึงวันที่รันงาน
- ดึง MR, GR, INC, PO
- เขียน snapshot และ NDJSON
- update state ใน Cloud SQL

ใช้เมื่อ:

- setup ครั้งแรก
- ต้อง rebuild snapshot ใหม่
- schema เปลี่ยน


#### python-trcloud-delta

หน้าที่:

- รันบ่อย
- หาเอกสารใหม่และเอกสารที่แก้ไขวันนี้
- MR/GR ใช้ `detail.gl.update_dt`
- INC ใช้ `content_hash`
- PO ใช้ `update_dt` จาก list/detail ถ้ามี
- update `latest.json`
- ส่ง event ให้ API reload cache

ช่วงที่ควรดึง:

```text
today
yesterday
rolling lookback 7-14 days
open/status documents
```

เหตุผล:

- เอกสารบางใบ issue date ไม่ตรงกับวันที่แก้ไข
- INC ไม่มี update timestamp จึงต้องดูหลายวันย้อนหลังและเทียบ hash


#### python-trcloud-reconcile

หน้าที่:

- รันกลางคืน
- scan ย้อนหลัง 3-6 เดือน
- จับเอกสารเก่าที่ถูกแก้ย้อนหลัง
- สำคัญมากสำหรับ INC เพราะไม่มี update timestamp


### Cloud Scheduler

ตั้ง schedule:

```text
trcloud-delta-every-5min
trcloud-nightly-reconcile
trcloud-monthly-backfill-refresh
```

ตัวอย่าง cadence:

```text
python-trcloud-delta       ทุก 5 นาที
python-trcloud-reconcile   ทุกวัน 02:00 Asia/Bangkok
python-trcloud-backfill    manual หรือ monthly
```


### Pub/Sub

Topic:

```text
trcloud-sync-events
```

Event payload:

```json
{
  "run_id": "20260630T083000",
  "doc_types": ["MR", "GR", "INC", "PO"],
  "updated_snapshots": {
    "MR": "gs://kitchen-sepon-data/trcloud/snapshots/mr/latest.json",
    "GR": "gs://kitchen-sepon-data/trcloud/snapshots/gr/latest.json"
  },
  "created_at": "2026-06-30T08:30:00+07:00"
}
```

ใช้เพื่อ:

- แจ้ง NestJS API ให้ reload cache
- trigger BigQuery load job
- แจ้ง monitor/log


### Cloud Run API

NestJS API:

```text
warehouse-api
```

หน้าที่:

- โหลด `latest.json` จาก Cloud Storage ตอน start
- cache ข้อมูลไว้ใน memory
- reload เมื่อได้รับ Pub/Sub หรือเรียก endpoint ภายใน
- หน้าเว็บอ่านจาก API นี้ ไม่อ่าน TRCloud สด

Reload endpoint ภายใน:

```text
POST /api/v1/admin/trcloud/reload
```

ควรป้องกันด้วย internal auth/service account


### Cloud SQL PostgreSQL

ใช้เก็บ state และ transaction ของระบบเรา

ไม่ควรใช้แทน snapshot ทั้งหมด แต่ใช้เป็นตัวควบคุม sync state

ตารางหลัก:

```sql
CREATE TABLE trcloud_sync_documents (
  doc_type TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  doc_key TEXT NOT NULL,
  doc_ref TEXT,
  issue_date DATE,
  source_created_at TIMESTAMPTZ,
  source_updated_at TIMESTAMPTZ,
  content_hash TEXT NOT NULL,
  raw_gcs_uri TEXT,
  snapshot_gcs_uri TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_status TEXT NOT NULL DEFAULT 'SYNCED',
  PRIMARY KEY (doc_type, doc_id)
);
```

Run log:

```sql
CREATE TABLE trcloud_sync_runs (
  run_id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  date_from DATE,
  date_to DATE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  summary JSONB,
  error_message TEXT
);
```

Lock:

```sql
CREATE TABLE trcloud_sync_locks (
  lock_name TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
```


### BigQuery

Dataset:

```text
trcloud_warehouse
```

Tables:

```text
mr_orders
mr_lines
gr_orders
gr_lines
inc_orders
inc_lines
po_orders
po_lines
sync_runs
```

ใช้:

- historical analytics
- cost dashboard
- trend report
- heavy joins

ไม่ใช้สำหรับ API หน้าเว็บแบบ realtime เพราะ API memory cache เร็วกว่า


## แผนการดึงข้อมูลตามชนิดเอกสาร

### MR

List:

```text
POST /application/ics/api/engine-ics/search_mr.php
```

Detail:

```text
POST /application/ics/api/engine-ics/retrieve_mr.php
```

Update cursor:

```text
detail.gl.update_dt
```

Doc key:

```text
MR:<mr_id>
```

Backfill:

- ดึงตั้งแต่ `2026-01-01` ถึงวันปัจจุบัน
- ดึง detail ทุกใบ
- เก็บ `gl.update_dt` เป็น `source_updated_at`

Delta:

- ดึง list วันนี้ + rolling window 14 วัน
- call detail
- sync เฉพาะใบที่ `gl.update_dt > source_updated_at` หรือ hash เปลี่ยน


### GR

List:

```text
POST /application/ics/api/engine-receive/search_receive.php
```

Detail:

```text
POST /application/ics/api/engine-receive/retrieve_receive.php
```

Update cursor:

```text
detail.gl.update_dt
```

Doc key:

```text
GR:<receive_id>
```

Backfill:

- ดึงตั้งแต่ `2026-01-01` ถึงวันปัจจุบัน
- ดึง detail ทุกใบ
- เก็บ `gl.update_dt` เป็น `source_updated_at`

Delta:

- ดึง list วันนี้ + rolling window 14 วัน
- call detail
- sync เฉพาะใบที่ `gl.update_dt > source_updated_at` หรือ hash เปลี่ยน


### INC

List:

```text
POST /application/ordermgmt_po/api/engine-cargo/cargo_search_keyword.php
```

Detail:

```text
POST /application/ordermgmt_po/api/engine-cargo/show_detail.php
```

Update cursor:

```text
ไม่มี update timestamp จาก endpoint ที่ตรวจพบ
```

Doc key:

```text
INC:<document_id>
```

Backfill:

- ดึงตั้งแต่ `2026-01-01` ถึงวันปัจจุบัน
- ดึง detail ทุกใบ
- คำนวณ `content_hash`

Delta:

- ดึง list วันนี้ + rolling window 14 วัน
- ดึง detail ทุกใบใน candidate set
- sync เฉพาะใบที่ `content_hash` เปลี่ยน

Nightly:

- scan ย้อนหลัง 3-6 เดือน
- เพราะ INC ไม่มี update timestamp


### PO

List:

```text
POST /application/expense/api/engine-po/po_search_keyword.php
```

Detail:

```text
POST /application/expense/api/engine-po/retrieve_po.php
```

Update cursor:

```text
update_dt
```

Doc key:

```text
PO:<po_id>
```

Backfill:

- ดึงตั้งแต่ `2026-01-01` ถึงวันปัจจุบัน
- ใช้ `update_dt` ถ้ามี

Delta:

- ดึงวันนี้ + rolling window
- sync เฉพาะ `update_dt` ใหม่กว่า state หรือ hash เปลี่ยน


## Initial Backfill Flow

Job:

```text
python-trcloud-backfill
```

Input:

```text
date_from=2026-01-01
date_to=<today>
doc_types=MR,GR,INC,PO
```

Steps:

1. Create `run_id`
2. Login TRCloud
3. Switch to company 14
4. Fetch list for each doc type
5. Fetch detail for every document
6. Normalize to canonical schema v2
7. Compute `doc_key`
8. Compute `content_hash`
9. Upsert document state in Cloud SQL
10. Write raw detail files to Cloud Storage
11. Write snapshot history
12. Write normalized NDJSON
13. Promote snapshot to `latest.json`
14. Publish Pub/Sub event
15. Finish run log


## Today Delta Flow

Job:

```text
python-trcloud-delta
```

Input:

```text
today=<Asia/Bangkok date>
lookback_days=14
doc_types=MR,GR,INC,PO
```

Candidate date range:

```text
date_from=today - 14 days
date_to=today
```

Steps:

1. Create `run_id`
2. Acquire sync lock
3. Login TRCloud
4. Switch to company 14
5. Fetch candidate list by doc type
6. For MR/GR:
   - fetch detail
   - read `gl.update_dt`
   - compare with Cloud SQL state
7. For PO:
   - compare `update_dt`
   - fetch detail only when needed
8. For INC:
   - fetch detail
   - compute `content_hash`
   - compare with Cloud SQL state
9. Write changed raw/detail payloads to Cloud Storage
10. Update Cloud SQL document state
11. Rebuild affected `latest.json`
12. Write NDJSON for changed docs
13. Publish Pub/Sub reload event
14. Release sync lock


## Snapshot promotion rule

Do not write directly to `latest.json` first.

Correct order:

```text
1. write run snapshot
2. validate run snapshot
3. write manifest
4. copy run snapshot to latest.json
5. publish event
```

This prevents API from loading a partial/corrupt file.


## Manifest

Path:

```text
gs://kitchen-sepon-data/trcloud/runs/run_id=20260630T083000/manifest.json
```

Example:

```json
{
  "run_id": "20260630T083000",
  "job_type": "delta",
  "project_id": "whtdk-500801",
  "company_id": "14",
  "date_from": "2026-06-16",
  "date_to": "2026-06-30",
  "started_at": "2026-06-30T08:30:00+07:00",
  "finished_at": "2026-06-30T08:31:20+07:00",
  "doc_types": {
    "MR": {
      "candidate_count": 51,
      "changed_count": 3,
      "snapshot_uri": "gs://kitchen-sepon-data/trcloud/snapshots/mr/dt=2026-06-30/run_id=20260630T083000/snapshot.json"
    },
    "GR": {
      "candidate_count": 1,
      "changed_count": 0
    },
    "INC": {
      "candidate_count": 69,
      "changed_count": 2
    }
  }
}
```


## API cache reload

API behavior:

- On startup, load `latest.json` for each doc type from Cloud Storage.
- Keep cache in memory.
- On Pub/Sub event or internal reload request, reload only affected doc types.

Recommended internal endpoint:

```text
POST /api/v1/admin/trcloud/reload
```

Payload:

```json
{
  "doc_types": ["MR", "GR", "INC", "PO"],
  "run_id": "20260630T083000"
}
```


## Deployment units

Container image:

```text
asia-southeast1-docker.pkg.dev/whtdk-500801/kitchen/trcloud-sync:latest
```

Cloud Run Jobs:

```text
python-trcloud-backfill
python-trcloud-delta
python-trcloud-reconcile
```

Cloud Run API:

```text
warehouse-api
```

Bucket:

```text
kitchen-sepon-data
```

BigQuery dataset:

```text
trcloud_warehouse
```


## IAM outline

Service account for sync jobs:

```text
trcloud-sync-sa@whtdk-500801.iam.gserviceaccount.com
```

Needs:

- Secret Manager Secret Accessor
- Storage Object Admin on `kitchen-sepon-data`
- Cloud SQL Client
- Pub/Sub Publisher
- BigQuery Data Editor if loading analytics

Service account for API:

```text
warehouse-api-sa@whtdk-500801.iam.gserviceaccount.com
```

Needs:

- Storage Object Viewer on `kitchen-sepon-data`
- Pub/Sub Subscriber if using push/pull event reload
- Cloud SQL Client if API uses SQL


## Implementation notes for Python_K

Add a new sync runner around existing fetchers:

```text
Python_K/trcloud_sync_runner.py
```

Responsibilities:

- Read mode: `backfill`, `delta`, `reconcile`
- Read doc types
- Login/switch company
- Call existing fetchers
- Normalize output
- Compute content hash
- Write to GCS
- Upsert Cloud SQL state
- Emit Pub/Sub event

Recommended CLI:

```text
python Python_K/trcloud_sync_runner.py --mode backfill --from 2026-01-01 --to 2026-06-30
python Python_K/trcloud_sync_runner.py --mode delta --lookback-days 14
python Python_K/trcloud_sync_runner.py --mode reconcile --lookback-days 180
```


## Final decision

Use this split:

- App serving: canonical `latest.json` loaded into NestJS memory
- Historical storage: partitioned snapshot JSON in Cloud Storage
- Analytics: NDJSON first, Parquet later if needed
- State/change detection: Cloud SQL
- MR/GR update detection: `detail.gl.update_dt`
- INC update detection: `content_hash`
- PO update detection: `update_dt`

This gives fast web response, reliable history, and a clear route to BigQuery
without making the frontend depend on live TRCloud calls.
