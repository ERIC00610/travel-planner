import {
  addDay,
  aggregateLodging,
  aggregateTasks,
  aggregateTransportAndTickets,
  deleteDay,
  duplicateDay,
  filterDays,
  sortDays,
  updateDay,
  validateTrip
} from "./model.js";
import {
  clearSavedTrip,
  loadTrip,
  parseImportedTrip,
  saveTrip,
  serializeTrip,
  undoLastSave
} from "./storage.js";

const STATUS_LABELS = {
  confirmed: "已確認",
  unbooked: "尚未預約",
  flexible: "彈性安排",
  cancelled: "取消"
};

const state = {
  defaults: null,
  trip: null,
  region: "全部",
  view: "itinerary",
  bookingKind: "transport"
};

const elements = {
  title: document.querySelector("#trip-title"),
  meta: document.querySelector("#trip-meta"),
  filters: document.querySelector("#region-filters"),
  timeline: document.querySelector("#timeline"),
  lodging: document.querySelector("#lodging-list"),
  bookingList: document.querySelector("#booking-list"),
  tasks: document.querySelector("#task-list"),
  taskProgress: document.querySelector("#task-progress"),
  dialog: document.querySelector("#day-editor"),
  form: document.querySelector("#day-form"),
  formError: document.querySelector("#form-error"),
  toast: document.querySelector("#toast"),
  fileInput: document.querySelector("#import-file"),
  addButton: document.querySelector("#add-day")
};

let toastTimer;

init();

/**
 * 載入公開資料與本機修改並啟動介面。
 * Load public defaults and local edits, then initialize the UI.
 */
async function init() {
  bindStaticEvents();

  try {
    const response = await fetch("./data/default-trip.json");
    if (!response.ok) throw new Error("無法載入公開行程資料");
    const defaults = await response.json();
    const validation = validateTrip(defaults);
    if (!validation.valid) throw new Error(validation.errors.join("；"));

    state.defaults = defaults;
    const loaded = loadTrip(window.localStorage, defaults);
    state.trip = loaded.trip;
    renderAll();
    if (loaded.error) showToast("本機資料無效，已改用公開行程");
  } catch (error) {
    elements.timeline.innerHTML = emptyState(
      "載入失敗",
      error instanceof Error ? error.message : String(error)
    );
  }
}

function bindStaticEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.target));
  });

  document.querySelectorAll("[data-booking-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      state.bookingKind = button.dataset.bookingKind;
      document.querySelectorAll("[data-booking-kind]").forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-selected", String(active));
      });
      renderBookings();
    });
  });

  elements.timeline.addEventListener("click", handleTimelineAction);
  elements.tasks.addEventListener("change", handleTaskToggle);
  elements.form.addEventListener("submit", handleFormSubmit);
  elements.addButton.addEventListener("click", () => openEditor());
  document.querySelector("#close-editor").addEventListener("click", closeEditor);
  document.querySelector("#cancel-editor").addEventListener("click", closeEditor);
  document.querySelector("#jump-today").addEventListener("click", jumpToToday);
  document.querySelector("#quick-export").addEventListener("click", exportData);
  document.querySelector("#export-data").addEventListener("click", exportData);
  document.querySelector("#import-data").addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", importData);
  document.querySelector("#undo-save").addEventListener("click", undoSave);
  document.querySelector("#restore-defaults").addEventListener("click", restoreDefaults);
}

function renderAll() {
  if (!state.trip) return;
  elements.title.textContent = state.trip.title;
  const dayCount = dateDifference(state.trip.startDate, state.trip.endDate) + 1;
  elements.meta.textContent =
    formatDateRange(state.trip.startDate, state.trip.endDate) + "・" + dayCount + " 天";
  renderFilters();
  renderTimeline();
  renderLodging();
  renderBookings();
  renderTasks();
}

function renderFilters() {
  const regions = ["全部", ...state.trip.regions];
  elements.filters.innerHTML = regions
    .map(
      (region) =>
        '<button class="filter-chip ' +
        (region === state.region ? "is-active" : "") +
        '" type="button" data-region="' +
        escapeHtml(region) +
        '">' +
        escapeHtml(region) +
        "</button>"
    )
    .join("");

  elements.filters.querySelectorAll("[data-region]").forEach((button) => {
    button.addEventListener("click", () => {
      state.region = button.dataset.region;
      renderFilters();
      renderTimeline();
    });
  });
}

function renderTimeline() {
  const days = filterDays(state.trip.days, state.region);
  elements.timeline.innerHTML = days.length
    ? days.map(renderDayCard).join("")
    : emptyState("沒有符合的行程", "請切換區域，或新增一天行程。");
}

