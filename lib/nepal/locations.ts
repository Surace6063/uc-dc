// Nepal's administrative divisions used for student addresses.
//
// Provinces and districts are stable reference data (7 provinces, 77
// districts since 2015). Municipalities (753 local levels) and wards are
// entered as text rather than embedded here: an incomplete or outdated list
// in code would block valid addresses. Swap this module for a database-backed
// hierarchy if municipality-level validation is ever required.

export type Province = { id: number; name: string; districts: readonly string[] }

export const PROVINCES: readonly Province[] = [
  {
    id: 1,
    name: "Koshi",
    districts: [
      "Bhojpur", "Dhankuta", "Ilam", "Jhapa", "Khotang", "Morang", "Okhaldhunga",
      "Panchthar", "Sankhuwasabha", "Solukhumbu", "Sunsari", "Taplejung", "Terhathum", "Udayapur",
    ],
  },
  {
    id: 2,
    name: "Madhesh",
    districts: ["Bara", "Dhanusha", "Mahottari", "Parsa", "Rautahat", "Saptari", "Sarlahi", "Siraha"],
  },
  {
    id: 3,
    name: "Bagmati",
    districts: [
      "Bhaktapur", "Chitwan", "Dhading", "Dolakha", "Kathmandu", "Kavrepalanchok", "Lalitpur",
      "Makwanpur", "Nuwakot", "Ramechhap", "Rasuwa", "Sindhuli", "Sindhupalchok",
    ],
  },
  {
    id: 4,
    name: "Gandaki",
    districts: [
      "Baglung", "Gorkha", "Kaski", "Lamjung", "Manang", "Mustang", "Myagdi",
      "Nawalpur", "Parbat", "Syangja", "Tanahun",
    ],
  },
  {
    id: 5,
    name: "Lumbini",
    districts: [
      "Arghakhanchi", "Banke", "Bardiya", "Dang", "Eastern Rukum", "Gulmi", "Kapilvastu",
      "Palpa", "Parasi", "Pyuthan", "Rolpa", "Rupandehi",
    ],
  },
  {
    id: 6,
    name: "Karnali",
    districts: [
      "Dailekh", "Dolpa", "Humla", "Jajarkot", "Jumla", "Kalikot", "Mugu", "Salyan",
      "Surkhet", "Western Rukum",
    ],
  },
  {
    id: 7,
    name: "Sudurpashchim",
    districts: [
      "Achham", "Baitadi", "Bajhang", "Bajura", "Dadeldhura", "Darchula", "Doti",
      "Kailali", "Kanchanpur",
    ],
  },
]

export function provinceName(id: number | null | undefined) {
  return PROVINCES.find((p) => p.id === id)?.name ?? null
}

export function districtsOf(provinceId: number | null | undefined): readonly string[] {
  return PROVINCES.find((p) => p.id === provinceId)?.districts ?? []
}

export function isDistrictInProvince(provinceId: number, district: string) {
  return districtsOf(provinceId).some((d) => d.toLowerCase() === district.toLowerCase())
}

// Accepts "3", "Bagmati" or "Bagmati Province" (used by imports).
export function parseProvince(value: string): number | null {
  const text = value.trim().toLowerCase().replace(/\s*province$/, "")
  if (!text) return null
  const asNumber = Number(text)
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= 7) return asNumber
  return PROVINCES.find((p) => p.name.toLowerCase() === text)?.id ?? null
}

// Canonical spelling of a district within a province, or null.
export function canonicalDistrict(provinceId: number, value: string) {
  const text = value.trim().toLowerCase()
  return districtsOf(provinceId).find((d) => d.toLowerCase() === text) ?? null
}
