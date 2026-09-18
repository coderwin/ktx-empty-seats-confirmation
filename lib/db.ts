import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { User, Watch, WatchStatus } from "./types";
import { parseSlotIds, serializeSlotIds, slotsFromTimeRange, timeRangeFromSlots } from "./remainder";

const globalForDb = globalThis as unknown as { ktxDb?: Database.Database };

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      kakao_id TEXT UNIQUE NOT NULL,
      nickname TEXT NOT NULL DEFAULT '',
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS watches (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      dep_name TEXT NOT NULL,
      arr_name TEXT NOT NULL,
      dep_tago_id TEXT NOT NULL,
      arr_tago_id TEXT NOT NULL,
      korail_dep TEXT NOT NULL,
      korail_arr TEXT NOT NULL,
      date TEXT NOT NULL,
      time_start TEXT NOT NULL,
      time_end TEXT NOT NULL,
      train_type TEXT NOT NULL DEFAULT 'KTX',
      train_no TEXT,
      seat_class TEXT NOT NULL DEFAULT 'any',
      active INTEGER NOT NULL DEFAULT 1,
      last_checked_at INTEGER,
      last_status TEXT NOT NULL DEFAULT 'pending',
      last_summary TEXT,
      last_seat_available INTEGER NOT NULL DEFAULT 0,
      last_notified_at INTEGER,
      slot_ids TEXT NOT NULL DEFAULT '',
      last_slot_codes TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  const watchColumns = db.pragma("table_info(watches)") as { name: string }[];
  if (!watchColumns.some((column) => column.name === "train_no")) {
    db.exec("ALTER TABLE watches ADD COLUMN train_no TEXT");
  }
  if (!watchColumns.some((column) => column.name === "seat_class")) {
    db.exec("ALTER TABLE watches ADD COLUMN seat_class TEXT NOT NULL DEFAULT 'any'");
  }
  if (!watchColumns.some((column) => column.name === "slot_ids")) {
    db.exec("ALTER TABLE watches ADD COLUMN slot_ids TEXT NOT NULL DEFAULT ''");
  }
  if (!watchColumns.some((column) => column.name === "last_slot_codes")) {
    db.exec("ALTER TABLE watches ADD COLUMN last_slot_codes TEXT");
  }

  const missingSlots = db
    .prepare(`SELECT id, time_start, time_end FROM watches WHERE slot_ids IS NULL OR slot_ids = ''`)
    .all() as { id: number; time_start: string; time_end: string }[];
  const fillSlots = db.prepare(`UPDATE watches SET slot_ids = ?, time_start = ?, time_end = ? WHERE id = ?`);
  for (const row of missingSlots) {
    const ids = slotsFromTimeRange(row.time_start, row.time_end);
    const slotIds = serializeSlotIds(ids.length ? ids : ["2"]);
    const range = timeRangeFromSlots(slotIds.split(","));
    fillSlots.run(slotIds, range.timeStart, range.timeEnd, row.id);
  }
}

export function getDb() {
  if (globalForDb.ktxDb) return globalForDb.ktxDb;

  const dbPath = path.join(process.cwd(), "data", "app.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  globalForDb.ktxDb = db;
  return db;
}

type UserRow = {
  id: number;
  kakao_id: string;
  nickname: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: number | null;
};

type WatchRow = {
  id: number;
  user_id: number;
  dep_name: string;
  arr_name: string;
  dep_tago_id: string;
  arr_tago_id: string;
  korail_dep: string;
  korail_arr: string;
  date: string;
  time_start: string;
  time_end: string;
  train_type: string;
  train_no: string | null;
  seat_class: string | null;
  active: number;
  last_checked_at: number | null;
  last_status: WatchStatus;
  last_summary: string | null;
  last_seat_available: number;
  last_notified_at: number | null;
  slot_ids: string | null;
  last_slot_codes: string | null;
  created_at: number;
};

function parseSlotCodes(value: string | null) {
  if (!value) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(value) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    kakaoId: row.kakao_id,
    nickname: row.nickname,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: row.token_expires_at,
  };
}

function mapWatch(row: WatchRow): Watch {
  return {
    id: row.id,
    userId: row.user_id,
    depName: row.dep_name,
    arrName: row.arr_name,
    depTagoId: row.dep_tago_id,
    arrTagoId: row.arr_tago_id,
    korailDep: row.korail_dep,
    korailArr: row.korail_arr,
    date: row.date,
    timeStart: row.time_start,
    timeEnd: row.time_end,
    slotIds: parseSlotIds(row.slot_ids),
    trainType: row.train_type,
    active: row.active === 1,
    lastCheckedAt: row.last_checked_at,
    lastStatus: row.last_status,
    lastSummary: row.last_summary,
    lastSeatAvailable: row.last_seat_available === 1,
    lastSlotCodes: parseSlotCodes(row.last_slot_codes),
    lastNotifiedAt: row.last_notified_at,
    createdAt: row.created_at,
  };
}

