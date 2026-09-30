let listeners = [];
export function toast(msg, type = 'info') {
  listeners.forEach((fn) => fn(msg, type));
}
export function subscribeToast(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((f) => f !== fn);
  };
}
