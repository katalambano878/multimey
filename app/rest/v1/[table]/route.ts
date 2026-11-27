import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  applyPostgrestParams,
} from "@/lib/db/supabase-compat";
import { isPlainPostgres } from "@/lib/db/mode";
import { query } from "@/lib/db/pool";
import {
  resolveCaller,
  readRule,
  embedRule,
  checkInsert,
  updateRule,
  deleteRule,
  type Caller,
} from "@/lib/db/access";

import { guardTable } from "@/lib/db/rest-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PG_IDENT = /^[a-z_][a-z0-9_]*$/i;
const MAX_ROWS = 1000;

// PostgREST query params that are not row filters.
const NON_FILTER_PARAMS = ["select", "on_conflict", "columns"];

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, prefer, x-client-info, accept-profile, content-profile",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    // supabase-js reads totals from Content-Range; browsers hide it cross-origin
    // (e.g. multimeysupplies.com calling www.multimeysupplies.com) unless exposed.
    "Access-Control-Expose-Headers": "Content-Range, Content-Profile",
  };
}

function preferSingle(req: NextRequest): boolean {
  const accept = req.headers.get("accept") || "";
  return accept.includes("application/vnd.pgrst.object+json");
}

function preferReturn(req: NextRequest): boolean {
  const prefer = req.headers.get("prefer") || "";
  return prefer.includes("return=representation");
}

function preferCount(req: NextRequest): boolean {
  const prefer = req.headers.get("prefer") || "";
  return prefer.includes("count=exact");
}

function jsonError(message: string, status = 400, code = "PGRST") {
  return NextResponse.json(
    { message, code, details: null, hint: null },
    { status, headers: corsHeaders() }
  );
}

function forbidden(message = "You don't have permission to do that.") {
  return jsonError(message, 403);
}

function filterParams(req: NextRequest): URLSearchParams {
  const params = new URLSearchParams(req.nextUrl.searchParams);
  for (const key of NON_FILTER_PARAMS) params.delete(key);
  return params;
}

const pkCache = new Map<string, string[]>();

async function primaryKey(table: string): Promise<string[]> {
  const cached = pkCache.get(table);
  if (cached) return cached;
  const { rows } = await query<{ column_name: string }>(
    `SELECT a.attname AS column_name
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = ('public.' || quote_ident($1))::regclass AND i.indisprimary`,
    [table]
  );
  const cols = rows.map((r) => r.column_name);
  pkCache.set(table, cols.length ? cols : ["id"]);
  return pkCache.get(table)!;
}

async function guard(req: NextRequest, ctx: { params: Promise<{ table: string }> }) {
  if (!isPlainPostgres()) {
    return { error: jsonError("Plain Postgres mode is not enabled (DATABASE_URL missing)", 503) };
  }
  const { table } = await ctx.params;
  if (!PG_IDENT.test(table)) return { error: jsonError("Invalid table") };
  const caller = await resolveCaller(req);
  return { table, caller };
}

