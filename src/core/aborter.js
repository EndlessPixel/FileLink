/**
 * 直接断开 TCP 连接（等效 nginx 444）：
 * 不写入任何状态行、响应头或响应体。
 */
export function abortConnection(req, res) {
  const socket = res?.socket ?? req?.socket;
  try {
    if (socket && !socket.destroyed) socket.destroy();
  } catch {
    // 忽略重复销毁
  }
}

export default abortConnection;
