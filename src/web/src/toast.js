import { reactive } from 'vue';

export const toasts = reactive([]);

let sequence = 0;

export function pushToast(message, type = 'info') {
  const id = (sequence += 1);
  toasts.push({ id, message, type });
  setTimeout(() => dismissToast(id), 3400);
  return id;
}

export function dismissToast(id) {
  const index = toasts.findIndex((item) => item.id === id);
  if (index !== -1) toasts.splice(index, 1);
}

export const toast = {
  info: (message) => pushToast(message, 'info'),
  success: (message) => pushToast(message, 'success'),
  error: (message) => pushToast(message, 'error'),
};

export default toast;
