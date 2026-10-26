/**
 * 浏览器端轻量 WebDAV 客户端 —— 仅用于【手动备份 / 恢复】。
 *
 * ⚠️ 注意：本客户端不再参与任何「自动同步」。
 * v3 架构下设备间同步的唯一通道是 WorkBuddy 云端数据库（见 src/db/appDb.ts），
 * WebDAV 已降级为可选的「一键手动备份」出口（把本地数据导出到用户自己的 WebDAV 网盘）。
 * 目标 WebDAV 服务需要支持 CORS，否则需要反向代理。
 */

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  rootPath: string;
}

function authHeader(username: string, password: string): string {
  return 'Basic ' + btoa(`${username}:${password}`);
}

export class WebDAVClient {
  constructor(private config: WebDAVConfig) {}

  private url(path: string): string {
    const base = this.config.url.replace(/\/$/, '');
    const root = this.config.rootPath.replace(/^\//, '').replace(/\/$/, '');
    const p = path.replace(/^\//, '');
    return `${base}/${root}/${p}`;
  }

  private headers(): HeadersInit {
    return {
      Authorization: authHeader(this.config.username, this.config.password),
    };
  }

  async exists(path: string): Promise<boolean> {
    const res = await fetch(this.url(path), {
      method: 'PROPFIND',
      headers: { ...this.headers(), Depth: '0' },
    });
    return res.ok;
  }

  async mkcol(path: string): Promise<boolean> {
    const res = await fetch(this.url(path), {
      method: 'MKCOL',
      headers: this.headers(),
    });
    return res.ok || res.status === 405;
  }

  async get(path: string): Promise<string | null> {
    const res = await fetch(this.url(path), {
      method: 'GET',
      headers: this.headers(),
    });
    if (!res.ok) return null;
    return res.text();
  }

  async put(path: string, content: string): Promise<boolean> {
    const res = await fetch(this.url(path), {
      method: 'PUT',
      headers: {
        ...this.headers(),
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: content,
    });
    return res.ok;
  }

  /**
   * 列出目录下的 .json 文件（用于恢复时在 backups/ 里挑最新一份）。
   * 基于 PROPFIND Depth:1，解析 XML 中的 <href>，只返回文件名。
   */
  async listDir(path: string): Promise<string[]> {
    const res = await fetch(this.url(path), {
      method: 'PROPFIND',
      headers: { ...this.headers(), Depth: '1' },
    });
    if (!res.ok) return [];
    const text = await res.text();
    let names: string[] = [];
    try {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      const responses = Array.from(doc.getElementsByTagName('response'));
      for (const r of responses) {
        const hrefEl = r.getElementsByTagName('href')[0];
        if (!hrefEl || !hrefEl.textContent) continue;
        const href = hrefEl.textContent;
        if (href.endsWith('/')) continue; // 跳过目录自身
        const idx = href.lastIndexOf('/');
        const name = idx >= 0 ? href.slice(idx + 1) : href;
        if (name.endsWith('.json')) names.push(name);
      }
    } catch {
      names = [];
    }
    return names.sort();
  }
}
