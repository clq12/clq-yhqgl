// Service Worker：后台检查到期优惠券并推送浏览器通知
//
// 注意：这里的库名必须和网页端保持一致（web/src/db/indexedDB.ts 里的 DB_NAME）。
// 之前这里写的是已废弃的 'clq-yhqgl'，结果 SW 读的是一个空库 —— 通知从来没触发过。

const DB_NAME = 'clq-yhqgl-v2';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 小时
const REMIND_DAYS = [7, 3, 1];

/**
 * 只在库已经存在时才打开。
 *
 * 库版本是 1，一旦 SW 抢在主线程之前把库建出来（空的、没有 object store），
 * 主线程再用同样的版本号 open 就不会触发 upgrade，只能走「删库重建」的兜底 —— 数据白丢一次。
 * 所以这里先探一下库存不存在，不存在就算了，等页面自己建。
 */
async function dbExists() {
  if (!indexedDB.databases) return true; // 老浏览器没有这个 API，只能乐观尝试
  const list = await indexedDB.databases();
  return list.some((d) => d.name === DB_NAME);
}

async function getDB() {
  if (!(await dbExists())) return null;
  return new Promise((resolve, reject) => {
    // 不指定版本号：拿到浏览器里已有的最新版本，避免和主线程的升级打架
    const req = indexedDB.open(DB_NAME);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

async function listCouponsFromSW() {
  const db = await getDB();
  // 库还没被主线程建立过：当作没有数据，不要抛错
  if (!db || !db.objectStoreNames.contains('coupons')) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction('coupons', 'readonly');
    const req = tx.objectStore('coupons').getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result || []);
  });
}

/** 把"已经提醒过"写回本地库，否则每小时都会重复弹同一条 */
async function markReminded(id, days) {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains('coupons')) return;
  return new Promise((resolve) => {
    const tx = db.transaction('coupons', 'readwrite');
    const store = tx.objectStore('coupons');
    const req = store.get(id);
    req.onsuccess = () => {
      const coupon = req.result;
      if (!coupon) return resolve();
      const reminded = Array.isArray(coupon.remindedDays) ? coupon.remindedDays : [];
      if (!reminded.includes(days)) reminded.push(days);
      store.put({ ...coupon, remindedDays: reminded, isReminded: true });
      resolve();
    };
    req.onerror = () => resolve();
  });
}

/** 本地设置（和主线程共用 'settings' store，主键是 schemaVersion=2） */
async function readSettingsFromSW() {
  const db = await getDB();
  if (!db || !db.objectStoreNames.contains('settings')) return null;
  return new Promise((resolve) => {
    const tx = db.transaction('settings', 'readonly');
    const req = tx.objectStore('settings').get(2);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

function deadlineTimestamp(coupon) {
  const hour = coupon.endHour ?? 23;
  const minute = coupon.endMinute ?? 59;
  const beijing = new Date(
    `${coupon.endDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:59.000+08:00`
  );
  return beijing.getTime();
}

function remainingHours(coupon) {
  return Math.floor((deadlineTimestamp(coupon) - Date.now()) / (1000 * 60 * 60));
}

async function checkAndNotify() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  // 用户在设置里关掉了提醒就彻底不弹；云端模式下本地可能没有设置，那就按默认开处理
  const settings = await readSettingsFromSW().catch(() => null);
  if (settings?.reminder?.enabled === false) return;

  // 用户可能把档位全取消（明确表示"别提醒"）——这时不能用默认值兜底，否则等于无视设置
  const configured = settings?.reminder?.remindDays;
  if (Array.isArray(configured) && configured.length === 0) return;
  const remindDays = Array.isArray(configured) && configured.length ? configured : REMIND_DAYS;

  const coupons = await listCouponsFromSW();
  const reminders = [];
  for (const c of coupons) {
    if (c.isUsed) continue;
    if (c.deletedAt) continue; // 软删除的不提醒
    const hours = remainingHours(c);
    if (hours < 0) continue;
    const already = Array.isArray(c.remindedDays) ? c.remindedDays : [];
    for (const days of remindDays) {
      if (hours < days * 24 && !already.includes(days)) {
        reminders.push({ coupon: c, days });
        break;
      }
    }
  }

  if (reminders.length === 0) return;

  const first = reminders[0].coupon;
  const body =
    reminders.length === 1
      ? `「${first.title}」还有 ${Math.max(0, remainingHours(first))} 小时到期`
      : `有 ${reminders.length} 张优惠券即将到期，点击查看`;

  await self.registration.showNotification('优惠券即将到期', {
    body,
    icon: '/vite.svg',
    badge: '/vite.svg',
    tag: 'coupon-expiry',
    data: { couponId: first.id },
  });

  for (const { coupon, days } of reminders) {
    await markReminded(coupon.id, days);
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  setInterval(() => {
    // SW 随时可能被浏览器休眠，这里失败不致命
    checkAndNotify().catch(() => {});
  }, CHECK_INTERVAL_MS);
  checkAndNotify().catch(() => {});
});

// 页面拿到通知权限后主动让 SW 立刻跑一次
self.addEventListener('message', (event) => {
  if (event.data === 'check-expiry') {
    event.waitUntil(checkAndNotify().catch(() => {}));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(`/?couponId=${event.notification.data.couponId}`));
});
