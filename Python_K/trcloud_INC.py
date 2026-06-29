# -*- coding: utf-8 -*-
"""
TRCloud INC — รับสินค้าเข้าคลังโดยดึงเอกสาร PO (Cargo / Goods Receipt from PO)
=============================================================================
INC = การรับสินค้าเข้าคลังโดยดึงเอกสาร PO มารับ  (sidebar: "รับสินค้าจาก PO")
      อยู่ในโมดูล ordermgmt_po → cargo (engine-cargo)  — ยืนยันสดจากหน้าเว็บ
List   : /application/ordermgmt_po/api/engine-cargo/cargo_search_keyword.php  (form-encoded)
Detail : /application/ordermgmt_po/api/engine-cargo/show_detail.php → {head, detail, ...} (json-wrap)
id     : document_id   |   อ้างอิง PO ผ่าน field reference_id / item.po_item_id
"""

import os

from trcloud_auth import get_cookie_for_company
from trcloud_commonK import DocConfig, run_cli

# ============================================================
# ⚙️  ตั้งค่าหลัก
# ============================================================
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_API_DATA = os.path.join(_SCRIPT_DIR, "..", "WH_K", "warehouse-app", "apps", "api", "data")
DATA_DIR = os.path.join(_SCRIPT_DIR, "data")
DEFAULT_OUTPUT = os.path.join(_API_DATA, "inc.json")

DATE_FROM = "2026-01-01"
DATE_TO   = "2026-12-31"

COMPANY_ID = "14"
PASSKEY    = os.getenv("TRCLOUD_PASSKEY", "")
_ORIGIN_PASSKEY = os.getenv("TRCLOUD_ORIGIN_PASSKEY", "")
# ============================================================

INC_CONFIG = DocConfig(
    name="INC",
    list_path="/application/ordermgmt_po/api/engine-cargo/cargo_search_keyword.php",
    detail_path="/application/ordermgmt_po/api/engine-cargo/show_detail.php",
    id_field="document_id",
    referer="/application/ordermgmt_po/cargo.php",
    list_encoding="form",   # cargo list = form-urlencoded
)


if __name__ == "__main__":
    cookie = get_cookie_for_company(COMPANY_ID, origin_passkey=_ORIGIN_PASSKEY)
    run_cli(INC_CONFIG, COMPANY_ID, PASSKEY, cookie, DEFAULT_OUTPUT, DATE_FROM, DATE_TO)
