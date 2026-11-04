// Turns text into something safe to put inside HTML (element text or a quoted attribute).
// Anything that came from the database or from a person (names, descriptions, search text) must go through this
// before it is placed into an innerHTML template.
function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
