import { i as isEventId } from './site-btfDK_Br.js';

const ACADEMIC_YEARS = [
  "1st year",
  "2nd year",
  "3rd year",
  "4th year",
  "5th year",
  "Postgraduate",
  "Other"
];
function registrationKeyId(event, emailLower) {
  return `${event}__${emailLower}`;
}
function emptyRegistration() {
  return {
    event: "",
    personal: { name: "", email: "", phone: "" },
    academic: { college: "", department: "", year: "" },
    team: { name: "", track: "", members: [] }
  };
}
const EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]{2,}$/;
const PHONE = /^\+?[0-9][0-9\s-]{6,17}$/;
const LIMITS = { name: 80, text: 120 };
function required(errors, key, value, label, max = LIMITS.text) {
  const v = value.trim();
  if (!v) errors[key] = `Enter ${label}.`;
  else if (v.length > max) errors[key] = `Keep ${label} under ${max} characters.`;
}
function validatePersonal(input) {
  const e = {};
  required(e, "personal.name", input.personal.name, "your full name", LIMITS.name);
  if (!EMAIL.test(input.personal.email.trim())) e["personal.email"] = "Enter a valid email address.";
  if (!PHONE.test(input.personal.phone.trim())) e["personal.phone"] = "Enter a valid phone number.";
  return e;
}
function validateAcademic(input) {
  const e = {};
  required(e, "academic.college", input.academic.college, "your college");
  required(e, "academic.department", input.academic.department, "your department");
  if (!ACADEMIC_YEARS.includes(input.academic.year))
    e["academic.year"] = "Choose your year of study.";
  return e;
}
function validateEvent(input, config) {
  const e = {};
  if (!isEventId(input.event)) {
    e["event"] = "Choose an event.";
    return e;
  }
  if (config && !config.registrationOpen) e["event"] = "Registration for this event is closed.";
  if (config && config.tracks.length > 0 && !config.tracks.includes(input.team.track))
    e["team.track"] = "Choose a track.";
  return e;
}
function isSoloEvent(config) {
  return !!config && config.teamMax <= 1;
}
function validateTeam(input, config) {
  const e = {};
  if (!config) return e;
  if (!isSoloEvent(config)) required(e, "team.name", input.team.name, "a team name", 60);
  const size = 1 + input.team.members.length;
  if (size < config.teamMin)
    e["team.members"] = `Teams need at least ${config.teamMin} people including you.`;
  if (size > config.teamMax)
    e["team.members"] = `Teams can have at most ${config.teamMax} people including you.`;
  const seen = /* @__PURE__ */ new Set([input.personal.email.trim().toLowerCase()]);
  input.team.members.forEach((m, i) => {
    required(e, `team.members.${i}.name`, m.name, "a name", LIMITS.name);
    const email = m.email.trim().toLowerCase();
    if (!EMAIL.test(email)) e[`team.members.${i}.email`] = "Enter a valid email.";
    else if (seen.has(email)) e[`team.members.${i}.email`] = "Each member needs a different email.";
    seen.add(email);
  });
  return e;
}
function validateAll(input, config) {
  return {
    ...validatePersonal(input),
    ...validateAcademic(input),
    ...validateEvent(input, config),
    ...validateTeam(input, config)
  };
}
function sanitizeRegistration(raw) {
  const r = raw ?? {};
  const str = (v) => typeof v === "string" ? v.trim() : "";
  const members = Array.isArray(r.team?.members) ? r.team.members.slice(0, 10) : [];
  return {
    event: isEventId(r.event) ? r.event : "",
    personal: {
      name: str(r.personal?.name),
      email: str(r.personal?.email),
      phone: str(r.personal?.phone)
    },
    academic: {
      college: str(r.academic?.college),
      department: str(r.academic?.department),
      year: str(r.academic?.year)
    },
    team: {
      name: str(r.team?.name),
      track: str(r.team?.track),
      members: members.map((m) => ({ name: str(m?.name), email: str(m?.email) }))
    }
  };
}

export { emptyRegistration as e, registrationKeyId as r, sanitizeRegistration as s, validateAll as v };
//# sourceMappingURL=registration-BcueNbWR.js.map
