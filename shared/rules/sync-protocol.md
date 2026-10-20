# WebDAV 同步协议 v2

## 1. 文件布局

WebDAV 服务器上的路径：

```
{rootPath}/           # 默认 /yhqgl/v2
  data.json           # 合并后的全量优惠券数据
  sync.json           # 同步元数据
  backups/
    data-{timestamp}.json
```

## 2. 数据结构

### data.json

```json
{
  "schemaVersion": 2,
  "coupons": [ /* Coupon[] */ ],
  "deletedIds": [ /* 被删除的 id 列表，用于同步识别删除 */ ]
}
```

### sync.json

```json
{
  "schemaVersion": 2,
  "deviceId": "android-abc123",
  "deviceName": "小米手机",
  "vectorClock": { "android-abc123": 5, "web-desktop-xyz": 3 },
  "lastSyncAt": "2026-10-20T13:16:37+08:00",
  "pendingChanges": 0,
  "conflictCount": 0
}
```

## 3. 向量时钟规则

- 每个设备 `deviceId` 一个单调递增计数器。
- 本地产生任何写操作（增删改）时，当前设备计数器 +1，并写入该条记录的 `version`。
- 记录 `version` 只保存产生该记录最后修改的设备计数器快照：
  ```json
  { "deviceId": "android-abc123", "counter": 5 }
  ```
- 合并时比较两记录的 `version`：
  - 若 A.deviceId == B.deviceId，counter 大者新。
  - 若 deviceId 不同，需用全局 `vectorClock` 判断因果关系。

## 4. 同步流程

```
1. 读取远程 sync.json -> remoteSync
2. 读取远程 data.json -> remoteData
3. 读取本地数据库 -> localData
4. 读取本地 sync.json 缓存 -> localSync
5. 对 remoteData.coupons ∪ localData 中每条记录执行 merge()
6. 合并 remoteData.deletedIds 与本地删除记录
7. 生成 mergedData、mergedSync
8. 上传 data.json、sync.json（带乐观锁检查）
9. 写回本地数据库与本地 sync 缓存
```

## 5. 合并策略

### 5.1 单条记录合并

| 本地 | 远程 | 动作 |
|------|------|------|
| 无 | 有 | 拉取 |
| 有 | 无 | 若本地未删除则上传；若本地已删除，上传删除标记 |
| 有 | 有 | 比较 version/vectorClock |

### 5.2 版本比较

- `isAncestor(a, b)`：a 的 vectorClock 每一项都 <= b 对应项。
- `isConcurrent(a, b)`：互不为祖先。
- 若一方是另一方祖先 → 取后代。
- 若并发 → 字段级合并。

### 5.3 字段级合并（并发冲突）

对每条并发的 Coupon：

1. 基础字段（id、createdAt）不变。
2. 对每个可变字段：
   - 若本地与远程值相同 → 取该值。
   - 若不同 → 取 `modifiedAt` 较新的一方。
   - 若 `modifiedAt` 相同 → 按 deviceId 字典序稳定选择一方。
3. 合并后的 `version` 取两边 vectorClock 的逐设备最大值，并给当前设备 counter +1。
4. 标记为冲突，写入 `conflictCount`，等待用户审查（可选）。

### 5.4 删除处理

- 本地删除：记录 `localDeletedAt` 和 version，不上传整条记录，只把 id 加入 `deletedIds`。
- 远程 `deletedIds` 包含某 id：
  - 若本地版本更旧 → 删除本地。
  - 若本地版本更新（本地在同步前刚修改）→ 保留本地并重新上传（删除 vs 修改的冲突，修改胜）。

## 6. 乐观锁

上传前：

1. 读取远程 `sync.json` 的 `lastSyncAt` 或 ETag。
2. 若与本次同步开始时不同，说明其他设备已写入，回到步骤 1 重新合并。
3. 最大重试 3 次，超过则标记同步失败，下次再试。

## 7. 离线编辑

- 本地修改立即写本地数据库，不阻塞 UI。
- 标记 `pendingChanges++`。
- 网络恢复/定时任务触发同步。
- 同步成功后 `pendingChanges = 0`。

## 8. 首次迁移（v1 → v2）

1. 读取旧路径 `/coupons/data.json`。
2. 为每条记录生成初始 version：当前设备 counter = 1。
3. 写入新路径 `/yhqgl/v2/data.json` 和 `/yhqgl/v2/sync.json`。
4. 旧路径保留，不再写入。
