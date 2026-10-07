// TODO: replace with live data.

export const enrollmentByProgram = [
  { program: "BBS", dalit: 12, edj: 2, madhesi: 2, others: 84 },
  { program: "BBM", dalit: 8, edj: 1, madhesi: 2, others: 67 },
  { program: "BCA", dalit: 14, edj: 0, madhesi: 4, others: 122 },
  { program: "MBS", dalit: 1, edj: 0, madhesi: 0, others: 4 },
]

export const dropoutByProgram = [
  { program: "BBM", female: 3, male: 2, other: 0 },
  { program: "BBS", female: 15, male: 16, other: 0 },
  { program: "BCA", female: 1, male: 4, other: 0 },
  { program: "MBS", female: 3, male: 0, other: 0 },
]

export const studentsByFaculty = [
  { faculty: "Management", female: 155, male: 83, other: 0 },
]

export const studentsByProgramGender = [
  { program: "BBM", female: 68, male: 28, other: 9 },
  { program: "BBS", female: 75, male: 50, other: 11 },
  { program: "BCA", female: 57, male: 88, other: 24 },
  { program: "MBS", female: 8, male: 5, other: 0 },
]

export const dropoutTrend = [
  { year: "2021/22", students: 0 },
  { year: "2022/23", students: 0 },
  { year: "2023/24", students: 0 },
  { year: "2024/25", students: 25 },
  { year: "2025/26", students: 18 },
]

export const enrollmentTrend = [
  { year: "2022/23", students: 0 },
  { year: "2023/24", students: 0 },
  { year: "2024/25", students: 12 },
  { year: "2025/26", students: 35 },
  { year: "2026/27", students: 370 },
]

// Daily values for the last 30 days.
export const recentEnrollments = [
  1, 3, 2, 1, 0, 2, 4, 3, 1, 2, 0, 1, 3, 4, 2, 1, 0, 2, 3, 1, 2, 4, 3, 2, 1, 0,
  2, 3, 2, 1,
].map((value, day) => ({ day: day + 1, value }))

export const recentFees = Array.from({ length: 30 }, (_, day) => ({
  day: day + 1,
  value: 0,
}))
