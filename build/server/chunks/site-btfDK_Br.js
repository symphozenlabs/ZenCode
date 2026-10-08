const EVENT_IDS = ["hackathon", "pitch-fest"];
const DEFAULT_SITE_CONFIG = {
  name: "ZenCode",
  tagline: "Code. Create. Compete.",
  edition: "",
  venue: "",
  city: "",
  contactEmail: "",
  organizers: [],
  sponsors: [],
  schedule: [],
  generalRules: [],
  events: {
    hackathon: {
      title: "Hackathon",
      summary: "Form a team, pick a track and ship a working product before the clock runs out.",
      description: "Teams take a problem from idea to working prototype within a fixed build window, then demo it to the judges.",
      startDate: "",
      endDate: "",
      duration: "",
      registrationOpen: true,
      registrationDeadline: "",
      capacity: null,
      teamMin: 2,
      teamMax: 4,
      tracks: [],
      prizes: [],
      rules: []
    },
    "pitch-fest": {
      title: "Pitch Fest",
      summary: "Pitch your startup idea on stage and defend it in front of a panel.",
      description: "Founders and teams present an idea, its market and its plan in a timed pitch, followed by questions from the panel.",
      startDate: "",
      endDate: "",
      duration: "",
      registrationOpen: true,
      registrationDeadline: "",
      capacity: null,
      teamMin: 1,
      teamMax: 3,
      tracks: [],
      prizes: [],
      rules: []
    }
  }
};
const EVENT_LABELS = {
  hackathon: "Hackathon",
  "pitch-fest": "Pitch Fest"
};
function isEventId(value) {
  return typeof value === "string" && EVENT_IDS.includes(value);
}
function mergeSiteConfig(stored) {
  const base = structuredClone(DEFAULT_SITE_CONFIG);
  if (!stored || typeof stored !== "object") return base;
  const s = stored;
  const events = { ...base.events };
  for (const id of EVENT_IDS) {
    events[id] = { ...base.events[id], ...s.events?.[id] ?? {} };
  }
  return { ...base, ...s, events };
}

export { DEFAULT_SITE_CONFIG as D, EVENT_IDS as E, EVENT_LABELS as a, isEventId as i, mergeSiteConfig as m };
//# sourceMappingURL=site-btfDK_Br.js.map
