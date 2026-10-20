const EVENT_NAME = 'yhqgl:data-changed';

/** 任意位置写入数据后调用，通知列表等订阅方重新拉取 */
export function notifyDataChanged() {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function onDataChanged(handler: () => void) {
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