function renderDayCard(day) {
  const timeline = day.timeline.length
    ? '<div class="detail-group"><h4>時間軸</h4><ol class="schedule-list">' +
      day.timeline.map(renderScheduleItem).join("") +
      "</ol></div>"
    : "";
  const lodging = day.lodging?.name
    ? renderDetailGroup("住宿", [renderLinkedItem(day.lodging.name, day.lodging.link, day.lodging.privateNote)])
    : "";
  const transport = renderItemGroup("交通", day.transport);
  const tickets = renderItemGroup("門票", day.tickets);
  const reminders = renderTextGroup("提醒", day.reminders);
  const alternatives = renderTextGroup("備案", day.alternatives);

  return (
    '<details class="day-card" id="' +
    escapeHtml(day.id) +
    '">' +
    '<summary class="day-summary">' +
    '<div class="date-row"><span class="date-label">' +
    escapeHtml(formatDay(day.date)) +
    '</span><span class="status-badge ' +
    escapeHtml(day.status) +
    '">' +
    escapeHtml(STATUS_LABELS[day.status] ?? day.status) +
    "</span></div>" +
    '<h3 class="day-title">' +
    escapeHtml(day.title) +
    "</h3>" +
    '<p class="day-place">' +
    escapeHtml(day.country + "・" + day.city) +
    "</p></summary>" +
    '<div class="day-details">' +
    timeline +
    lodging +
    transport +
    tickets +
    reminders +
    alternatives +
    '<div class="card-actions">' +
    '<button class="text-button" type="button" data-action="edit" data-id="' +
    escapeHtml(day.id) +
    '">編輯</button>' +
    '<button class="text-button" type="button" data-action="duplicate" data-id="' +
    escapeHtml(day.id) +
    '">複製</button>' +
    '<button class="text-button danger" type="button" data-action="delete" data-id="' +
    escapeHtml(day.id) +
    '">刪除</button>' +
    "</div></div></details>"
  );
}

function renderScheduleItem(item) {
  const note = [item.location, item.note].filter(Boolean).join("・");
  return (
    '<li class="schedule-item"><span class="schedule-time">' +
    escapeHtml(item.time || "彈性") +
    '</span><div><strong>' +
    escapeHtml(item.label) +
    "</strong>" +
    (note ? "<p>" + escapeHtml(note) + "</p>" : "") +
    renderLink(item.link) +
    "</div></li>"
  );
}

function renderItemGroup(title, items) {
  if (!items?.length) return "";
  return renderDetailGroup(
    title,
    items.map((item) =>
      renderLinkedItem(
        item.label + "・" + (STATUS_LABELS[item.status] ?? item.status),
        item.link,
        item.note
      )
    )
  );
}

function renderTextGroup(title, items) {
  if (!items?.length) return "";
  return renderDetailGroup(
    title,
    items.map((item) => "<p>" + escapeHtml(item) + "</p>")
  );
}

function renderDetailGroup(title, rows) {
  return '<div class="detail-group"><h4>' + escapeHtml(title) + "</h4>" + rows.join("") + "</div>";
}

function renderLinkedItem(label, link, note = "") {
  return (
    "<div><strong>" +
    escapeHtml(label) +
    "</strong>" +
    (note ? "<p>" + escapeHtml(note) + "</p>" : "") +
    renderLink(link) +
    "</div>"
  );
}

function renderLink(link) {
  if (!link) return "";
  return (
    '<a class="detail-link" href="' +
    escapeHtml(link) +
    '" target="_blank" rel="noopener noreferrer">開啟連結 ↗</a>'
  );
}

function renderLodging() {
  const entries = aggregateLodging(state.trip);
  elements.lodging.innerHTML = entries.length
    ? entries
        .map(
          (entry) =>
            '<article class="collection-item"><p class="item-date">' +
            escapeHtml(formatDay(entry.date) + "・" + entry.city) +
            '</p><div class="item-row"><div><h3>' +
            escapeHtml(entry.name) +
            "</h3><p>" +
            escapeHtml(
              [entry.address, entry.bookingNumber && "訂位：" + entry.bookingNumber, entry.price]
                .filter(Boolean)
                .join("・") || "未加入私人住宿資料"
            ) +
            "</p></div><span class=\"status-badge " +
            escapeHtml(entry.status) +
            '">' +
            escapeHtml(STATUS_LABELS[entry.status] ?? entry.status) +
            "</span></div>" +
            renderLink(entry.link) +
            "</article>"
        )
        .join("")
    : emptyState("尚無住宿資料", "請從每日行程新增住宿。");
}

function renderBookings() {
  const grouped = aggregateTransportAndTickets(state.trip);
  const entries = grouped[state.bookingKind];
  elements.bookingList.innerHTML = entries.length
    ? entries
        .map(
          (entry) =>
            '<article class="collection-item"><p class="item-date">' +
            escapeHtml(formatDay(entry.date) + "・" + entry.city) +
            '</p><div class="item-row"><h3>' +
            escapeHtml(entry.label) +
            '</h3><span class="status-badge ' +
            escapeHtml(entry.status) +
            '">' +
            escapeHtml(STATUS_LABELS[entry.status] ?? entry.status) +
            "</span></div>" +
            renderLink(entry.link) +
            "</article>"
        )
        .join("")
    : emptyState("目前沒有項目", "請從每日行程新增資料。");
}