export function getUserById(id: number) {
  const row = getDb()
    .prepare(
      `SELECT id, kakao_id, nickname, access_token, refresh_token, token_expires_at
       FROM users WHERE id = ?`,
    )
    .get(id) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function getUserByKakaoId(kakaoId: string) {
  const row = getDb()
    .prepare(
      `SELECT id, kakao_id, nickname, access_token, refresh_token, token_expires_at
       FROM users WHERE kakao_id = ?`,
    )
    .get(kakaoId) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function upsertKakaoUser(input: {
  kakaoId: string;
  nickname: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: number | null;
}) {
  const existing = getUserByKakaoId(input.kakaoId);
  const db = getDb();
  if (existing) {
    db.prepare(
      `UPDATE users
       SET nickname = ?, access_token = ?, refresh_token = COALESCE(?, refresh_token),
           token_expires_at = ?
       WHERE id = ?`,
    ).run(
      input.nickname,
      input.accessToken,
      input.refreshToken,
      input.tokenExpiresAt,
      existing.id,
    );
    return getUserById(existing.id)!;
  }

  const result = db
    .prepare(
      `INSERT INTO users (kakao_id, nickname, access_token, refresh_token, token_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.kakaoId,
      input.nickname,
      input.accessToken,
      input.refreshToken,
      input.tokenExpiresAt,
      Date.now(),
    );
  return getUserById(Number(result.lastInsertRowid))!;
}

export function updateUserTokens(
  userId: number,
  accessToken: string,
  refreshToken: string | null,
  tokenExpiresAt: number | null,
) {
  getDb()
    .prepare(
      `UPDATE users
       SET access_token = ?, refresh_token = COALESCE(?, refresh_token), token_expires_at = ?
       WHERE id = ?`,
    )
    .run(accessToken, refreshToken, tokenExpiresAt, userId);
}

export function createSession(userId: number, token: string, expiresAt: number) {
  getDb()
    .prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`)
    .run(token, userId, expiresAt);
}

export function getSessionUser(token: string) {
  const row = getDb()
    .prepare(
      `SELECT u.id, u.kakao_id, u.nickname, u.access_token, u.refresh_token, u.token_expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, Date.now()) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function deleteSession(token: string) {
  getDb().prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

export function countWatches(userId: number) {
  const row = getDb()
    .prepare(`SELECT COUNT(*) as count FROM watches WHERE user_id = ?`)
    .get(userId) as { count: number };
  return row.count;
}

export function listWatches(userId: number) {
  const rows = getDb()
    .prepare(
      `SELECT * FROM watches WHERE user_id = ? ORDER BY active DESC, date ASC, time_start ASC`,
    )
    .all(userId) as WatchRow[];
  return rows.map(mapWatch);
}

export function listActiveWatches() {
  const rows = getDb()
    .prepare(`SELECT * FROM watches WHERE active = 1 ORDER BY id ASC`)
    .all() as WatchRow[];
  return rows.map(mapWatch);
}

export function getWatch(id: number, userId?: number) {
  const row = userId
    ? (getDb()
        .prepare(`SELECT * FROM watches WHERE id = ? AND user_id = ?`)
        .get(id, userId) as WatchRow | undefined)
    : (getDb().prepare(`SELECT * FROM watches WHERE id = ?`).get(id) as WatchRow | undefined);
  return row ? mapWatch(row) : null;
}

export function insertWatch(input: {
  userId: number;
  depName: string;
  arrName: string;
  depTagoId: string;
  arrTagoId: string;
  korailDep: string;
  korailArr: string;
  date: string;
  slotIds: string[];
}) {
  const slotIds = serializeSlotIds(input.slotIds);
  const range = timeRangeFromSlots(slotIds.split(","));
  const result = getDb()
    .prepare(
      `INSERT INTO watches (
        user_id, dep_name, arr_name, dep_tago_id, arr_tago_id, korail_dep, korail_arr,
        date, time_start, time_end, train_type, train_no, seat_class, slot_ids, active, last_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'KTX', NULL, 'any', ?, 1, 'pending', ?)`,
    )
    .run(
      input.userId,
      input.depName,
      input.arrName,
      input.depTagoId,
      input.arrTagoId,
      input.korailDep,
      input.korailArr,
      input.date,
      range.timeStart,
      range.timeEnd,
      slotIds,
      Date.now(),
    );
  return getWatch(Number(result.lastInsertRowid))!;
}

export function updateWatch(
  id: number,
  userId: number,
  patch: { active?: boolean },
) {
  if (patch.active !== undefined) {
    getDb()
      .prepare(`UPDATE watches SET active = ? WHERE id = ? AND user_id = ?`)
      .run(patch.active ? 1 : 0, id, userId);
  }
  return getWatch(id, userId);
}

export function deleteWatch(id: number, userId: number) {
  const result = getDb()
    .prepare(`DELETE FROM watches WHERE id = ? AND user_id = ?`)
    .run(id, userId);
  return result.changes > 0;
}

export function saveWatchCheck(
  id: number,
  input: {
    lastCheckedAt: number;
    lastStatus: WatchStatus;
    lastSummary: string;
    lastSeatAvailable: boolean;
    lastSlotCodes?: Record<string, string>;
    lastNotifiedAt?: number | null;
    active?: boolean;
  },
) {
  getDb()
    .prepare(
      `UPDATE watches
       SET last_checked_at = ?, last_status = ?, last_summary = ?, last_seat_available = ?,
           last_slot_codes = COALESCE(?, last_slot_codes),
           last_notified_at = COALESCE(?, last_notified_at), active = COALESCE(?, active)
       WHERE id = ?`,
    )
    .run(
      input.lastCheckedAt,
      input.lastStatus,
      input.lastSummary,
      input.lastSeatAvailable ? 1 : 0,
      input.lastSlotCodes ? JSON.stringify(input.lastSlotCodes) : null,
      input.lastNotifiedAt ?? null,
      input.active === undefined ? null : input.active ? 1 : 0,
      id,
    );
}
