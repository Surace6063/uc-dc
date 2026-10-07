// TODO: replace with live data.

export type ExamStatus = "Active" | "Inactive"
export type ExamType = "GPA" | "Percentage" | "GPA+Percentage"
export type Attempt = "Regular" | "Re-exam" | "Back paper"

export type Exam = {
  id: string
  level: "Bachelor" | "Master"
  program: string
  term: string
  name: string
  subject: string
  attempt: Attempt
  category: string
  type: ExamType
  startDate: string // BS, YYYY-MM-DD
  resultDate: string // BS, YYYY-MM-DD or ""
  createdDate: string // BS, YYYY-MM-DD
  status: ExamStatus
  description: string
  admitCardTemplate: string
  admitCardReleased: boolean
}

export const programs = ["BBS", "BBM", "BCA", "MBS"]

export const terms: Record<string, string[]> = {
  BCA: [
    "First Semester",
    "Second Semester",
    "Third Semester",
    "Fourth Semester",
    "Fifth Semester",
    "Sixth Semester",
    "Seventh Semester",
    "Eighth Semester",
  ],
  BBM: [
    "First Semester",
    "Second Semester",
    "Third Semester",
    "Fourth Semester",
    "Fifth Semester",
    "Sixth Semester",
    "Seventh Semester",
    "Eighth Semester",
  ],
  BBS: ["First Year", "Second Year", "Third Year", "Fourth Year"],
  MBS: [
    "First Semester",
    "Second Semester",
    "Third Semester",
    "Fourth Semester",
  ],
}

export const levelOf = (program: string) =>
  program === "MBS" ? ("Master" as const) : ("Bachelor" as const)

export const examSubjects = [
  { name: "Data Structures & Algorithms", program: "BCA" },
  { name: "Web Technology", program: "BCA" },
  { name: "Operating Systems", program: "BCA" },
  { name: "Principles of Management", program: "BBM" },
  { name: "Business Statistics", program: "BBM" },
  { name: "Financial Accounting", program: "BBS" },
  { name: "Business Law", program: "BBS" },
  { name: "Research Methodology", program: "MBS" },
]

export const examCategories = [
  "Pre-Board Exam",
  "Mid-Term Exam",
  "First Term Exam",
  "Second Term Exam",
  "Final Exam",
  "Internal Assessment",
]
export const examTypes: ExamType[] = ["GPA", "Percentage", "GPA+Percentage"]
export const attempts: Attempt[] = ["Regular", "Re-exam", "Back paper"]
export const admitCardTemplates = [
  "None",
  "Standard Admit Card",
  "Compact Admit Card",
]

// TODO: replace with today's date from a BS calendar conversion.
export const TODAY_BS = "2083-06-21"

const seed: [string, string, string, ExamType, string, string][] = [
  [
    "BCA",
    "Second Semester",
    "Pre-Board Exam",
    "GPA+Percentage",
    "2083-06-16",
    "2083-06-16",
  ],
  [
    "BCA",
    "Fourth Semester",
    "Pre-Board Exam",
    "GPA+Percentage",
    "2083-06-16",
    "2083-06-16",
  ],
  [
    "BBS",
    "Third Year",
    "Pre-Board Exam",
    "Percentage",
    "2083-06-16",
    "2083-06-16",
  ],
  [
    "BBM",
    "Eighth Semester",
    "Mid-Term Exam",
    "GPA+Percentage",
    "2083-05-16",
    "2083-06-06",
  ],
  [
    "BBM",
    "Fourth Semester",
    "Pre-Board Exam",
    "GPA+Percentage",
    "2083-06-02",
    "2083-05-31",
  ],
  [
    "BBM",
    "Second Semester",
    "Pre-Board Exam",
    "GPA+Percentage",
    "2083-06-02",
    "2083-05-31",
  ],
  ["BBM", "Sixth Semester", "Mid-Term Exam", "GPA", "2083-05-15", "2083-05-15"],
  [
    "BCA",
    "Seventh Semester",
    "Pre-Board Exam",
    "GPA+Percentage",
    "2083-05-01",
    "2083-04-31",
  ],
  [
    "BBS",
    "Fourth Year",
    "First Term Exam",
    "Percentage",
    "2083-05-01",
    "2083-04-31",
  ],
  [
    "BCA",
    "Fourth Semester",
    "Mid-Term Exam",
    "GPA+Percentage",
    "2083-04-18",
    "2083-04-18",
  ],
  [
    "MBS",
    "Second Semester",
    "Mid-Term Exam",
    "GPA",
    "2083-04-10",
    "2083-04-02",
  ],
  [
    "BCA",
    "Sixth Semester",
    "First Term Exam",
    "GPA+Percentage",
    "2083-03-28",
    "2083-03-20",
  ],
  [
    "BBS",
    "First Year",
    "First Term Exam",
    "Percentage",
    "2083-03-22",
    "2083-03-15",
  ],
  [
    "BBM",
    "Third Semester",
    "Internal Assessment",
    "GPA",
    "2083-03-12",
    "2083-03-10",
  ],
  [
    "MBS",
    "Fourth Semester",
    "Pre-Board Exam",
    "GPA",
    "2083-03-05",
    "2083-02-28",
  ],
  [
    "BCA",
    "Second Semester",
    "Mid-Term Exam",
    "GPA+Percentage",
    "2083-02-25",
    "2083-02-20",
  ],
  [
    "BBS",
    "Second Year",
    "Second Term Exam",
    "Percentage",
    "2083-02-18",
    "2083-02-12",
  ],
  [
    "BBM",
    "Fifth Semester",
    "Final Exam",
    "GPA+Percentage",
    "2083-02-02",
    "2083-01-28",
  ],
  [
    "BCA",
    "Eighth Semester",
    "Final Exam",
    "GPA+Percentage",
    "2083-01-20",
    "2083-01-15",
  ],
  [
    "MBS",
    "First Semester",
    "Internal Assessment",
    "GPA",
    "2083-01-12",
    "2083-01-08",
  ],
  [
    "BBS",
    "Third Year",
    "Second Term Exam",
    "Percentage",
    "2082-12-24",
    "2082-12-18",
  ],
  ["BBM", "First Semester", "Mid-Term Exam", "GPA", "2082-12-10", "2082-12-04"],
  [
    "BCA",
    "Third Semester",
    "Internal Assessment",
    "GPA+Percentage",
    "2082-11-26",
    "2082-11-20",
  ],
  [
    "BBS",
    "Fourth Year",
    "Final Exam",
    "Percentage",
    "2082-11-14",
    "2082-11-08",
  ],
]

