# -*- coding: utf-8 -*-
"""TRCloud snapshot sync runner for local runs and Google Cloud Run Jobs.

Outputs:
- trcloud/snapshots/<doc_type>/<run_id>/snapshot.json
- trcloud/snapshots/<doc_type>/latest.json
- trcloud/normalized/<doc_type>_orders.ndjson
- trcloud/normalized/<doc_type>_lines.ndjson
- trcloud/manifests/latest.json
- trcloud/state/sync_state.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from trcloud_auth import get_cookie_for_company
from trcloud_commonK import TRCloudICSFetcher, _to_number
from trcloud_env import env, env_bool
from trcloud_GRK import GR_CONFIG
from trcloud_INC import INC_CONFIG
from trcloud_MRK import MR_CONFIG
from trcloud_POK import PO_CONFIG


for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass


DOC_CONFIGS = {
    "GR": GR_CONFIG,
    "MR": MR_CONFIG,
    "INC": INC_CONFIG,
    "PO": PO_CONFIG,
}

LOCAL_TZ = ZoneInfo(env("TRCLOUD_TIMEZONE", "Asia/Bangkok") or "Asia/Bangkok")


def now_local() -> datetime:
    return datetime.now(LOCAL_TZ).replace(tzinfo=None)


def today_str() -> str:
    return now_local().strftime("%Y-%m-%d")


def year_start_str() -> str:
    return f"{now_local().year}-01-01"


def run_id() -> str:
    return now_local().strftime("%Y%m%dT%H%M%S")


def parse_doc_types(value: str) -> list[str]:
    out = []
    for part in (value or "").split(","):
        name = part.strip().upper()
        if not name:
            continue
        if name not in DOC_CONFIGS:
            raise ValueError(f"Unsupported doc type: {name}")
        out.append(name)
    return out or ["GR", "MR", "INC", "PO"]


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def content_hash(value: Any) -> str:
    return hashlib.sha256(stable_json(value).encode("utf-8")).hexdigest()


def strip_sync_fields(row: dict[str, Any]) -> dict[str, Any]:
    skip = {"content_hash", "sync_action", "changed_reason", "doc_key"}
    return {k: v for k, v in row.items() if k not in skip}


def date_prefix(value: Any) -> str:
    text = str(value or "").strip()
    if len(text) >= 10 and text[4:5] == "-" and text[7:8] == "-":
        return text[:10]
    return ""


def id_field_for(doc_type: str) -> str:
    return DOC_CONFIGS[doc_type].id_field


def doc_key_for(doc_type: str, order: dict[str, Any]) -> str:
    idf = id_field_for(doc_type)
    doc_id = str(order.get(idf) or order.get("doc_id") or order.get("id") or "")
    return f"{doc_type}:{doc_id}"


def add_hashes(doc_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    idf = id_field_for(doc_type)
    lines_by_doc: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for line in payload.get("lines", []):
        doc_id = str(line.get(idf) or line.get("doc_id") or "")
        doc_key = f"{doc_type}:{doc_id}"
        line["doc_key"] = doc_key
        lines_by_doc[doc_id].append(line)

    for order in payload.get("orders", []):
        doc_id = str(order.get(idf) or "")
        order["doc_key"] = f"{doc_type}:{doc_id}"
        basis = {
            "order": strip_sync_fields(order),
            "lines": [strip_sync_fields(x) for x in lines_by_doc.get(doc_id, [])],
        }
        order["content_hash"] = content_hash(basis)
    return payload


def mark_changes(doc_type: str, payload: dict[str, Any], state: dict[str, Any], mode: str) -> list[dict[str, Any]]:
    previous = state.setdefault("documents", {}).setdefault(doc_type, {})
    changed = []
    today = today_str()
    timestamp_doc_types = {"GR", "MR", "PO"}

    for order in payload.get("orders", []):
        key = order["doc_key"]
        prev = previous.get(key) or {}
        updated_at = str(order.get("source_updated_at") or "")
        created_at = str(order.get("source_created_at") or "")
        issue_date = str(order.get("issue_date") or "")
        digest = str(order.get("content_hash") or "")

        reasons = []
        if mode == "backfill":
            reasons.append("backfill")
        elif not prev:
            reasons.append("new")
        elif prev.get("content_hash") != digest:
            reasons.append("hash_changed")

        if doc_type in timestamp_doc_types and date_prefix(updated_at) == today:
            reasons.append("source_updated_today")
        if date_prefix(created_at) == today or date_prefix(issue_date) == today:
            reasons.append("source_created_or_issued_today")

        action = "changed" if reasons else "unchanged"
        order["sync_action"] = action
        order["changed_reason"] = sorted(set(reasons))
        if action == "changed":
            changed.append(order)

        previous[key] = {
            "doc_key": key,
            "doc_type": doc_type,
            "content_hash": digest,
            "source_updated_at": updated_at,
            "source_created_at": created_at,
            "issue_date": issue_date,
            "last_seen_at": now_local().strftime("%Y-%m-%dT%H:%M:%S"),
        }

    return changed


def rebuild_payload_summary(payload: dict[str, Any]) -> dict[str, Any]:
    lines = payload.get("lines", [])
    orders = payload.get("orders", [])
    product_index = TRCloudICSFetcher._build_product_index(lines)
    payload["count"] = len(orders)
    payload["summary"] = {
        "order_count": len(orders),
        "line_count": len(lines),
        "total_value_baht": round(sum(_to_number(o.get("total_value_baht")) for o in orders), 2),
        "unique_products": len(product_index),
    }
    payload["product_index"] = product_index
    return payload


def merge_latest(existing: dict[str, Any] | None, current: dict[str, Any], doc_type: str) -> dict[str, Any]:
    if not existing:
        return rebuild_payload_summary(current)

    idf = id_field_for(doc_type)
    merged = dict(existing)
    merged.update({
        "schema_version": current.get("schema_version", existing.get("schema_version")),
        "doc_type": doc_type,
        "fetched_at": current.get("fetched_at"),
        "date_from": min(str(existing.get("date_from") or current.get("date_from")), str(current.get("date_from"))),
        "date_to": max(str(existing.get("date_to") or current.get("date_to")), str(current.get("date_to"))),
        "source": "trcloud",
        "company_id": current.get("company_id", existing.get("company_id", "")),
    })

    order_by_id = {
        str(o.get(idf) or ""): o
        for o in existing.get("orders", [])
        if str(o.get(idf) or "")
    }
    changed_ids = set()
    for order in current.get("orders", []):
        doc_id = str(order.get(idf) or "")
        if doc_id:
            order_by_id[doc_id] = order
            changed_ids.add(doc_id)

    kept_lines = [
        line for line in existing.get("lines", [])
        if str(line.get(idf) or "") not in changed_ids
    ]
    merged["orders"] = sorted(order_by_id.values(), key=lambda x: (str(x.get("issue_date") or ""), str(x.get(idf) or "")))
    merged["lines"] = kept_lines + current.get("lines", [])
    return rebuild_payload_summary(merged)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def write_ndjson(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def relative_key(path: Path, output_dir: Path) -> str:
    return path.resolve().relative_to(output_dir.resolve()).as_posix()


class CloudStorageClient:
    def __init__(self, bucket_name: str):
        self.bucket_name = bucket_name
        self.client = None
        self.bucket = None
        if bucket_name:
            try:
                from google.cloud import storage
            except Exception as exc:
                print(f"GCS disabled: google-cloud-storage is not installed ({exc})")
                return
            self.client = storage.Client(project=env("GCP_PROJECT_ID", env("GOOGLE_CLOUD_PROJECT", "")) or None)
            self.bucket = self.client.bucket(bucket_name)

    @property
    def enabled(self) -> bool:
        return self.bucket is not None

    def upload(self, local_path: Path, output_dir: Path) -> str | None:
        if not self.enabled:
            return None
        key = relative_key(local_path, output_dir)
        blob = self.bucket.blob(key)
        blob.upload_from_filename(str(local_path))
        return f"gs://{self.bucket_name}/{key}"

    def download_json(self, key: str) -> dict[str, Any] | None:
        if not self.enabled:
            return None
        blob = self.bucket.blob(key)
        if not blob.exists():
            return None
        return json.loads(blob.download_as_text(encoding="utf-8"))


def publish_reload_event(topic: str, manifest: dict[str, Any]) -> None:
    if not topic:
        return
    try:
        from google.cloud import pubsub_v1
    except Exception as exc:
        print(f"Pub/Sub disabled: google-cloud-pubsub is not installed ({exc})")
        return
    publisher = pubsub_v1.PublisherClient()
    project = env("GCP_PROJECT_ID", env("GOOGLE_CLOUD_PROJECT", ""))
    topic_path = topic if topic.startswith("projects/") else publisher.topic_path(project, topic)
    publisher.publish(topic_path, stable_json(manifest).encode("utf-8")).result(timeout=30)
    print(f"Published reload event: {topic_path}")


def fetch_payload(doc_type: str, date_from: str, date_to: str, cookie: str, company_id: str, passkey: str, sleep_between: float) -> dict[str, Any]:
    cfg = DOC_CONFIGS[doc_type]
    fetcher = TRCloudICSFetcher(cfg, company_id, passkey, cookie)
    records = fetcher.fetch_list(date_from, date_to, sleep_between=sleep_between)
    items, detail_heads = fetcher.extract_items(records, sleep_between=sleep_between) if records else ([], {})
    payload = fetcher.build_json_payload(records, items, date_from, date_to, detail_heads, company_id=company_id)
    return add_hashes(doc_type, payload)


def default_dates(mode: str, args: argparse.Namespace) -> tuple[str, str]:
    if args.date_from:
        start = args.date_from
    elif mode == "backfill":
        start = year_start_str()
    else:
        start = args.scan_from or year_start_str()

    end = args.date_to or today_str()
    if args.lookback_days and not args.date_from and mode != "backfill" and not args.scan_from:
        # Keep year-start as the correctness default; users can force a fast window
        # by passing --fast-window.
        pass
    if args.fast_window and mode != "backfill" and not args.date_from:
        start = (now_local().date() - timedelta(days=args.lookback_days)).strftime("%Y-%m-%d")
    return start, end


def init_state(run: str) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "last_run_id": run,
        "last_run_at": now_local().strftime("%Y-%m-%dT%H:%M:%S"),
        "documents": {},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="TRCloud Kitchen sync runner")
    parser.add_argument("--mode", choices=["backfill", "delta", "reconcile"], default="delta")
    parser.add_argument("--doc-types", default=env("TRCLOUD_DOC_TYPES", "GR,MR,INC,PO"))
    parser.add_argument("--from", dest="date_from", default="")
    parser.add_argument("--to", dest="date_to", default="")
    parser.add_argument("--scan-from", default=env("TRCLOUD_SCAN_FROM", ""))
    parser.add_argument("--lookback-days", type=int, default=int(env("TRCLOUD_LOOKBACK_DAYS", "14") or 14))
    parser.add_argument("--fast-window", action="store_true", default=env_bool("TRCLOUD_FAST_WINDOW", False))
    parser.add_argument("--sleep", type=float, default=float(env("TRCLOUD_REQUEST_SLEEP", "0") or 0))
    parser.add_argument("--output-dir", default=env("TRCLOUD_OUTPUT_DIR", "./out"))
    parser.add_argument("--bucket", default=env("TRCLOUD_GCS_BUCKET", env("GCS_BUCKET", "")))
    parser.add_argument("--pubsub-topic", default=env("TRCLOUD_RELOAD_TOPIC", ""))
    parser.add_argument("--skip-cloud", action="store_true", default=env_bool("TRCLOUD_SKIP_CLOUD", False))
    args = parser.parse_args()

    company_id = env("TRCLOUD_COMPANY_ID", "14")
    passkey = env("TRCLOUD_PASSKEY")
    origin_passkey = env("TRCLOUD_ORIGIN_PASSKEY")
    use_switch = env_bool("TRCLOUD_USE_COMPANY_SWITCH", True)
    if not passkey:
        raise ValueError("Missing TRCLOUD_PASSKEY for target company data extraction")

    docs = parse_doc_types(args.doc_types)
    rid = run_id()
    date_from, date_to = default_dates(args.mode, args)
    output_dir = Path(args.output_dir)
    root = output_dir / "trcloud"
    state_path = root / "state" / "sync_state.json"

    gcs = CloudStorageClient("" if args.skip_cloud else args.bucket)
    state = None
    if gcs.enabled:
        state = gcs.download_json("trcloud/state/sync_state.json")
    state = state or read_json(state_path) or init_state(rid)
    state["last_run_id"] = rid
    state["last_run_at"] = now_local().strftime("%Y-%m-%dT%H:%M:%S")

    cookie = get_cookie_for_company(
        company_id,
        origin_passkey=origin_passkey if use_switch else "",
        force=True,
    )

    manifest: dict[str, Any] = {
        "schema_version": 1,
        "run_id": rid,
        "mode": args.mode,
        "fetched_at": now_local().strftime("%Y-%m-%dT%H:%M:%S"),
        "date_from": date_from,
        "date_to": date_to,
        "company_id": company_id,
        "doc_types": docs,
        "outputs": {},
        "summary": {},
    }

    upload_paths: list[Path] = []
    for doc_type in docs:
        print(f"\n=== Sync {doc_type} {date_from} -> {date_to} ({args.mode}) ===")
        started = time.time()
        payload = fetch_payload(doc_type, date_from, date_to, cookie, company_id, passkey, args.sleep)
        changed = mark_changes(doc_type, payload, state, args.mode)

        latest_path = root / "snapshots" / doc_type.lower() / "latest.json"
        latest_existing = read_json(latest_path)
        latest_payload = merge_latest(latest_existing, payload, doc_type)

        run_snapshot = root / "snapshots" / doc_type.lower() / rid / "snapshot.json"
        changed_snapshot = root / "snapshots" / doc_type.lower() / rid / "changed.json"
        orders_ndjson = root / "normalized" / f"{doc_type.lower()}_orders.ndjson"
        lines_ndjson = root / "normalized" / f"{doc_type.lower()}_lines.ndjson"

        changed_doc_keys = {o["doc_key"] for o in changed}
        changed_payload = dict(payload)
        changed_payload["orders"] = changed
        changed_payload["lines"] = [ln for ln in payload.get("lines", []) if ln.get("doc_key") in changed_doc_keys]
        changed_payload = rebuild_payload_summary(changed_payload)

        write_json(run_snapshot, payload)
        write_json(changed_snapshot, changed_payload)
        write_json(latest_path, latest_payload)
        write_ndjson(orders_ndjson, latest_payload.get("orders", []))
        write_ndjson(lines_ndjson, latest_payload.get("lines", []))
        upload_paths += [run_snapshot, changed_snapshot, latest_path, orders_ndjson, lines_ndjson]

        manifest["outputs"][doc_type] = {
            "snapshot": relative_key(run_snapshot, output_dir),
            "changed": relative_key(changed_snapshot, output_dir),
            "latest": relative_key(latest_path, output_dir),
            "orders_ndjson": relative_key(orders_ndjson, output_dir),
            "lines_ndjson": relative_key(lines_ndjson, output_dir),
        }
        manifest["summary"][doc_type] = {
            "orders_scanned": payload.get("summary", {}).get("order_count", 0),
            "lines_scanned": payload.get("summary", {}).get("line_count", 0),
            "changed_orders": len(changed),
            "seconds": round(time.time() - started, 2),
        }
        print(
            f"{doc_type}: scanned {manifest['summary'][doc_type]['orders_scanned']} orders, "
            f"changed {len(changed)}, latest {latest_payload.get('summary', {}).get('order_count', 0)} orders"
        )

    write_json(state_path, state)
    manifest_path = root / "manifests" / rid / "manifest.json"
    latest_manifest_path = root / "manifests" / "latest.json"
    write_json(manifest_path, manifest)
    write_json(latest_manifest_path, manifest)
    upload_paths += [state_path, manifest_path, latest_manifest_path]

    if gcs.enabled:
        for path in upload_paths:
            uri = gcs.upload(path, output_dir)
            print(f"Uploaded {uri}")
        publish_reload_event(args.pubsub_topic, manifest)
    else:
        print("Cloud upload skipped. Set TRCLOUD_GCS_BUCKET/GCS_BUCKET and install google-cloud-storage to upload.")

    print("\nSync complete")
    print(json.dumps(manifest["summary"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
