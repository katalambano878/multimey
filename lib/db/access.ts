// Row access rules for the browser-facing /rest/v1 and /storage/v1 shims.
//
// Hosted Supabase enforced these with Postgres RLS. The plain-Postgres port
// runs every query as the database owner with RLS off, so the same rules are
// applied here, per request, before any SQL runs. They mirror the policies in
// supabase/migrations/20260209000000_complete_schema.sql, tightened where the
// original let anyone read guest orders, list coupon codes or publish reviews.

import { query } from "./pool";
import { verifyAccessToken } from "./auth";
import type { RawFilter } from "./supabase-compat";
import { COURSE_PRICE, COURSE_TITLE } from "../course";

export interface Caller {
  userId: string | null;
  role: string | null;
  isStaff: boolean;
  isAdmin: boolean;
}

export const ANON: Caller = { userId: null, role: null, isStaff: false, isAdmin: false };

/** Resolve the caller from `Authorization: Bearer <jwt>`. Role always comes from profiles, never the token. */
export async function resolveCaller(req: Request): Promise<Caller> {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return ANON;
  const verified = await verifyAccessToken(token);
  if (!verified) return ANON;
  const { rows } = await query<{ role: string }>(
    `SELECT role FROM profiles WHERE id = $1 LIMIT 1`,
    [verified.userId]
  );
  const role = rows[0]?.role ?? null;
  return {
    userId: verified.userId,
    role,
    isStaff: role === "admin" || role === "staff",
    isAdmin: role === "admin",
  };
}

type Row = Record<string, any>;

/** What a read is allowed to see: everything, nothing, or rows matching a condition. */
type ReadRule = RawFilter | null | "deny";

interface ReadContext {
  /** True when the request pins `col` to one exact value. */
  pinned(col: string): boolean;
}

interface TablePolicy {
  read?: (c: Caller, q: ReadContext) => ReadRule;
  /** Parent tables whose rows were already authorized; embeds below them skip `read`. */
  embedParents?: string[];
  /** Condition that still applies when embedded below an authorized parent. */
  embedRead?: (c: Caller) => ReadRule;
  /** Validate and normalize a row before insert. Returns an error message to refuse. */
  insert?: (c: Caller, row: Row) => Promise<string | null> | string | null;
  /** Rows the caller may update, plus columns they may not change. */
  update?: (c: Caller) => { rows: ReadRule; locked?: string[] };
  delete?: (c: Caller) => ReadRule;
}

const raw = (build: RawFilter["build"]): RawFilter => ({ build });

const always: ReadRule = null;

function own(col = "user_id") {
  return (c: Caller): ReadRule =>
    c.userId ? raw((p) => `"${col}" = ${p(c.userId)}`) : "deny";
}

function ownVia(fkCol: string, parent: string, parentUserCol = "user_id") {
  return (c: Caller): ReadRule =>
    c.userId
      ? raw((p) => `"${fkCol}" IN (SELECT id FROM "${parent}" WHERE "${parentUserCol}" = ${p(c.userId)})`)
      : "deny";
}

function setOwner(c: Caller, row: Row, col = "user_id"): string | null {
  if (!c.userId) return "Sign in first.";
  if (row[col] != null && row[col] !== c.userId) return "You can only add your own records.";
  row[col] = c.userId;
  return null;
}

async function ownsRow(table: string, id: unknown, userId: string, userCol = "user_id"): Promise<boolean> {
  if (typeof id !== "string" || !id) return false;
  const { rows } = await query(
    `SELECT 1 FROM "${table}" WHERE id::text = $1 AND "${userCol}" = $2 LIMIT 1`,
    [id, userId]
  );
  return rows.length > 0;
}

const ownAll = (col = "user_id"): TablePolicy => ({
  read: own(col),
  insert: (c, row) => setOwner(c, row, col),
  update: (c) => ({ rows: own(col)(c), locked: [col] }),
  delete: own(col),
});

const publicRead: TablePolicy = { read: () => always };

