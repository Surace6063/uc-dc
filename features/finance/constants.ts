import type {
  ConcessionKind,
  FinanceCategoryKind,
  FinanceEntryKind,
  PaymentMethod,
  StudentFeeStatus,
} from "@/lib/generated/prisma/enums"

export const CATEGORY_KIND_LABELS: Record<FinanceCategoryKind, string> = {
  FEE: "Fee head",
  INCOME: "Income source",
  EXPENSE: "Expense head",
}

export const FEE_STATUS_LABELS: Record<StudentFeeStatus, string> = {
  UNPAID: "Unpaid",
  PARTIAL: "Partly paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
}

export const CONCESSION_KIND_LABELS: Record<ConcessionKind, string> = {
  DISCOUNT: "Discount",
  SCHOLARSHIP: "Scholarship",
  WAIVER: "Waiver",
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer / deposit",
  CHEQUE: "Cheque",
  ESEWA: "eSewa",
  KHALTI: "Khalti",
  FONEPAY: "Fonepay QR",
  CARD: "Card",
  OTHER: "Other",
}

export const ENTRY_KIND_LABELS: Record<FinanceEntryKind, string> = {
  INCOME: "Income",
  EXPENSE: "Expense",
}

// Wallets and QR payments: recorded by staff only after they find the
// transaction in the provider's merchant dashboard (no live gateway).
export const ONLINE_METHODS: readonly PaymentMethod[] = ["ESEWA", "KHALTI", "FONEPAY"]

// Methods that need a reference (transaction ID, cheque or bank reference).
export const REFERENCE_METHODS: readonly PaymentMethod[] = ["BANK_TRANSFER", "CHEQUE", "ESEWA", "KHALTI", "FONEPAY", "CARD"]

// Methods that may be recorded as awaiting confirmation (clearance).
export const PENDABLE_METHODS: readonly PaymentMethod[] = ["BANK_TRANSFER", "CHEQUE"]

// Suggested categories for a new institution (added on request, editable).
export const DEFAULT_CATEGORIES: { kind: FinanceCategoryKind; name: string }[] = [
  { kind: "FEE", name: "Admission fee" },
  { kind: "FEE", name: "Tuition fee" },
  { kind: "FEE", name: "Examination fee" },
  { kind: "FEE", name: "Library fee" },
  { kind: "FEE", name: "Laboratory / practical fee" },
  { kind: "FEE", name: "Transport fee" },
  { kind: "FEE", name: "Hostel fee" },
  { kind: "INCOME", name: "Government / UGC grant" },
  { kind: "INCOME", name: "Donation" },
  { kind: "INCOME", name: "Bank interest" },
  { kind: "INCOME", name: "Other income" },
  { kind: "EXPENSE", name: "Salaries" },
  { kind: "EXPENSE", name: "Utilities (electricity, water, internet)" },
  { kind: "EXPENSE", name: "Rent" },
  { kind: "EXPENSE", name: "Stationery & supplies" },
  { kind: "EXPENSE", name: "Repairs & maintenance" },
  { kind: "EXPENSE", name: "Scholarships paid" },
  { kind: "EXPENSE", name: "Other expense" },
]
