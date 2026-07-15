import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import * as model from "../src/model.js";

const validTrip = {
  schemaVersion: 1,
  title: "2026 環球旅行",
  startDate: "2026-07-20",
  endDate: "2026-09-05",
  updatedAt: "2026-07-15T00:00:00.000Z",
  regions: ["日本"],
  days: [
    {
      id: "day-2026-07-20",
      date: "2026-07-20",
      country: "日本",
      city: "知床",
      region: "日本",
      title: "抵達知床",
      status: "confirmed",
      timeline: [],
      lodging: null,
      transport: [],
      tickets: [],
      reminders: [],
      alternatives: []
    }
  ],
  tasks: []
};

test("accepts a valid trip schema", () => {
  assert.equal(model.validateTrip(validTrip).valid, true);
});

test("rejects missing required trip fields", () => {
  const invalid = structuredClone(validTrip);
  delete invalid.title;

  const result = model.validateTrip(invalid);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("title")));
});

test("rejects non-ISO itinerary dates", () => {
  const invalid = structuredClone(validTrip);
  invalid.days[0].date = "07/20/2026";

  assert.equal(model.validateTrip(invalid).valid, false);
});

test("accepts only empty or HTTPS external links", () => {
  assert.equal(model.isSafeExternalUrl(""), true);
  assert.equal(model.isSafeExternalUrl("https://maps.google.com/example"), true);
  assert.equal(model.isSafeExternalUrl("http://example.com"), false);
  assert.equal(model.isSafeExternalUrl("javascript:alert(1)"), false);
});

test("adds days without mutating the original and sorts them chronologically", () => {
  const trip = structuredClone(validTrip);
  const added = {
    ...structuredClone(trip.days[0]),
    id: "day-2026-07-19",
    date: "2026-07-19",
    title: "前一日"
  };

  const next = model.addDay(trip, added);

  assert.equal(trip.days.length, 1);
  assert.deepEqual(next.days.map((day) => day.id), ["day-2026-07-19", "day-2026-07-20"]);
});

test("updates and deletes a day by id", () => {
  const updated = model.updateDay(validTrip, "day-2026-07-20", { city: "宇登呂" });
  const deleted = model.deleteDay(updated, "day-2026-07-20");

  assert.equal(updated.days[0].city, "宇登呂");
  assert.equal(validTrip.days[0].city, "知床");
  assert.equal(deleted.days.length, 0);
});

test("duplicates a day with a new id and flexible status", () => {
  const next = model.duplicateDay(validTrip, "day-2026-07-20", "day-copy");

  assert.equal(next.days.length, 2);
  assert.equal(next.days[1].id, "day-copy");
  assert.equal(next.days[1].status, "flexible");
  assert.match(next.days[1].title, /副本/);
});

test("filters itinerary days by region", () => {
  assert.equal(model.filterDays(validTrip.days, "全部").length, 1);
  assert.equal(model.filterDays(validTrip.days, "日本").length, 1);
  assert.equal(model.filterDays(validTrip.days, "歐洲").length, 0);
});

test("aggregates lodging from daily itinerary data", () => {
  const trip = structuredClone(validTrip);
  trip.days[0].lodging = { name: "知床第一飯店", status: "confirmed", link: "" };

  const lodging = model.aggregateLodging(trip);

  assert.deepEqual(lodging[0], {
    dayId: "day-2026-07-20",
    date: "2026-07-20",
    city: "知床",
    name: "知床第一飯店",
    status: "confirmed",
    link: ""
  });
});

test("aggregates transport and tickets with their day context", () => {
  const trip = structuredClone(validTrip);
  trip.days[0].transport.push({ id: "rail-1", label: "女滿別機場取車", status: "confirmed", link: "" });
  trip.days[0].tickets.push({ id: "ticket-1", label: "知床導覽", status: "confirmed", link: "" });

  const result = model.aggregateTransportAndTickets(trip);

  assert.equal(result.transport[0].date, "2026-07-20");
  assert.equal(result.tickets[0].dayId, "day-2026-07-20");
});

test("aggregates explicit tasks and unbooked itinerary items", () => {
  const trip = structuredClone(validTrip);
  trip.tasks.push({ id: "task-1", label: "申請 ESTA", done: false, region: "美國" });
  trip.days[0].tickets.push({ id: "ticket-2", label: "賞鯨船", status: "unbooked", link: "" });

  const tasks = model.aggregateTasks(trip);

  assert.deepEqual(tasks.map((task) => task.label), ["申請 ESTA", "預約：賞鯨船"]);
});

test("public seed covers the full trip and validates", async () => {
  const text = await readFile(new URL("../data/default-trip.json", import.meta.url), "utf8");
  const trip = JSON.parse(text);

  assert.equal(model.validateTrip(trip).valid, true);
  assert.equal(trip.days[0].date, "2026-07-20");
  assert.equal(trip.days.at(-1).date, "2026-09-05");
  assert.ok(trip.days.length >= 45);
  assert.equal(JSON.stringify(trip).includes("bookingNumber"), false);
});