const POLICIES: Record<string, TablePolicy> = {
  categories: publicRead,
  product_images: { read: () => always },
  product_variants: { read: () => always },
  // Integration keys saved from admin Settings must never reach the storefront.
  store_settings: {
    read: () =>
      raw(() => `key NOT LIKE 'integration\\_%' AND key !~* '(secret|api_?key|token|password)'`),
  },
  site_settings: publicRead,
  pages: publicRead,
  store_modules: publicRead,
  navigation_menus: publicRead,

  products: { read: () => raw(() => `status = 'active'`) },
  blog_posts: { read: () => raw(() => `status = 'published'`) },
  cms_content: { read: () => raw(() => `is_active = true`) },
  banners: { read: () => raw(() => `is_active = true`) },
  navigation_items: { read: () => raw(() => `is_active = true`) },

  // Coupons are looked up by code, never listed.
  coupons: { read: (_c, q) => (q.pinned("code") ? raw(() => `is_active = true`) : "deny") },

  reviews: {
    read: (c) =>
      c.userId
        ? raw((p) => `(status = 'approved' OR user_id = ${p(c.userId)})`)
        : raw(() => `status = 'approved'`),
    insert: async (c, row) => {
      const err = setOwner(c, row);
      if (err) return err;
      row.status = "pending";
      row.helpful_votes = 0;
      // "Verified purchase" only when this account has a paid order containing the product.
      const { rows } = await query(
        `SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.user_id = $1 AND o.payment_status = 'paid' AND oi.product_id::text = $2 LIMIT 1`,
        [c.userId, String(row.product_id || "")]
      );
      row.verified_purchase = rows.length > 0;
      return null;
    },
    update: (c) => ({
      rows: own()(c),
      locked: ["user_id", "product_id", "status", "verified_purchase", "helpful_votes"],
    }),
  },
  review_images: {
    read: (c) =>
      raw((p) =>
        c.userId
          ? `review_id IN (SELECT id FROM reviews WHERE status = 'approved' OR user_id = ${p(c.userId)})`
          : `review_id IN (SELECT id FROM reviews WHERE status = 'approved')`
      ),
    embedParents: ["reviews"],
  },

  profiles: {
    read: own("id"),
    update: (c) => ({ rows: own("id")(c), locked: ["id", "role", "email", "created_at"] }),
  },

  addresses: ownAll(),
  cart_items: ownAll(),
  wishlist_items: ownAll(),
  notifications: ownAll(),

  // Orders are created by /api/orders. Guests reach one order by its exact number or id.
  orders: {
    read: (c, q) => {
      const single = q.pinned("order_number") || q.pinned("id");
      if (c.userId) {
        return single
          ? raw((p) => `(user_id = ${p(c.userId)} OR user_id IS NULL)`)
          : raw((p) => `user_id = ${p(c.userId)}`);
      }
      return single ? raw(() => `user_id IS NULL`) : "deny";
    },
  },
  order_items: { read: ownVia("order_id", "orders"), embedParents: ["orders"] },
  order_status_history: { read: ownVia("order_id", "orders"), embedParents: ["orders"] },

  support_tickets: {
    ...ownAll(),
    insert: (c, row) => {
      const err = setOwner(c, row);
      if (err) return err;
      delete row.assigned_to;
      row.status = "open";
      return null;
    },
    update: (c) => ({ rows: own()(c), locked: ["user_id", "assigned_to", "priority", "ticket_number"] }),
    delete: () => "deny",
  },
  support_messages: {
    read: (c) =>
      c.userId
        ? raw((p) => `is_internal IS NOT TRUE AND ticket_id IN (SELECT id FROM support_tickets WHERE user_id = ${p(c.userId)})`)
        : "deny",
    embedParents: ["support_tickets"],
    embedRead: () => raw(() => `is_internal IS NOT TRUE`),
    insert: async (c, row) => {
      const err = setOwner(c, row);
      if (err) return err;
      if (!(await ownsRow("support_tickets", row.ticket_id, c.userId!))) return "Ticket not found.";
      row.is_internal = false;
      return null;
    },
  },

  return_requests: {
    read: own(),
    insert: async (c, row) => {
      const err = setOwner(c, row);
      if (err) return err;
      if (!(await ownsRow("orders", row.order_id, c.userId!))) return "Order not found.";
      row.status = "pending";
      row.refund_amount = null;
      delete row.admin_notes;
      return null;
    },
  },
  return_items: {
    read: ownVia("return_request_id", "return_requests"),
    embedParents: ["return_requests"],
    insert: async (c, row) => {
      if (!c.userId) return "Sign in first.";
      if (!(await ownsRow("return_requests", row.return_request_id, c.userId))) {
        return "Return request not found.";
      }
      return null;
    },
  },

  // Public sign-up form; price and status are fixed here, not by the browser.
  course_registrations: {
    insert: (_c, row) => {
      row.amount = COURSE_PRICE;
      row.course_title = COURSE_TITLE;
      row.payment_status = "pending";
      delete row.payment_reference;
      return null;
    },
  },
};

