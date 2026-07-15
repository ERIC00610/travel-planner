import test from "node:test";
import assert from "node:assert/strict";

import * as persistence from "../src/storage.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const fallback = {
  schemaVersion: 1,
  title: "公開行程",
  startDate: "2026-07-20",
  endDate: "2026-09-05",
  updatedAt: "2026-07-15T00:00:00.000Z",
  regions: [],
  days: [],
  tasks: []
};

test("uses defaults on first load and saved data on later loads", () => {
  const storage = new MemoryStorage();
  assert.equal(persistence.loadTrip(storage, fallback).trip.title, "公開行程");

  const edited = { ...fallback, title: "我的行程" };
  persistence.saveTrip(storage, edited);

  assert.equal(persistence.loadTrip(storage, fallback).trip.title, "我的行程");
});

test("backs up the previous saved value and can undo one save", () => {
  const storage = new MemoryStorage();
  persistence.saveTrip(storage, { ...fallback, title: "第一版" });
  persistence.saveTrip(storage, { ...fallback, title: "第二版" });

  const result = persistence.undoLastSave(storage);

  assert.equal(result.ok, true);
  assert.equal(persistence.loadTrip(storage, fallback).trip.title, "第一版");
});

test("backs up the in-memory default before the first saved edit", () => {
  const storage = new MemoryStorage();
  const edited = { ...fallback, title: "第一次修改" };

  persistence.saveTrip(storage, edited, fallback);
  const result = persistence.undoLastSave(storage);

  assert.equal(result.ok, true);
  assert.equal(persistence.loadTrip(storage, fallback).trip.title, "公開行程");
});

test("reports storage failures instead of claiming success", () => {
  const storage = new MemoryStorage();
  storage.setItem = () => {
    throw new Error("quota exceeded");
  };

  const result = persistence.saveTrip(storage, fallback);

  assert.equal(result.ok, false);
  assert.match(result.error, /quota exceeded/);
});

test("clears saved and backup data", () => {
  const storage = new MemoryStorage();
  persistence.saveTrip(storage, fallback);

  persistence.clearSavedTrip(storage);

  assert.equal(storage.values.size, 0);
});

test("serializes export metadata and imports valid JSON", () => {
  const json = persistence.serializeTrip(fallback);
  const imported = persistence.parseImportedTrip(json);

  assert.equal(JSON.parse(json).exportedBy, "Travel Planner");
  assert.equal(imported.ok, true);
  assert.equal(imported.trip.title, "公開行程");
});

test("rejects malformed or incompatible imports", () => {
  const malformed = persistence.parseImportedTrip("{not json");
  const incompatible = persistence.parseImportedTrip(
    JSON.stringify({ exportedBy: "Travel Planner", trip: { ...fallback, schemaVersion: 9 } })
  );

  assert.equal(malformed.ok, false);
  assert.equal(incompatible.ok, false);
  assert.equal(incompatible.trip, undefined);
});
