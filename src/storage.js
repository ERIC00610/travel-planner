import { validateTrip } from "./model.js";

export const STORAGE_KEY = "travel-planner.trip.v1";
export const BACKUP_KEY = "travel-planner.trip.backup.v1";

/**
 * 從本機儲存載入旅程；無有效資料時使用公開預設值。
 * Load saved data, falling back to public defaults when needed.
 *
 * @param {Storage} storage
 * @param {object} fallback
 * @returns {{trip: object, source: string, error?: string}}
 */
export function loadTrip(storage, fallback) {
  try {
    const saved = storage.getItem(STORAGE_KEY);
    if (!saved) return { trip: structuredClone(fallback), source: "default" };

    const trip = JSON.parse(saved);
    const validation = validateTrip(trip);
    if (!validation.valid) {
      return {
        trip: structuredClone(fallback),
        source: "default",
        error: validation.errors.join("；")
      };
    }
    return { trip, source: "saved" };
  } catch (error) {
    return {
      trip: structuredClone(fallback),
      source: "default",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 保存旅程並在覆寫前保留一份上一版資料。
 * Save a trip and preserve the previous saved value for one-step undo.
 *
 * @param {Storage} storage
 * @param {object} trip
 * @param {object | null} [previousTrip=null] 修改前仍在記憶體中的版本
 * @returns {{ok: boolean, error?: string}}
 */
export function saveTrip(storage, trip, previousTrip = null) {
  const validation = validateTrip(trip);
  if (!validation.valid) return { ok: false, error: validation.errors.join("；") };

  if (previousTrip) {
    const previousValidation = validateTrip(previousTrip);
    if (!previousValidation.valid) {
      return { ok: false, error: previousValidation.errors.join("；") };
    }
  }

  try {
    const current = storage.getItem(STORAGE_KEY);
    const backup = current ?? (previousTrip ? JSON.stringify(previousTrip) : null);
    if (backup) storage.setItem(BACKUP_KEY, backup);
    storage.setItem(STORAGE_KEY, JSON.stringify(trip));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 復原最近一次成功儲存前的版本。
 * Restore the previous successfully saved version.
 *
 * @param {Storage} storage
 * @returns {{ok: boolean, error?: string}}
 */
export function undoLastSave(storage) {
  try {
    const backup = storage.getItem(BACKUP_KEY);
    if (!backup) return { ok: false, error: "沒有可復原的版本" };
    storage.setItem(STORAGE_KEY, backup);
    storage.removeItem(BACKUP_KEY);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 清除本機旅程與復原版本。
 * Clear saved and backup trip data.
 *
 * @param {Storage} storage
 */
export function clearSavedTrip(storage) {
  storage.removeItem(STORAGE_KEY);
  storage.removeItem(BACKUP_KEY);
}

/**
 * 產生可攜式 JSON 備份。
 * Serialize a portable JSON backup with metadata.
 *
 * @param {object} trip
 * @returns {string}
 */
export function serializeTrip(trip) {
  return JSON.stringify(
    {
      exportedBy: "Travel Planner",
      exportedAt: new Date().toISOString(),
      schemaVersion: trip.schemaVersion,
      trip
    },
    null,
    2
  );
}

/**
 * 解析並驗證匯入的 JSON，不直接寫入儲存空間。
 * Parse and validate imported JSON without mutating stored data.
 *
 * @param {string} text
 * @returns {{ok: boolean, trip?: object, error?: string}}
 */
export function parseImportedTrip(text) {
  try {
    const payload = JSON.parse(text);
    const trip = payload?.trip ?? payload;
    const validation = validateTrip(trip);
    if (!validation.valid) return { ok: false, error: validation.errors.join("；") };
    return { ok: true, trip: structuredClone(trip) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