export const exams: Exam[] = seed.map(
  ([program, term, category, type, startDate, createdDate], i) => ({
    id: `EX-${1100 - i}`,
    level: levelOf(program),
    program,
    term,
    name: category,
    subject:
      examSubjects.find((s) => s.program === program)?.name ??
      examSubjects[0].name,
    attempt: "Regular",
    category,
    type,
    startDate,
    resultDate: "",
    createdDate,
    status: i % 9 === 8 ? "Inactive" : "Active",
    description: "",
    admitCardTemplate: "None",
    admitCardReleased: false,
  })
)

export type ScheduleEntry = {
  date: string
  subject: string
  code: string
  program: string
  time: string
  room: string
}

export const schedule: ScheduleEntry[] = [
  {
    date: "2026-10-18",
    subject: "Data Structures & Algorithms",
    code: "CACS201",
    program: "BCA",
    time: "7:00 – 10:00 AM",
    room: "Hall A",
  },
  {
    date: "2026-10-18",
    subject: "Principles of Management",
    code: "MGT201",
    program: "BBM",
    time: "7:00 – 10:00 AM",
    room: "Hall B",
  },
  {
    date: "2026-10-20",
    subject: "Microprocessor & Computer Architecture",
    code: "CACS202",
    program: "BCA",
    time: "7:00 – 10:00 AM",
    room: "Hall A",
  },
  {
    date: "2026-10-20",
    subject: "Business Statistics",
    code: "STT201",
    program: "BBM",
    time: "11:00 AM – 2:00 PM",
    room: "Room 204",
  },
  {
    date: "2026-10-22",
    subject: "Web Technology",
    code: "CACS203",
    program: "BCA",
    time: "7:00 – 10:00 AM",
    room: "Lab 2",
  },
  {
    date: "2026-10-22",
    subject: "Financial Accounting",
    code: "ACC201",
    program: "BBM",
    time: "7:00 – 10:00 AM",
    room: "Hall B",
  },
  {
    date: "2026-10-24",
    subject: "Operating Systems",
    code: "CACS204",
    program: "BCA",
    time: "7:00 – 10:00 AM",
    room: "Hall A",
  },
  {
    date: "2026-10-26",
    subject: "Numerical Methods",
    code: "CACS205",
    program: "BCA",
    time: "7:00 – 10:00 AM",
    room: "Hall A",
  },
]

export const subjects = [
  "Data Structures & Algorithms",
  "Microprocessor & Computer Architecture",
  "Web Technology",
  "Operating Systems",
  "Numerical Methods",
]

export type MarkRow = {
  roll: number
  name: string
  theory: number | null
  practical: number | null
}

export const markSheet: MarkRow[] = [
  { roll: 1, name: "Aarati Shrestha", theory: 52, practical: 18 },
  { roll: 2, name: "Bikash Thapa", theory: 44, practical: 16 },
  { roll: 3, name: "Chandani Rai", theory: 58, practical: 19 },
  { roll: 4, name: "Dipesh Karki", theory: 31, practical: 14 },
  { roll: 5, name: "Elina Gurung", theory: null, practical: null },
  { roll: 6, name: "Gaurav Adhikari", theory: 49, practical: 17 },
  { roll: 7, name: "Himal Tamang", theory: 22, practical: 12 },
  { roll: 8, name: "Ishika Poudel", theory: 55, practical: 20 },
]

export const imports = [
  {
    file: "bca_2025_final_results.xlsx",
    exam: "Final Examination 2025",
    records: 412,
    date: "2026-09-30",
    status: "Completed" as const,
  },
  {
    file: "bbs_2024_annual.csv",
    exam: "Annual Examination 2024",
    records: 1286,
    date: "2026-09-12",
    status: "Completed" as const,
  },
  {
    file: "mbs_2024_semester3.xlsx",
    exam: "Semester III 2024",
    records: 0,
    date: "2026-09-10",
    status: "Failed" as const,
  },
]

export const reportCardTemplates = [
  {
    name: "Semester Report Card",
    description: "Grade-point layout for semester programs (BCA, BBM).",
    usedBy: ["BCA", "BBM"],
    updated: "2026-09-21",
    isDefault: true,
  },
  {
    name: "Annual Mark Sheet",
    description: "Marks and division layout for yearly programs.",
    usedBy: ["BBS"],
    updated: "2026-08-04",
    isDefault: false,
  },
  {
    name: "Internal Assessment",
    description: "Compact sheet for internal and terminal exams.",
    usedBy: ["BCA", "BBM", "BBS"],
    updated: "2026-07-15",
    isDefault: false,
  },
  {
    name: "Master's Transcript",
    description: "Detailed transcript with credit hours per course.",
    usedBy: ["MBS"],
    updated: "2026-06-30",
    isDefault: false,
  },
]
