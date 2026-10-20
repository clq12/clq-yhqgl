// Service Worker：后台检查到期优惠券并推送浏览器通知

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 小时

async function getDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('clq-yhqgl', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('coupons')) {
        db.createObjectStore('coupons', { keyPath: 'id' });
      }
    };
  });
}

async function listCouponsFromSW() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('coupons', 'readonly');
    const store = tx.objectStore('coupons');
    const req = store.getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result || []);
  });
}

function deadlineTimestamp(coupon) {
  const hour = coupon.endHour ?? 23;
  const minute = coupon.endMinute ?? 59;
  const beijing = new Date(`${coupon.endDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:59.000+08:00`);
  return beijing.getTime();
}

function remainingHours(coupon) {
  return Math.floor((deadlineTimestamp(coupon) - Date.now()) / (1000 * 60 * 60));
}

async function checkAndNotify() {
  const coupons = await listCouponsFromSW();
  const remindDays = [7, 3, 1];
  const reminders = [];
  for (const c of coupons) {
    if (c.isUsed) continue;
    const hours = remainingHours(c);
    for (const days of remindDays) {
      if (hours >= 0 && hours < days * 24 && !(c.remindedDays || []).includes(days)) {
        reminders.push({ coupon: c, days });
        break;
      }
    }
  }

  if (reminders.length > 0 && Notification.permission === 'granted') {
    const first = reminders[0].coupon;
    self.registration.showNotification('优惠券即将到期', {
      body: `有 ${reminders.length} 张优惠券即将到期，点击查看`,
      icon: '/vite.svg',
      data: { couponId: first.id },
    });
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  setInterval(checkAndNotify, CHECK_INTERVAL_MS);
  checkAndNotify();
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow(`/?couponId=${event.notification.data.couponId}`)
  );
});
