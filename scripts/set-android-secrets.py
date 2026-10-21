#!/usr/bin/env python3
"""
把安卓发布签名材料写进 GitHub 仓库 Secrets，供 CI 签出可直接安装的 release APK。

为什么需要：`assembleRelease` 不做签名动作时产出的是 `app-release-unsigned.apk`，
Android 直接拒绝安装（INSTALL_PARSE_FAILED_NO_CERTIFICATES）。CI 里没有签名材料，
所以之前每个 tag 产出的 release 包其实都是废文件。

Secrets（用 PyNaCl sealed box 按仓库公钥加密后 PUT）：
  ANDROID_KEYSTORE_B64    keystore 文件的 base64
  ANDROID_STORE_PASSWORD
  ANDROID_KEY_ALIAS
  ANDROID_KEY_PASSWORD

keystore 与密码都不进仓库，只存在于本机 + GitHub Secrets。
"""

import base64
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

from nacl import encoding, public

OWNER = "clq12"
REPO = "clq-yhqgl"
KEYSTORE = Path(r"C:/Users/Administrator/.yhqgl-keystore/yhqgl-release.jks")

for key in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
    os.environ.pop(key, None)
os.environ["NO_PROXY"] = "*"


def load_token() -> str:
    token = os.environ.get("GITHUB_PAT", "").strip()
    if token:
        return token
    import winreg

    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
        value, _ = winreg.QueryValueEx(key, "GITHUB_PAT")
    return str(value).strip()


TOKEN = load_token()
API = f"https://api.github.com/repos/{OWNER}/{REPO}"


def api(method: str, path: str, data: dict | None = None, base: str = API) -> dict:
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "clq-yhqgl-secret-script",
    }
    body = json.dumps(data).encode("utf-8") if data is not None else None
    if body:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request((base or API) + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        print(f"失败 {method} {path}: {e.code} {e.read().decode('utf-8', 'ignore')}", file=sys.stderr)
        raise


def seal(public_key: str, secret_value: str) -> str:
    pk = public.PublicKey(public_key.encode("utf-8"), encoding.Base64Encoder())
    sealed = public.SealedBox(pk).encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(sealed).decode("utf-8")


def main() -> None:
    if not KEYSTORE.exists():
        print(f"找不到 keystore：{KEYSTORE}", file=sys.stderr)
        sys.exit(1)

    me = api("GET", "/user", base="https://api.github.com")
    print(f"已认证：{me.get('login')}")

    pk_info = api("GET", "/actions/secrets/public-key")
    public_key, key_id = pk_info["key"], pk_info["key_id"]

    payload = {
        "ANDROID_KEYSTORE_B64": base64.b64encode(KEYSTORE.read_bytes()).decode("ascii"),
        "ANDROID_STORE_PASSWORD": "yhqgl2026",
        "ANDROID_KEY_ALIAS": "yhqgl",
        "ANDROID_KEY_PASSWORD": "yhqgl2026",
    }

    for name, value in payload.items():
        api(
            "PUT",
            f"/actions/secrets/{name}",
            {"encrypted_value": seal(public_key, value), "key_id": key_id},
        )
        print(f"已写入 secret：{name}")

    existing = api("GET", "/actions/secrets")
    names = sorted(s["name"] for s in existing.get("secrets", []))
    print("仓库现有 secrets：", ", ".join(names))


if __name__ == "__main__":
    main()
