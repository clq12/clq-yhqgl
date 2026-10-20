# clq-yhqgl 重构项目

本仓库是 [clq-yhqgl](https://github.com/clq12/clq-yhqgl) 的双端重构工程：

- `android/`：安卓原生 App（Kotlin + Jetpack Compose）
- `web/`：电脑网页端（React + TypeScript + Vite）
- `shared/`：双端共享的数据模型、JSON Schema、业务规则、同步协议
- `docs/`：重构分析与实施计划

## 核心设计

- **数据自主**：WebDAV 作为自托管同步中枢，无需第三方后端。
- **离线优先**：安卓 Room、网页 IndexedDB，本地先写后同步。
- **版本向量同步**：解决多端并发写冲突，支持字段级合并。
- **状态栏提醒**：安卓 WorkManager + Notification；网页 Service Worker + 浏览器通知。
- **可插拔 AI**：默认 Agnes，预留其他 OpenAI 兼容 Provider。

## 在线使用

- **网页端**：https://clq12.github.io/clq-yhqgl
- **安卓 APK**：在 [Releases](https://github.com/clq12/clq-yhqgl/releases) 页面下载最新 APK

## 快速开始

### 安卓

```bash
cd android
# 使用 Android Studio 打开，或命令行：
./gradlew assembleDebug
```

发布 release 时会自动打包 APK 并上传到 Release 附件。

### 网页

```bash
cd web
npm install
npm run dev
```

push 到 `main` 分支会自动部署到 GitHub Pages。

## 文档

- [重构分析与分阶段计划](./docs/REFACTOR_ANALYSIS.md)
- [优惠券业务规则](./shared/rules/coupon-rules.md)
- [WebDAV 同步协议](./shared/rules/sync-protocol.md)
