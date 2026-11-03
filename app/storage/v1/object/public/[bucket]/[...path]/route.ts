import { readObject } from "@/lib/db/storage";
import { STORAGE_BUCKETS } from "@/lib/db/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Types the browser may render inline. Anything else downloads, so an uploaded
// HTML or SVG file can never run script on this origin.
const INLINE_TYPES = /^(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|webm|quicktime)|application\/pdf)$/;

function notFound() {
  return new Response(JSON.stringify({ error: "Object not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ bucket: string; path: string[] }> }
): Promise<Response> {
  const { bucket, path } = await ctx.params;
  if (!STORAGE_BUCKETS.has(bucket)) return notFound();
  const objectPath = path.map(decodeURIComponent).join("/");
  const obj = await readObject(bucket, objectPath);
  if (!obj) return notFound();
  const inline = INLINE_TYPES.test(obj.contentType);
  return new Response(new Uint8Array(obj.bytes), {
    status: 200,
    headers: {
      "Content-Type": inline ? obj.contentType : "application/octet-stream",
      ...(inline ? {} : { "Content-Disposition": "attachment" }),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=86400, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
