import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL } from './schema.js';
import logger from '../utils/logger.js';

let db = null;

/**
 * 打开数据库并建表（幂等）。
 * @param {string} filePath SQLite 文件路径
 */
export function initDb(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
  db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA_SQL);
  logger.info(`database ready at ${filePath}`);
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database has not been initialized');
  return db;
}

/** 便捷查询：返回全部行 */
export function all(sql, ...params) {
  return getDb().prepare(sql).all(...params);
}

/** 便捷查询：返回单行 */
export function get(sql, ...params) {
  return getDb().prepare(sql).get(...params);
}

/** 便捷写入：返回 { changes, lastInsertRowid } */
export function run(sql, ...params) {
  return getDb().prepare(sql).run(...params);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
