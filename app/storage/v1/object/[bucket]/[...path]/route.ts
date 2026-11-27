import { NextRequest, NextResponse } from "next/server";
import { createStorageClient } from "@/lib/db/storage";
import { isPlainPostgres } from "@/lib/db/mode";
import { resolveCaller, STORAGE_BUCKETS } from "@/lib/db/access";

import { guardStorageWrite } from "@/lib/db/rest-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
// Served from this origin, so nothing that a browser would run as a page.
const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|webm|quicktime)|application\/pdf)$/;

async function guard(req: NextRequest, bucket: string) {
  if (!isPlainPostgres()) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 503 });
  }
  if (!STORAGE_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: "Bucket not found" }, { status: 404 });
  }
  const caller = await resolveCaller(req);
  if (!caller.isStaff) {
    return NextResponse.json({ error: "Only store staff can change files." }, { status: 403 });
  }
  return null;
}

/**
 * Supabase Storage upload:
 *   POST /storage/v1/object/{bucket}/{path}
 *   body = raw file bytes
 */
async function postUnguarded(
  req: NextRequest,
  ctx: { params: Promise<{ bucket: string; path: string[] }> }
) {
  const { bucket, path } = await ctx.params;
  const denied = await guard(req, bucket);
  if (denied) return denied;

  const objectPath = path.map(decodeURIComponent).join("/");
  const upsert = (req.headers.get("x-upsert") || "").toLowerCase() === "true";
  const length = Number(req.headers.get("content-length") || 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "That file is larger than 25 MB." }, { status: 413 });
  }

  // supabase-js sends File/Blob uploads as multipart form data (file under the "" field).
  let contentType = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  let buf: Buffer;
  if (contentType === "multipart/form-data") {
    const form = await req.formData().catch(() => null);
    const file = form
      ? Array.from(form.values()).find((v): v is File => typeof v !== "string")
      : undefined;
    if (!file) return NextResponse.json({ error: "No file in upload" }, { status: 400 });
    contentType = (file.type || "").toLowerCase();
    buf = Buffer.from(await file.arrayBuffer());
  } else {
    buf = Buffer.from(await req.arrayBuffer());
  }

  if (!ALLOWED_TYPES.test(contentType)) {
    return NextResponse.json(
      { error: "Upload an image (JPG, PNG, WebP, GIF), an MP4/WebM video or a PDF." },
      { status: 415 }
    );
  }
  if (buf.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That file is larger than 25 MB." }, { status: 413 });
  }
  const storage = createStorageClient();
  const { data, error } = await storage.from(bucket).upload(objectPath, buf, {
    contentType,
    upsert,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: pub } = storage.from(bucket).getPublicUrl(objectPath);
  return NextResponse.json({
    Key: `${bucket}/${objectPath}`,
    Id: data?.path,
    ...data,
    publicUrl: pub.publicUrl,
  });
}

async function deleteUnguarded(
  req: NextRequest,
  ctx: { params: Promise<{ bucket: string; path: string[] }> }
) {
  const { bucket, path } = await ctx.params;
  const denied = await guard(req, bucket);
  if (denied) return denied;

  const objectPath = path.map(decodeURIComponent).join("/");
  const storage = createStorageClient();
  const { error } = await storage.from(bucket).remove([objectPath]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({});
}

export const POST = guardStorageWrite(postUnguarded);
export const DELETE = guardStorageWrite(deleteUnguarded);
