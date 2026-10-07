export type EventReport = {
  name: string
  url: string
}

export type CollegeEvent = {
  id: string
  title: string
  organizedBy: "Institution own self" | "External institution"
  date: string // BS, YYYY-MM-DD
  venue: string
  participants: "All" | "Staff" | "Students"
  /** Roles within the participant group, e.g. Teacher. */
  roles: string[]
  objectives: string[]
  reports: EventReport[]
}

// TODO: replace with live data. Report URLs are placeholders until real
// files are uploaded.
export const events: CollegeEvent[] = [
  {
    id: "EV-107",
    title: "Cardiac Awareness Program",
    organizedBy: "External institution",
    date: "2082-04-27",
    venue: "United Pavilion Hall",
    participants: "All",
    roles: [],
    objectives: [],
    reports: [],
  },
  {
    id: "EV-106",
    title: "Scientific Research Article Writing Training for Teaching Faculty",
    organizedBy: "External institution",
    date: "2082-01-05",
    venue:
      "Pavilion Hall, United College, Kumaripati & Om Adhya Resort, Tistung",
    participants: "Staff",
    roles: ["Teacher"],
    objectives: [
      "To strengthen research writing capacities among the members of teaching faculty (2082-01-05 to 2082-01-12).",
      "To provide the participants with tools, techniques, and knowledge required to write and publish quality scientific research papers (2082-01-05 to 2082-01-12).",
    ],
    reports: [
      { name: "File 1", url: "/reports/research-article-writing-training.pdf" },
    ],
  },
  {
    id: "EV-105",
    title: "Faculty Development Program 26-27 Poush (10-11 Jan 2025)",
    organizedBy: "Institution own self",
    date: "2081-09-26",
    venue: "Himalaya Drishya Resort, Dhulikhel",
    participants: "Staff",
    roles: [],
    objectives: [],
    reports: [],
  },
  {
    id: "EV-104",
    title: "Sports Week 2025 (Jan 5-10)",
    organizedBy: "Institution own self",
    date: "2081-09-21",
    venue: "United College Premises",
    participants: "All",
    roles: [],
    objectives: [],
    reports: [],
  },
  {
    id: "EV-103",
    title: "SPSS Training to Faculty members",
    organizedBy: "Institution own self",
    date: "2081-08-30",
    venue: "United's Computer Lab",
    participants: "Staff",
    roles: [],
    objectives: [],
    reports: [],
  },
  {
    id: "EV-102",
    title: "Blood Donation Program",
    organizedBy: "Institution own self",
    date: "2081-08-02",
    venue: "United College Basketball Premises",
    participants: "All",
    roles: [],
    objectives: [],
    reports: [],
  },
  {
    id: "EV-101",
    title: "Blood Donation Orientation Program",
    organizedBy: "Institution own self",
    date: "2081-07-15",
    venue: "Pavilion Hall, United College, Kumaripati",
    participants: "All",
    roles: [],
    objectives: [],
    reports: [],
  },
]
