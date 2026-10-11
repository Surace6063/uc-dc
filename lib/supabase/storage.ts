import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { ServiceUnavailableError } from "@/lib/authorization/errors"

// Private file storage for student photos and documents. Uses the secret key,
// so it only ever runs on the server; the bucket is private and files are
// served through short-lived signed URLs after an authorization check.
export const STUDENT_FILES_BUCKET = process.env.STUDENT_FILES_BUCKET || "student-files"

let client: SupabaseClient | null = null
let bucketReady: Promise<void> | null = null

function storageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !secretKey) {
    throw new ServiceUnavailableError("File storage isn't configured for this environment.")
  }
  client ??= createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })
  return client
}

// Creates the private bucket on first use if it doesn't exist yet.
async function ensureBucket() {
  bucketReady ??= (async () => {
    const storage = storageClient().storage
    const { data } = await storage.getBucket(STUDENT_FILES_BUCKET)
    if (data) {
      if (data.public) {
        throw new ServiceUnavailableError("The student files bucket must be private.")
      }
      return
    }
    const { error } = await storage.createBucket(STUDENT_FILES_BUCKET, { public: false })
    if (error && !/already exists/i.test(error.message)) throw error
  })().catch((error) => {
    bucketReady = null
    throw error
  })
  return bucketReady
}

export async function uploadFile(path: string, body: ArrayBuffer, contentType: string) {
  await ensureBucket()
  const { error } = await storageClient()
    .storage.from(STUDENT_FILES_BUCKET)
    .upload(path, body, { contentType, upsert: false })
  if (error) {
    console.error(error)
    throw new ServiceUnavailableError("The file couldn't be stored. Please try again.")
  }
}

// Best effort: a leftover private file is harmless, a failed DB change isn't.
export async function removeFiles(paths: string[]) {
  if (paths.length === 0) return
  try {
    const { error } = await storageClient().storage.from(STUDENT_FILES_BUCKET).remove(paths)
    if (error) console.error("Storage cleanup failed", error)
  } catch (error) {
    console.error("Storage cleanup failed", error)
  }
}

export async function signedUrl(path: string, expiresIn = 60, download?: string) {
  const { data, error } = await storageClient()
    .storage.from(STUDENT_FILES_BUCKET)
    .createSignedUrl(path, expiresIn, download ? { download } : undefined)
  if (error || !data) throw new ServiceUnavailableError("The file isn't available right now.")
  return data.signedUrl
}

// Signed URLs for many paths in one request (avatars on a table page).
// Returns an empty map rather than failing the page when storage is down.
export async function signedUrls(paths: string[], expiresIn = 3600) {
  const unique = [...new Set(paths)]
  if (unique.length === 0) return new Map<string, string>()
  try {
    const { data, error } = await storageClient()
      .storage.from(STUDENT_FILES_BUCKET)
      .createSignedUrls(unique, expiresIn)
    if (error || !data) return new Map<string, string>()
    return new Map(
      data.filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl])
    )
  } catch {
    return new Map<string, string>()
  }
}

// Checks the file's leading bytes rather than trusting the browser's type.
export function sniffMimeType(bytes: Uint8Array): string | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b)
  if (starts(0x25, 0x50, 0x44, 0x46)) return "application/pdf"
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg"
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png"
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp"
  }
  return null
}

export const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}