function policyFor(table: string): TablePolicy {
  return POLICIES[table] || {};
}

export function readRule(c: Caller, table: string, q: ReadContext): ReadRule {
  if (c.isStaff) return always;
  const read = policyFor(table).read;
  return read ? read(c, q) : "deny";
}

/** Rule for rows of `table` embedded below `parent` in a select. */
export function embedRule(c: Caller, table: string, parent: string): ReadRule {
  if (c.isStaff) return always;
  const policy = policyFor(table);
  if (policy.embedParents?.includes(parent)) {
    return policy.embedRead ? policy.embedRead(c) : always;
  }
  // Embeds can't pin a row, so tables that need an exact lookup stay hidden.
  return readRule(c, table, { pinned: () => false });
}

export async function checkInsert(c: Caller, table: string, rows: Row[]): Promise<string | null> {
  if (c.isStaff && ADMIN_ONLY_WRITES.has(table) && !c.isAdmin) return "Only an admin can change this.";
  if (c.isStaff) return null;
  const insert = policyFor(table).insert;
  if (!insert) return "You don't have permission to add these records.";
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return "Invalid row.";
    const err = await insert(c, row);
    if (err) return err;
  }
  return null;
}

// Tables only an admin (not staff) may change.
const ADMIN_ONLY_WRITES = new Set(["store_modules"]);

export function updateRule(
  c: Caller,
  table: string,
  patch: Row
): { rows: ReadRule; error?: string } {
  if (c.isStaff && ADMIN_ONLY_WRITES.has(table) && !c.isAdmin) {
    return { rows: "deny", error: "Only an admin can change this." };
  }
  if (c.isStaff) {
    // Only admins may hand out roles.
    if (table === "profiles" && "role" in patch && !c.isAdmin) {
      return { rows: "deny", error: "Only an admin can change roles." };
    }
    return { rows: always };
  }
  const update = policyFor(table).update;
  if (!update) return { rows: "deny", error: "You don't have permission to change these records." };
  const { rows, locked = [] } = update(c);
  const blocked = Object.keys(patch).filter((k) => locked.includes(k));
  if (blocked.length) {
    return { rows: "deny", error: `You can't change: ${blocked.join(", ")}.` };
  }
  return { rows };
}

export function deleteRule(c: Caller, table: string): ReadRule {
  if (c.isStaff && ADMIN_ONLY_WRITES.has(table) && !c.isAdmin) return "deny";
  if (c.isStaff) return always;
  const del = policyFor(table).delete;
  return del ? del(c) : "deny";
}

/** RPCs the browser may call, and who may call them. */
export function rpcAllowed(c: Caller, fn: string): boolean {
  const staffOnly = new Set([
    "upsert_customer_from_order",
    "mark_order_paid",
    "update_customer_stats",
    "reduce_stock_on_order",
    "restock_order",
    "get_all_customer_emails",
    "get_all_customer_phones",
  ]);
  if (staffOnly.has(fn)) return c.isStaff;
  if (fn === "is_admin_or_staff") return true;
  return false;
}

/** Buckets served by /storage/v1. Uploads and deletes are staff-only, as in the original storage policies. */
export const STORAGE_BUCKETS = new Set(["products", "media", "site-assets"]);
