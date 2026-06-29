import os
# -*- coding: utf-8 -*-
"""
TRCloud GR — ใบรับสินค้า (Goods Receive)
========================================
List   : /application/ics/api/engine-receive/search_receive.php
Detail : /application/ics/api/engine-receive/retrieve_receive.php → {head, body, gl, ...}
id     : receive_id   |   title: "GR"   |   create_by: "goods_receive"
(ยืนยันจาก reverse-engineering ใน K_Wscr_info.txt)
"""

from trcloud_auth import get_cookie_for_company
from trcloud_common import DocConfig, run_cli

# ============================================================
# ⚙️  ตั้งค่าหลัก
# ============================================================
DATE_FROM = "2023-01-01"
DATE_TO   = "2026-12-31"

COMPANY_ID = "14"
PASSKEY    = os.getenv("TRCLOUD_PASSKEY", "")
_ORIGIN_PASSKEY = os.getenv("TRCLOUD_ORIGIN_PASSKEY", "")

OUTPUT_DIR = r"D:\Users\jacki\OneDrive\Desktop\MWM1"
# ============================================================

GR_CONFIG = DocConfig(
    name="GR",
    list_path="/application/ics/api/engine-receive/search_receive.php",
    detail_path="/application/ics/api/engine-receive/retrieve_receive.php",
    id_field="receive_id",
    referer="/application/ics/receive.php",
)


if __name__ == "__main__":
    cookie = get_cookie_for_company(COMPANY_ID, origin_passkey=_ORIGIN_PASSKEY)
    run_cli(GR_CONFIG, COMPANY_ID, PASSKEY, cookie, OUTPUT_DIR, DATE_FROM, DATE_TO)