function renderTasks() {
  const tasks = aggregateTasks(state.trip);
  const done = tasks.filter((task) => task.done).length;
  elements.taskProgress.textContent = "已完成 " + done + "／" + tasks.length;
  elements.tasks.innerHTML = tasks.length
    ? tasks
        .map(
          (task) =>
            '<article class="task-item ' +
            (task.done ? "is-done" : "") +
            '"><input type="checkbox" id="' +
            escapeHtml(task.id) +
            '" data-task-id="' +
            escapeHtml(task.id) +
            '"' +
            (task.done ? " checked" : "") +
            (task.derived ? " disabled" : "") +
            '><label for="' +
            escapeHtml(task.id) +
            '">' +
            escapeHtml(task.label) +
            '<span class="task-region">' +
            escapeHtml(task.region ?? "全部") +
            (task.derived ? "・由尚未預約項目產生" : "") +
            "</span></label></article>"
        )
        .join("")
    : emptyState("所有待辦均已清除", "目前沒有尚待處理的項目。");
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll(".view").forEach((section) => {
    const active = section.dataset.view === view;
    section.hidden = !active;
    section.classList.toggle("is-active", active);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active = button.dataset.target === view;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  elements.addButton.hidden = view !== "itinerary";
  document.querySelector(".view.is-active h2")?.focus?.();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function handleTimelineAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const dayId = button.dataset.id;
  const day = state.trip.days.find((candidate) => candidate.id === dayId);
  if (!day) return;

  if (button.dataset.action === "edit") openEditor(day);
  if (button.dataset.action === "duplicate") {
    const next = duplicateDay(state.trip, dayId, makeId("day-copy"));
    persistAndRender(next, "已建立彈性副本");
  }
  if (button.dataset.action === "delete" && window.confirm("確定刪除這一天的行程？")) {
    persistAndRender(deleteDay(state.trip, dayId), "已刪除行程");
  }
}

function handleTaskToggle(event) {
  const checkbox = event.target.closest("[data-task-id]");
  if (!checkbox) return;
  const tasks = state.trip.tasks.map((task) =>
    task.id === checkbox.dataset.taskId ? { ...task, done: checkbox.checked } : task
  );
  persistAndRender(
    { ...state.trip, tasks, updatedAt: new Date().toISOString() },
    checkbox.checked ? "已完成待辦" : "已重新開啟待辦"
  );
}

function openEditor(day = null) {
  elements.form.reset();
  elements.formError.textContent = "";
  document.querySelector("#editor-title").textContent = day ? "編輯行程" : "新增行程";

  const values = day ?? {
    id: "",
    date: state.trip.endDate,
    region: state.region === "全部" ? state.trip.regions[0] : state.region,
    country: "",
    city: "",
    title: "",
    status: "flexible",
    timeline: [],
    lodging: null,
    transport: [],
    tickets: [],
    reminders: [],
    alternatives: []
  };

  setValue("day-id", values.id);
  setValue("day-date", values.date);
  setValue("day-region", values.region);
  setValue("day-country", values.country);
  setValue("day-city", values.city);
  setValue("day-title", values.title);
  setValue("day-status", values.status);
  setValue("day-timeline", formatTimeline(values.timeline));
  setValue("lodging-name", values.lodging?.name);
  setValue("lodging-status", values.lodging?.status ?? "confirmed");
  setValue("lodging-link", values.lodging?.link);
  setValue("lodging-address", values.lodging?.address);
  setValue("lodging-price", values.lodging?.price);
  setValue("lodging-booking", values.lodging?.bookingNumber);
  setValue("lodging-note", values.lodging?.privateNote);
  setValue("day-transport", formatBookingLines(values.transport));
  setValue("day-tickets", formatBookingLines(values.tickets));
  setValue("day-reminders", values.reminders.join("\n"));
  setValue("day-alternatives", values.alternatives.join("\n"));

  elements.dialog.showModal();
  requestAnimationFrame(() => document.querySelector("#day-date").focus());
}

function closeEditor() {
  elements.dialog.close();
}

function handleFormSubmit(event) {
  event.preventDefault();
  const data = new FormData(elements.form);
  const existingId = String(data.get("id") ?? "");
  const lodgingName = clean(data.get("lodgingName"));
  const day = {
    id: existingId || makeId("day"),
    date: clean(data.get("date")),
    region: clean(data.get("region")),
    country: clean(data.get("country")),
    city: clean(data.get("city")),
    title: clean(data.get("title")),
    status: clean(data.get("status")),
    timeline: parseTimeline(clean(data.get("timeline"))),
    lodging: lodgingName
      ? {
          name: lodgingName,
          status: clean(data.get("lodgingStatus")),
          link: clean(data.get("lodgingLink")),
          address: clean(data.get("lodgingAddress")),
          price: clean(data.get("lodgingPrice")),
          bookingNumber: clean(data.get("lodgingBooking")),
          privateNote: clean(data.get("lodgingNote"))
        }
      : null,
    transport: parseBookingLines(clean(data.get("transport")), "transport"),
    tickets: parseBookingLines(clean(data.get("tickets")), "ticket"),
    reminders: parseSimpleLines(clean(data.get("reminders"))),
    alternatives: parseSimpleLines(clean(data.get("alternatives")))
  };

  const candidate = existingId ? updateDay(state.trip, existingId, day) : addDay(state.trip, day);
  const validation = validateTrip(candidate);
  if (!validation.valid) {
    elements.formError.textContent = validation.errors[0];
    return;
  }

  const saved = persistAndRender(candidate, existingId ? "行程已更新" : "行程已新增");
  if (saved) closeEditor();
}

function parseTimeline(text) {
  return parseSimpleLines(text).map((line, index) => {
    const [time = "", label = "", location = "", note = ""] = line.split("|").map((part) => part.trim());
    return { id: makeId("timeline-" + index), time, label, location, link: "", note, done: false };
  });
}

function parseBookingLines(text, prefix) {
  return parseSimpleLines(text).map((line, index) => {
    const [label = "", status = "unbooked", link = ""] = line.split("|").map((part) => part.trim());
    return { id: makeId(prefix + "-" + index), label, status: STATUS_LABELS[status] ? status : "unbooked", link };
  });
}

function parseSimpleLines(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatTimeline(items) {
  return items
    .map((item) => [item.time, item.label, item.location, item.note].map((value) => value ?? "").join(" | "))
    .join("\n");
}

function formatBookingLines(items) {
  return items
    .map((item) => [item.label, item.status, item.link].map((value) => value ?? "").join(" | "))
    .join("\n");
}

function persistAndRender(nextTrip, message) {
  const result = saveTrip(window.localStorage, nextTrip, state.trip);
  if (!result.ok) {
    showToast("儲存失敗：" + result.error);
    return false;
  }
  state.trip = nextTrip;
  renderAll();
  showToast(message);
  return true;
}

function exportData() {
  if (!state.trip) return;
  if (!window.confirm("匯出檔會包含你在此裝置加入的私人資料，確定下載？")) return;

  const blob = new Blob([serializeTrip(state.trip)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "travel-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("備份檔已下載");
}

async function importData(event) {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;

  const parsed = parseImportedTrip(await file.text());
  if (!parsed.ok) {
    showToast("匯入失敗：" + parsed.error);
    return;
  }
  if (!window.confirm("匯入會取代目前本機資料，確定繼續？")) return;
  persistAndRender(parsed.trip, "備份已匯入");
}

function undoSave() {
  const result = undoLastSave(window.localStorage);
  if (!result.ok) {
    showToast(result.error);
    return;
  }
  state.trip = loadTrip(window.localStorage, state.defaults).trip;
  renderAll();
  showToast("已復原上次修改");
}

function restoreDefaults() {
  if (!window.confirm("確定清除所有本機修改並恢復公開初始行程？此動作無法復原。")) return;
  clearSavedTrip(window.localStorage);
  state.trip = structuredClone(state.defaults);
  renderAll();
  showToast("已恢復初始行程");
}

function jumpToToday() {
  const today = new Date().toISOString().slice(0, 10);
  const day = state.trip.days.find((candidate) => candidate.date === today);
  if (!day) {
    showToast("今天不在這趟旅程日期內");
    return;
  }
  state.region = "全部";
  renderFilters();
  renderTimeline();
  const card = document.querySelector("#" + CSS.escape(day.id));
  if (card) {
    card.open = true;
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function setValue(id, value) {
  document.querySelector("#" + id).value = value ?? "";
}

function clean(value) {
  return String(value ?? "").trim();
}

function makeId(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
  return prefix + "-" + suffix;
}

function formatDay(date) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    weekday: "short"
  }).format(new Date(date + "T00:00:00"));
}

function formatDateRange(start, end) {
  const formatter = new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "numeric", day: "numeric" });
  return formatter.format(new Date(start + "T00:00:00")) + "–" + formatter.format(new Date(end + "T00:00:00"));
}

function dateDifference(start, end) {
  return Math.round((Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emptyState(title, message) {
  return '<div class="empty-state"><h3>' + escapeHtml(title) + "</h3><p>" + escapeHtml(message) + "</p></div>";
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2800);
}
