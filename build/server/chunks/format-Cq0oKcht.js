const TBA = "To be announced";
function parseIsoDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = /* @__PURE__ */ new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function formatDate(iso, opts = { day: "numeric", month: "short", year: "numeric" }) {
  const d = parseIsoDate(iso);
  return d ? d.toLocaleDateString("en-IN", opts) : "";
}
function formatDateRange(start, end) {
  const a = formatDate(start);
  const b = formatDate(end);
  if (!a) return TBA;
  if (!b || a === b) return a;
  return `${a} – ${b}`;
}

export { TBA as T, formatDate as a, formatDateRange as f };
//# sourceMappingURL=format-Cq0oKcht.js.map
