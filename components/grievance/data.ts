export const complaintBases = [
  "Harassment",
  "Discrimination",
  "Unfair Action",
  "Physical Assault",
  "Bullying",
  "Sexual Abuse",
  "Others",
] as const

export type ComplaintBasis = (typeof complaintBases)[number]

// TODO: confirm the real recipients with the college.
export const informTo = [
  "Campus Chief",
  "Grievance Committee",
  "Program Coordinator",
  "Student Welfare Officer",
]

export type Grievance = {
  id: string
  grievantName: string
  program: string
  term: string
  section: string
  role: "Student" | "Staff"
  complaint: ComplaintBasis[]
  /** Free-text details, present when the complaint includes "Others". */
  otherDetails?: string
  date: string // BS, YYYY-MM-DD
  location: string
  tormentorName: string
  phone: string
  informTo: string
}

/** Complaint bases as text, with the "Others" details inlined. */
export function describeComplaint(g: Grievance) {
  return g.complaint
    .map((c) =>
      c === "Others" && g.otherDetails ? `Others (${g.otherDetails})` : c
    )
    .join(", ")
}

// TODO: replace with live data.
export const grievances: Grievance[] = [
  {
    id: "GR-1003",
    grievantName: "Aarati Shrestha",
    program: "BCA",
    term: "Second Semester",
    section: "A",
    role: "Student",
    complaint: ["Bullying"],
    date: "2083-06-18",
    location: "Computer Lab 2",
    tormentorName: "Unknown",
    phone: "9841000001",
    informTo: "Grievance Committee",
  },
  {
    id: "GR-1002",
    grievantName: "Bikash Thapa",
    program: "BBM",
    term: "Fourth Semester",
    section: "B",
    role: "Student",
    complaint: ["Unfair Action"],
    date: "2083-06-10",
    location: "Exam Hall B",
    tormentorName: "Invigilator (Room 204)",
    phone: "9841000002",
    informTo: "Program Coordinator",
  },
  {
    id: "GR-1001",
    grievantName: "Sita Karki",
    program: "—",
    term: "—",
    section: "—",
    role: "Staff",
    complaint: ["Harassment", "Discrimination"],
    date: "2083-05-28",
    location: "Administration Block",
    tormentorName: "Withheld",
    phone: "9841000003",
    informTo: "Campus Chief",
  },
]
