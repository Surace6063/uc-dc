import { UserRoundXIcon } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"

// Shown on student pages when the signed-in account has no student profile.
export function NoStudentProfile() {
  return <EmptyState icon={UserRoundXIcon} title="Your account isn't linked to a student profile" description="Ask the school office to link your login to your student record." />
}

export function NotEnrolled() {
  return <EmptyState icon={UserRoundXIcon} title="You're not enrolled in a class" description="You have no active enrollment. The school office manages enrollments." />
}
