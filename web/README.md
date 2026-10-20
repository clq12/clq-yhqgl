# 电脑网页端

## 技术栈

- React + TypeScript + Vite
- Tailwind CSS
- IndexedDB（`idb` 封装）
- Service Worker（后台检查与浏览器通知）

## 模块结构

```
web/src/
├── main.tsx              # 入口
├── App.tsx               # 根组件
├── types/                # 类型定义（与 shared/schemas 一致）
├── rules/                # 业务规则函数
├── db/                   # IndexedDB 封装
├── sync/                 # WebDAV 客户端 + 同步引擎
├── ai/                   # 可插拔 AI Provider
├── components/           # UI 组件
└── hooks/                # 自定义 Hooks
```

## 同步入口

- 手动同步：设置页 / 列表刷新按钮
- 自动同步：页面可见时、每 15 分钟
- 入口：`syncEngine.sync()`

## 提醒入口

- Service Worker 每小时检查一次到期优惠券。
- 使用 `Notification API` 弹出浏览器通知。
- 网页端提醒作为安卓通知的补充。

## 大屏布局

- 左侧：优惠券列表（可搜索、筛选）
- 右侧：详情 / 编辑 / 统计面板
- 顶部：工具栏（同步状态、AI 助手、设置）

## AI 入口

- 顶部工具栏「AI 助手」按钮。
- 对话框输入自然语言，展示变更预览后确认执行。
