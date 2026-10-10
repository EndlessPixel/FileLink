/** 短码长度（16 位十六进制字符） */
export const CODE_LENGTH = 16;

/** 短码格式：16 位小写十六进制 */
export const CODE_REGEX = /^[0-9a-f]{16}$/;

/** 短码生成使用的字符集 */
export const CODE_ALPHABET = '0123456789abcdef';

/** 管理后台路径后缀前缀与字符集（如 admin-a3x7k9） */
export const ADMIN_PATH_PREFIX = 'admin-';
export const ADMIN_PATH_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export const ADMIN_PATH_SUFFIX_LENGTH = 6;

/** 管理员密码字符集与长度 */
export const ADMIN_PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ADMIN_PASSWORD_LENGTH = 16;

/** 会话 cookie 名 */
export const SESSION_COOKIE = 'fl_session';

/** 验证码答案 cookie 名 */
export const CAPTCHA_COOKIE = 'fl_captcha';

/** 下载流读取块大小（字节），保证低速限流下不死锁 */
export const STREAM_CHUNK_SIZE = 16 * 1024;

/** 令牌桶补充间隔（毫秒） */
export const THROTTLE_TICK_MS = 100;

/** 默认监听端口 */
export const DEFAULT_PORT = 3000;

/** 默认监听地址（0.0.0.0 表示所有网卡，反向代理场景可设为 127.0.0.1） */
export const DEFAULT_HOST = '0.0.0.0';

/** 默认数据库路径（相对项目根目录） */
export const DEFAULT_DB_PATH = 'data/filelink.db';

/** 运维任务间隔：每小时 */
export const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * 默认配置项（写入 config 表，可在后台修改并即时生效）。
 * 值为字符串，读取时按类型解析。
 */
export const DEFAULT_CONFIG = {
  max_speed_bps: '1000000',
  max_concurrent_downloads: '16',
  api_rate_limit_per_min: '30',
  session_ttl_seconds: '43200',
  login_max_failures: '3',
  login_ban_seconds: '300',
};

/** 数值型配置项集合（读取时转 number） */
export const NUMERIC_CONFIG_KEYS = new Set(Object.keys(DEFAULT_CONFIG));
