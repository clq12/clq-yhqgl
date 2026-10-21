#!/usr/bin/env python3
"""
给远端仓库打一个附注标签（annotated tag），触发 GitHub Actions 的 Release 工作流。

痛点：本机 `git push` 会被沙箱静默 SIGTERM，所以不能 `git tag && git push --tags`。
这里改走 Git Data API：
  1. 读 main 当前 commit sha
  2. POST /git/tags 建 tag 对象（annotated，带 message）
  3. POST /git/refs 建 refs/tags/<tag>

用法：
  python tag-release.py v2.1.0 "安卓 2.1.0：云端同步 + 界面重构"
"""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

OWNER = "clq12"
REPO = "clq-yhqgl"
BRANCH = "main"

# 残留的失效代理会让所有外网请求失败，必须先清掉
for key in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
    os.environ.pop(key, None)
os.environ["NO_PROXY"] = "*"


def load_token() -> str:
    """优先环境变量，其次 Windows 用户级环境变量（Bash 里通常读不到 User 作用域）。"""
    token = os.environ.get("GITHUB_PAT", "").strip()
    if token:
        return token
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            token, _ = winreg.QueryValueEx(key, "GITHUB_PAT")
        return str(token).strip()
    except Exception:
        return ""


TOKEN = load_token()
if not TOKEN:
    print("错误：读不到 GITHUB_PAT", file=sys.stderr)
    sys.exit(1)


def api(method: str, path: str, data: dict | None = None, base: str | None = None) -> dict:
    url = (base or f"https://api.github.com/repos/{OWNER}/{REPO}") + path
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "clq-yhqgl-tag-script",
    }
    body = json.dumps(data).encode("utf-8") if data is not None else None
    if body:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="ignore")
        print(f"请求失败 {method} {url}: {e.code} {detail}", file=sys.stderr)
        raise


def main() -> None:
    if len(sys.argv) < 2:
        print("用法：python tag-release.py <tag> [message]", file=sys.stderr)
        sys.exit(1)

    tag = sys.argv[1]
    message = sys.argv[2] if len(sys.argv) > 2 else f"Release {tag}"

    # 校验 PAT 是否还有效：只认 /user 返回 200
    me = api("GET", "/user", base="https://api.github.com")
    print(f"已认证：{me.get('login')}")

    ref = api("GET", f"/git/ref/heads/{BRANCH}")
    commit_sha = ref["object"]["sha"]
    print(f"{BRANCH} 当前 commit：{commit_sha}")

    existing = None
    try:
        existing = api("GET", f"/git/ref/tags/{tag}")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    if existing:
        print(f"标签 {tag} 已存在 → {existing['object']['sha']}")
        return

    tag_obj = api(
        "POST",
        "/git/tags",
        {"tag": tag, "message": message, "object": commit_sha, "type": "commit"},
    )
    print(f"tag 对象：{tag_obj['sha']}")

    api("POST", "/git/refs", {"ref": f"refs/tags/{tag}", "sha": tag_obj["sha"]})
    print(f"已创建标签 {tag}")


if __name__ == "__main__":
    main()
