# -*- coding: utf-8 -*-
"""
TRCloud Auto-Login
==================
ล็อกอิน TRCloud อัตโนมัติด้วย username/password (พอร์ตมาจาก vite.config.js)
แล้วคืน cookie header `trcloud=<deviceId>; PHPSESSID=<sessionId>` สำหรับใช้ยิง API

วิธีล็อกอิน (เหมือนหน้า login จริง):
  1) GET  /application/login/                 → ขอ PHPSESSID ใหม่
  2) POST /application/login/login_engine.php → ส่ง json={username,password,cookie:<deviceId>,remember}

deviceId คือค่า cookie `trcloud` ของเครื่องที่ TRCloud "อนุมัติแล้ว"
ห้ามเปลี่ยนถ้าไม่จำเป็น (ถ้าเครื่องยังไม่อนุมัติจะ login ไม่ผ่าน)
"""

import sys
import json
import requests

# บังคับ console ให้เป็น UTF-8 (กัน UnicodeEncodeError จากภาษาไทย/emoji บน Windows cp1252)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

# ============================================================
# ⚙️  ข้อมูลล็อกอิน — แก้ตรงนี้ได้เลย (ใส่ค่าตรงๆ ไม่ใช้ env)
# ============================================================
TRCLOUD_USERNAME  = "don"
TRCLOUD_PASSWORD  = "dw12345"
# device id = ค่า cookie `trcloud` ของเครื่องที่ได้รับอนุมัติแล้ว
TRCLOUD_DEVICE_ID = "0e218c475357ad43e7bcc689924d3ce6"
# ============================================================

BASE_URL = "https://thaidrill.trcloud.co"
_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"

# cache cookie ที่ login แล้ว เพื่อไม่ให้ login ซ้ำหลายรอบในโปรเซสเดียว
_CACHED_COOKIE = None


def trcloud_login(username: str = TRCLOUD_USERNAME,
                  password: str = TRCLOUD_PASSWORD,
                  device_id: str = TRCLOUD_DEVICE_ID) -> str:
    """ล็อกอิน TRCloud แล้วคืน cookie header `trcloud=<deviceId>; PHPSESSID=<sessionId>`"""
    if not username or not password:
        raise ValueError("ต้องมี TRCLOUD_USERNAME และ TRCLOUD_PASSWORD")
    if not device_id:
        raise ValueError("ต้องมี device id (ค่า trcloud) ของเครื่องที่ได้รับอนุญาต")

    # 1) ขอ PHPSESSID ใหม่จากหน้า login
    page = requests.get(
        f"{BASE_URL}/application/login/",
        headers={"User-Agent": _USER_AGENT},
        timeout=30,
    )
    session_id = page.cookies.get("PHPSESSID")
    if not session_id:
        raise RuntimeError("Login failed: ไม่ได้รับ PHPSESSID จากหน้า login")

    cookie_header = f"trcloud={device_id}; PHPSESSID={session_id}"

    # 2) ยืนยันตัวตนผ่าน login_engine.php
    post_data = {
        "json": json.dumps({
            "username": username,
            "password": password,
            "cookie": device_id,
            "remember": "false",
        })
    }
    res = requests.post(
        f"{BASE_URL}/application/login/login_engine.php",
        data=post_data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": _USER_AGENT,
            "Origin": BASE_URL,
            "Referer": f"{BASE_URL}/application/login/",
            "Cookie": cookie_header,
        },
        timeout=30,
    )

    try:
        data = res.json()
    except Exception:
        raise RuntimeError(f"Login failed: ตอบกลับไม่ใช่ JSON ({res.text[:120]})")

    if not data.get("success"):
        msg = data.get("message")
        reason = {
            "wrong": "ชื่อผู้ใช้หรือรหัสผ่านผิด",
            "block": "เครื่องนี้ถูกบล็อก",
            "wait":  f"เครื่องนี้ยังไม่ได้รับอนุมัติ (device id: {device_id})",
        }.get(msg, msg or "unknown")
        raise RuntimeError(f"Login failed: {reason}")

    # ดัก cookie ที่ login_engine.php คืนมา (u, h1, h2) — จำเป็นสำหรับบาง company
    extra = []
    for key in ("u", "h1", "h2"):
        val = res.cookies.get(key)
        if val:
            extra.append(f"{key}={val}")
    if extra:
        cookie_header = cookie_header + "; " + "; ".join(extra)

    print(f"✅ TRCloud Login สำเร็จ: {data.get('message')}")
    return cookie_header


def get_cookie(force: bool = False) -> str:
    """คืน cookie ที่ login แล้ว (cache ไว้ใช้ซ้ำทั้งโปรเซส). force=True เพื่อ login ใหม่"""
    global _CACHED_COOKIE
    if _CACHED_COOKIE and not force:
        return _CACHED_COOKIE
    _CACHED_COOKIE = trcloud_login()
    return _CACHED_COOKIE


# cache แยกต่างหากต่อ company เพื่อไม่ให้ทับกัน
_COMPANY_COOKIE_CACHE: dict = {}


def get_cookie_for_company(target_company_id: str,
                           origin_passkey: str = "",
                           force: bool = False) -> str:
    """
    Login แล้ว switch session ไปบริษัทที่ต้องการ
    ใช้สำหรับ module ที่อยู่คนละ 'ห้อง' กับ default company

    target_company_id : company_id ของบริษัทปลายทาง
    origin_passkey    : passkey ของบริษัทต้นทาง (ที่ login เข้ามาอยู่ก่อน)
    """
    global _COMPANY_COOKIE_CACHE
    if not force and target_company_id in _COMPANY_COOKIE_CACHE:
        return _COMPANY_COOKIE_CACHE[target_company_id]

    s = requests.Session()
    s.headers.update({"User-Agent": _USER_AGENT})

    # 1) GET login page → PHPSESSID
    s.get(f"{BASE_URL}/application/login/", timeout=30)
    session_id = s.cookies.get("PHPSESSID")
    if not session_id:
        raise RuntimeError("Login failed: ไม่ได้รับ PHPSESSID")

    # 2) POST login
    res = s.post(
        f"{BASE_URL}/application/login/login_engine.php",
        data={"json": json.dumps({
            "username": TRCLOUD_USERNAME,
            "password": TRCLOUD_PASSWORD,
            "cookie":   TRCLOUD_DEVICE_ID,
            "remember": "false",
        })},
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
            "Origin": BASE_URL,
            "Referer": f"{BASE_URL}/application/login/",
        },
        timeout=30,
    )
    data = res.json()
    if not data.get("success"):
        raise RuntimeError(f"Login failed: {data.get('message')}")

    # 3) Switch session ไปบริษัทปลายทาง
    sw = s.post(
        f"{BASE_URL}/application/company-list/api/engine-manage/change_company_engine.php",
        data={"json": json.dumps({
            "company_id": target_company_id,
            "passkey":    origin_passkey,
        })},
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
            "Origin": BASE_URL,
            "Referer": f"{BASE_URL}/application/company-list/",
        },
        timeout=30,
    )
    sw_data = sw.json()
    if not sw_data.get("success"):
        raise RuntimeError(f"Company switch failed: {sw_data.get('message')}")

    cookie_header = f"trcloud={TRCLOUD_DEVICE_ID}; PHPSESSID={session_id}"
    print(f"✅ TRCloud Login+Switch สำเร็จ (company_id={target_company_id})")

    _COMPANY_COOKIE_CACHE[target_company_id] = cookie_header
    return cookie_header


if __name__ == "__main__":
    print(get_cookie())
