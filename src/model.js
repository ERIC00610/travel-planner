const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_STATUSES = new Set(["confirmed", "unbooked", "flexible", "cancelled"]);

/**
 * 檢查外部連結是否為安全的 HTTPS 網址。
 * Validate that an external link is empty or uses HTTPS.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isSafeExternalUrl(value) {
  if (value === "" || value === null || value === undefined) return true;
  if (typeof value !== "string") return false;

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 驗證旅程資料是否符合第一版公開格式。
 * Validate a trip object against the version-one public schema.
 *
 * @param {unknown} trip
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateTrip(trip) {
  const errors = [];
  if (!trip || typeof trip !== "object" || Array.isArray(trip)) {
    return { valid: false, errors: ["trip must be an object"] };
  }

  for (const field of ["title", "startDate", "endDate", "updatedAt"]) {
    if (typeof trip[field] !== "string" || trip[field].trim() === "") {
      errors.push(field + " is required");
    }
  }

  if (trip.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!ISO_DATE_PATTERN.test(trip.startDate ?? "")) errors.push("startDate must use YYYY-MM-DD");
  if (!ISO_DATE_PATTERN.test(trip.endDate ?? "")) errors.push("endDate must use YYYY-MM-DD");
  if (!Array.isArray(trip.regions)) errors.push("regions must be an array");
  if (!Array.isArray(trip.days)) errors.push("days must be an array");
  if (!Array.isArray(trip.tasks)) errors.push("tasks must be an array");

  if (Array.isArray(trip.days)) {
    trip.days.forEach((day, index) => validateDay(day, index, errors));
  }

  return { valid: errors.length === 0, errors };
}

function validateDay(day, index, errors) {
  const prefix = "days[" + index + "]";
  if (!day || typeof day !== "object" || Array.isArray(day)) {
    errors.push(prefix + " must be an object");
    return;
  }

  for (const field of ["id", "date", "country", "city", "region", "title", "status"]) {
    if (typeof day[field] !== "string" || day[field].trim() === "") {
      errors.push(prefix + "." + field + " is required");
    }
  }

  if (!ISO_DATE_PATTERN.test(day.date ?? "")) errors.push(prefix + ".date must use YYYY-MM-DD");
  if (!ALLOWED_STATUSES.has(day.status)) errors.push(prefix + ".status is invalid");

  for (const field of ["timeline", "transport", "tickets", "reminders", "alternatives"]) {
    if (!Array.isArray(day[field])) errors.push(prefix + "." + field + " must be an array");
  }

  const links = [
    ...(Array.isArray(day.timeline) ? day.timeline.map((item) => item?.link) : []),
    ...(Array.isArray(day.transport) ? day.transport.map((item) => item?.link) : []),
    ...(Array.isArray(day.tickets) ? day.tickets.map((item) => item?.link) : []),
    day.lodging?.link
  ];

  links.forEach((link) => {
    if (!isSafeExternalUrl(link)) errors.push(prefix + " contains an unsafe external link");
  });
}

/**
 * 依日期及識別碼排序每日行程。
 * Sort itinerary days by ISO date and stable identifier.
 *
 * @param {Array<object>} days
 * @returns {Array<object>}
 */
export function sortDays(days) {
  return [...days].sort(
    (left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id)
  );
}

/**
 * 新增一天並回傳新的旅程物件。
 * Add a day without mutating the source trip.
 *
 * @param {object} trip
 * @param {object} day
 * @returns {object}
 */
export function addDay(trip, day) {
  return touch({ ...trip, days: sortDays([...trip.days, structuredClone(day)]) });
}

/**
 * 更新指定日期資料。
 * Update a day by identifier without mutating the source trip.
 *
 * @param {object} trip
 * @param {string} dayId
 * @param {object} changes
 * @returns {object}
 */
export function updateDay(trip, dayId, changes) {
  const days = trip.days.map((day) =>
    day.id === dayId ? { ...structuredClone(day), ...structuredClone(changes), id: day.id } : day
  );
  return touch({ ...trip, days: sortDays(days) });
}

/**
 * 刪除指定日期。
 * Delete a day by identifier.
 *
 * @param {object} trip
 * @param {string} dayId
 * @returns {object}
 */
export function deleteDay(trip, dayId) {
  return touch({ ...trip, days: trip.days.filter((day) => day.id !== dayId) });
}

/**
 * 複製指定日期成彈性安排。
 * Duplicate a day as a flexible draft.
 *
 * @param {object} trip
 * @param {string} dayId
 * @param {string} newId
 * @returns {object}
 */
export function duplicateDay(trip, dayId, newId) {
  const source = trip.days.find((day) => day.id === dayId);
  if (!source) return trip;

  const copy = {
    ...structuredClone(source),
    id: newId,
    title: source.title + "（副本）",
    status: "flexible"
  };
  return addDay(trip, copy);
}

/**
 * 依區域篩選每日行程。
 * Filter days by a region label.
 *
 * @param {Array<object>} days
 * @param {string} region
 * @returns {Array<object>}
 */
export function filterDays(days, region) {
  const selected = region === "全部" ? days : days.filter((day) => day.region === region);
  return sortDays(selected);
}

/**
 * 彙整所有住宿資料。
 * Aggregate lodging entries with their itinerary context.
 *
 * @param {object} trip
 * @returns {Array<object>}
 */
export function aggregateLodging(trip) {
  return sortDays(trip.days)
    .filter((day) => day.lodging?.name)
    .map((day) => ({
      dayId: day.id,
      date: day.date,
      city: day.city,
      ...structuredClone(day.lodging)
    }));
}

/**
 * 彙整交通與門票資料。
 * Aggregate transport and tickets with date and city context.
 *
 * @param {object} trip
 * @returns {{transport: Array<object>, tickets: Array<object>}}
 */
export function aggregateTransportAndTickets(trip) {
  const transport = [];
  const tickets = [];

  sortDays(trip.days).forEach((day) => {
    const context = { dayId: day.id, date: day.date, city: day.city };
    day.transport.forEach((item) => transport.push({ ...context, ...structuredClone(item) }));
    day.tickets.forEach((item) => tickets.push({ ...context, ...structuredClone(item) }));
  });

  return { transport, tickets };
}

/**
 * 彙整明確待辦與尚未預約項目。
 * Aggregate explicit tasks and unbooked transport or ticket items.
 *
 * @param {object} trip
 * @returns {Array<object>}
 */
export function aggregateTasks(trip) {
  const tasks = structuredClone(trip.tasks);
  const { transport, tickets } = aggregateTransportAndTickets(trip);

  [...transport, ...tickets]
    .filter((item) => item.status === "unbooked")
    .forEach((item) => {
      tasks.push({
        id: "derived-" + item.dayId + "-" + item.id,
        label: "預約：" + item.label,
        done: false,
        region: item.city,
        derived: true
      });
    });

  return tasks;
}

function touch(trip) {
  return { ...trip, updatedAt: new Date().toISOString() };
}
