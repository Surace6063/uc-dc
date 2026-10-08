// Development seed. Safe to re-run: every step finds-or-creates.
//
//   npm run db:seed
//
// Creates Supabase Auth users (via the secret key) and the matching
// application users, organisations, default roles and memberships.
// All accounts use @example.com addresses and the password below.
// Env vars come from .env.local via --env-file (see prisma.config.ts).
import { createClient, type User as AuthUser } from "@supabase/supabase-js"

import { prisma } from "@/lib/prisma"
import {
  createOrganization,
  resetDefaultRoles,
  upsertMember,
} from "@/services/organizations/organization-service"
import { ensureAppUser } from "@/services/users/user-service"

const PASSWORD = process.env.SEED_PASSWORD ?? "Password123!"

type SeedOrg = {
  slug: string
  name: string
  type: "SCHOOL" | "COLLEGE"
  country: string
  members: { email: string; name: string; role: string }[]
}

const organizations: SeedOrg[] = [
  {
    slug: "abc-international-school",
    name: "ABC International School",
    type: "SCHOOL",
    country: "Nepal",
    members: [
      { email: "abc.owner@example.com", name: "Ramesh Adhikari", role: "owner" },
      { email: "abc.admin@example.com", name: "Sita Gurung", role: "admin" },
      { email: "abc.teacher@example.com", name: "Bimala Karki", role: "teacher" },
      { email: "abc.student@example.com", name: "Aarav Shrestha", role: "student" },
      { email: "abc.parent@example.com", name: "Hari Shrestha", role: "parent" },
      // Belongs to both organisations with different roles.
      { email: "multi@example.com", name: "Prakash Magar", role: "teacher" },
    ],
  },
  {
    slug: "xyz-college",
    name: "XYZ College",
    type: "COLLEGE",
    country: "Nepal",
    members: [
      { email: "xyz.admin@example.com", name: "Anita Rai", role: "admin" },
      { email: "xyz.teacher@example.com", name: "Bibek Thapa", role: "teacher" },
      { email: "xyz.student@example.com", name: "Nisha Karki", role: "student" },
      { email: "multi@example.com", name: "Prakash Magar", role: "admin" },
    ],
  },
]

const platformAdmin = { email: "platform.admin@example.com", name: "Platform Admin" }

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production")

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !secretKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local")

  const supabase = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Index existing auth users by email once.
  const authUsers = new Map<string, AuthUser>()
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    data.users.forEach((u) => u.email && authUsers.set(u.email.toLowerCase(), u))
    if (data.users.length < 1000) break
  }

  const appUserIds = new Map<string, string>()

  async function ensureUser(email: string, name: string) {
    if (appUserIds.has(email)) return appUserIds.get(email)!

    let authUser = authUsers.get(email)
    if (authUser) {
      // Keep seeded accounts on the known dev password.
      const { error } = await supabase.auth.admin.updateUserById(authUser.id, {
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { name },
      })
      if (error) throw error
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { name },
      })
      if (error) throw error
      authUser = data.user
    }

    const appUser = await ensureAppUser({ authUserId: authUser.id, email, name })
    if (!appUser.name || appUser.name === email.split("@")[0]) {
      await prisma.user.update({ where: { id: appUser.id }, data: { name } })
    }
    appUserIds.set(email, appUser.id)
    return appUser.id
  }

  // Platform admin: no organisation membership at all.
  const adminId = await ensureUser(platformAdmin.email, platformAdmin.name)
  await prisma.platformAdmin.upsert({
    where: { userId: adminId },
    create: { userId: adminId },
    update: {},
  })
  console.log(`✔ ${platformAdmin.email} (platform admin)`)

  for (const org of organizations) {
    const existing = await prisma.organization.findUnique({ where: { slug: org.slug } })
    const organization =
      existing ??
      (await createOrganization(
        { name: org.name, type: org.type, country: org.country },
        { slug: org.slug }
      ))
    if (existing) await resetDefaultRoles(existing.id)
    console.log(`✔ ${org.name}`)

    for (const member of org.members) {
      const userId = await ensureUser(member.email, member.name)
      await upsertMember(organization.id, userId, member.role)
      console.log(`    ${member.role.padEnd(8)} ${member.email}`)
    }
  }

  console.log(`\nAll seeded accounts use the password: ${PASSWORD}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