function withEmbeds(qb: any, caller: Caller) {
  return qb.withEmbedPolicy((table: string, parent: string) => embedRule(caller, table, parent));
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

async function getUnguarded(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  const g = await guard(req, ctx);
  if (g.error) return g.error;
  const { table, caller } = g;

  const client = createClient();
  const qb = client.from(table);
  const select = req.nextUrl.searchParams.get("select") || "*";
  if (preferCount(req)) {
    qb.select(select, {
      count: "exact",
      head: req.headers.get("prefer")?.includes("head=true"),
    });
  } else {
    qb.select(select);
  }
  try {
    applyPostgrestParams(qb as any, filterParams(req), {
      preferSingle: preferSingle(req),
    });
  } catch (e: any) {
    return jsonError(e.message || "Invalid query");
  }

  const rule = readRule(caller, table, { pinned: (col) => qb.hasEqFilter(col) });
  if (rule === "deny") return forbidden();
  // Filtering on an embedded table must not reveal rows the caller can't read.
  if (qb.embeddedFilterTables().some((t: string) => embedRule(caller, t, table) === "deny")) {
    return forbidden();
  }
  if (rule) qb.where(rule);
  withEmbeds(qb, caller);
  if (!caller.isStaff && !req.nextUrl.searchParams.has("limit")) qb.limit(MAX_ROWS);

  const result = await qb;
  if (result.error) {
    const code = result.error.code === "PGRST116" ? "PGRST116" : "PGRST";
    return jsonError(result.error.message || "Query failed", code === "PGRST116" ? 406 : 400, code);
  }

  const headers = new Headers(corsHeaders());
  headers.set("Content-Type", "application/json");
  if (result.count != null) {
    headers.set("Content-Range", `0-${Math.max((Array.isArray(result.data) ? result.data.length : 1) - 1, 0)}/${result.count}`);
  }

  if (preferSingle(req)) {
    return NextResponse.json(result.data, { status: 200, headers });
  }
  return NextResponse.json(result.data ?? [], { status: 200, headers });
}

async function postUnguarded(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  const g = await guard(req, ctx);
  if (g.error) return g.error;
  const { table, caller } = g;

  const body = await req.json().catch(() => null);
  if (body == null || typeof body !== "object") return jsonError("Invalid JSON body");
  const rows = Array.isArray(body) ? body : [body];

  const denied = await checkInsert(caller, table, rows);
  if (denied) return forbidden(denied);

  // supabase-js .upsert() posts with Prefer: resolution=merge-duplicates|ignore-duplicates
  const prefer = req.headers.get("prefer") || "";
  const resolution = /resolution=(merge|ignore)-duplicates/.exec(prefer)?.[1];
  if (resolution && !caller.isStaff) return forbidden();

  const client = createClient();
  let qb: any;
  if (resolution) {
    const onConflict =
      req.nextUrl.searchParams.get("on_conflict") || (await primaryKey(table)).join(",");
    qb = client.from(table).upsert(rows, { onConflict, ignoreDuplicates: resolution === "ignore" });
  } else {
    qb = client.from(table).insert(rows);
  }
  if (preferReturn(req) || preferSingle(req)) {
    qb = qb.select(req.nextUrl.searchParams.get("select") || "*");
  }
  if (preferSingle(req)) qb = qb.single();

  const result = await qb;
  if (result.error) return jsonError(result.error.message || "Insert failed", 400);

  return NextResponse.json(result.data, {
    status: 201,
    headers: corsHeaders(),
  });
}

async function patchUnguarded(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  const g = await guard(req, ctx);
  if (g.error) return g.error;
  const { table, caller } = g;

  const body = await req.json().catch(() => null);
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("Invalid JSON body");
  }

  const { rows: rule, error } = updateRule(caller, table, body);
  if (error) return forbidden(error);
  if (rule === "deny") return forbidden();

  const client = createClient();
  let qb: any = client.from(table).update(body);
  try {
    applyPostgrestParams(qb, filterParams(req));
  } catch (e: any) {
    return jsonError(e.message || "Invalid query");
  }
  if (!qb.hasFilters) return jsonError("UPDATE requires a WHERE clause");
  if (qb.embeddedFilterTables().length && !caller.isStaff) return forbidden();
  if (rule) qb.where(rule);
  if (preferReturn(req) || preferSingle(req)) {
    qb = qb.select("*");
  }
  if (preferSingle(req)) qb = qb.single();

  const result = await qb;
  if (result.error) return jsonError(result.error.message || "Update failed", 400);

  return NextResponse.json(result.data, { status: 200, headers: corsHeaders() });
}

async function deleteUnguarded(
  req: NextRequest,
  ctx: { params: Promise<{ table: string }> }
) {
  const g = await guard(req, ctx);
  if (g.error) return g.error;
  const { table, caller } = g;

  const rule = deleteRule(caller, table);
  if (rule === "deny") return forbidden();

  const client = createClient();
  let qb: any = client.from(table).delete();
  try {
    applyPostgrestParams(qb, filterParams(req));
  } catch (e: any) {
    return jsonError(e.message || "Invalid query");
  }
  if (!qb.hasFilters) return jsonError("DELETE requires a WHERE clause");
  if (qb.embeddedFilterTables().length && !caller.isStaff) return forbidden();
  if (rule) qb.where(rule);
  if (preferReturn(req)) {
    qb = qb.select("*");
  }

  const result = await qb;
  if (result.error) return jsonError(result.error.message || "Delete failed", 400);

  return NextResponse.json(result.data ?? null, { status: 200, headers: corsHeaders() });
}

export const GET = guardTable("GET", getUnguarded);
export const POST = guardTable("POST", postUnguarded);
export const PATCH = guardTable("PATCH", patchUnguarded);
export const DELETE = guardTable("DELETE", deleteUnguarded);
