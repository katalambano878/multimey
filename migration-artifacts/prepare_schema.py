#!/usr/bin/env python3
"""Prepare Supabase schema SQL for plain Postgres staging restore (MultiMey Supplies)."""
from pathlib import Path
import re

root = Path(__file__).resolve().parent.parent
src_main = root / "supabase/migrations/20260209000000_complete_schema.sql"
src_course = root / "supabase/migrations/20260304000000_course_registrations.sql"
out = root / "migration-artifacts/dumps/schema_plain.sql"

text = src_main.read_text() + "\n\n" + src_course.read_text()


def extract_functions(s: str):
    pattern = re.compile(
        r"CREATE\s+OR\s+REPLACE\s+FUNCTION[\s\S]*?\$\$;",
        re.IGNORECASE,
    )
    blocks = pattern.findall(s)
    cleaned = pattern.sub("\n-- (function moved to end)\n", s)
    return cleaned, blocks


header = """
-- Plain Postgres adapted schema (staging) — MultiMey Supplies
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS \"pgcrypto\" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS \"pgcrypto\" WITH SCHEMA public;
"""

text = re.sub(
    r'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;',
    "-- extension handled in header",
    text,
)

body, funcs = extract_functions(text)

# Replace uuid_generate_v4 with gen_random_uuid for plain Postgres
body = body.replace("extensions.uuid_generate_v4()", "gen_random_uuid()")
body = body.replace("extensions.gen_random_uuid()", "gen_random_uuid()")
body = body.replace("uuid_generate_v4()", "gen_random_uuid()")
for i, fn in enumerate(funcs):
    fn = fn.replace("extensions.uuid_generate_v4()", "gen_random_uuid()")
    fn = fn.replace("extensions.gen_random_uuid()", "gen_random_uuid()")
    funcs[i] = fn.replace("uuid_generate_v4()", "gen_random_uuid()")

final = (
    header
    + "\n"
    + body
    + "\n-- ===== FUNCTIONS (after tables) =====\n"
    + "\n\n".join(funcs)
)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(final)
print(f"Wrote {out} ({len(final)} bytes, {len(funcs)} functions)")
