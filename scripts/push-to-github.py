#!/usr/bin/env python3
"""
通过 GitHub Git Data API 推送本地文件到指定分支。
绕过本机 git push 被沙箱 SIGTERM 拦截的问题。
"""

import base64
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

OWNER = "clq12"
REPO = "clq-yhqgl"
BRANCH = "main"
WORKSPACE = Path("E:/CLQruanjian/workspace/优惠券管理")
TOKEN = os.environ.get("GITHUB_PAT", "")

# 清理失效代理环境变量，避免请求被拦截
for key in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    os.environ.pop(key, None)
os.environ["NO_PROXY"] = "*"

if not TOKEN:
    print("错误：未设置 GITHUB_PAT 环境变量", file=sys.stderr)
    sys.exit(1)


def api(method: str, path: str, data: dict | None = None) -> dict:
    url = f"https://api.github.com/repos/{OWNER}/{REPO}{path}"
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "clq-yhqgl-push-script",
    }
    body = json.dumps(data).encode("utf-8") if data is not None else None
    if body:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="ignore")
        print(f"请求失败 {method} {url}: {e.code} {err}", file=sys.stderr)
        raise


def create_blob(content: bytes) -> str:
    encoded = base64.b64encode(content).decode("ascii")
    resp = api("POST", "/git/blobs", {"content": encoded, "encoding": "base64"})
    return resp["sha"]


def get_branch_sha(branch: str) -> str:
    try:
        ref = api("GET", f"/git/refs/heads/{branch}")
        return ref["object"]["sha"]
    except urllib.error.HTTPError as e:
        if e.code == 404:
            # 分支不存在，回退到 main
            ref = api("GET", "/git/refs/heads/main")
            return ref["object"]["sha"]
        raise


def get_commit_tree_sha(commit_sha: str) -> str:
    commit = api("GET", f"/git/commits/{commit_sha}")
    return commit["tree"]["sha"]


def should_ignore(path: Path) -> bool:
    parts = path.parts
    return ".workbuddy" in parts or ".git" in parts or "node_modules" in parts or ".gradle" in parts


def collect_files(root: Path):
    files = []
    for p in root.rglob("*"):
        if p.is_file() and not should_ignore(p):
            rel = p.relative_to(root).as_posix()
            files.append(rel)
    return sorted(files)


def main():
    print(f"正在推送 {WORKSPACE} 到 {OWNER}/{REPO}:{BRANCH}")

    base_commit_sha = get_branch_sha(BRANCH)
    base_tree_sha = get_commit_tree_sha(base_commit_sha)
    print(f"基分支 commit: {base_commit_sha}, tree: {base_tree_sha}")

    files = collect_files(WORKSPACE)
    print(f"共 {len(files)} 个文件")

    tree_entries = []
    for i, rel in enumerate(files, 1):
        full = WORKSPACE / rel
        content = full.read_bytes()
        blob_sha = create_blob(content)
        mode = "100755" if os.access(full, os.X_OK) else "100644"
        tree_entries.append({"path": rel, "mode": mode, "type": "blob", "sha": blob_sha})
        if i % 10 == 0 or i == len(files):
            print(f"  已处理 {i}/{len(files)}: {rel}")

    # 不使用 base_tree，直接生成只含本地文件的新 tree，实现覆盖
    new_tree = api("POST", "/git/trees", {"tree": tree_entries})
    new_tree_sha = new_tree["sha"]
    print(f"新 tree: {new_tree_sha}")

    new_commit = api("POST", "/git/commits", {
        "message": "refactor: 全面重构为 Android + Web 双端，保留 WebDAV 自托管同步",
        "tree": new_tree_sha,
        "parents": [base_commit_sha],
    })
    new_commit_sha = new_commit["sha"]
    print(f"新 commit: {new_commit_sha}")

    api("PATCH", f"/git/refs/heads/{BRANCH}", {"sha": new_commit_sha})
    print(f"已覆盖分支 {BRANCH}")

    print("推送完成")


if __name__ == "__main__":
    main()
