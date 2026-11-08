"""Initialize database tables and views from schema.sql, then seed data."""
from __future__ import annotations

import os
from pathlib import Path
from sqlalchemy import text
from app.db import engine
from seed import seed

def init_database():
    schema_path = Path(__file__).parent / "schema.sql"
    print(f"Reading schema from {schema_path}...")
    with open(schema_path, "r", encoding="utf-8") as f:
        sql = f.read()

    print("Connecting to database and executing schema...")
    with engine.begin() as conn:
        # Split statements on semicolons, taking care of comments and empty lines
        statements = []
        current = []
        for line in sql.splitlines():
            line_stripped = line.strip()
            if line_stripped.startswith("--") and not current:
                continue
            current.append(line)
            if line_stripped.endswith(";"):
                statements.append("\n".join(current))
                current = []
        if current and "\n".join(current).strip():
            statements.append("\n".join(current))

        for stmt in statements:
            stmt_clean = stmt.strip()
            if not stmt_clean or stmt_clean.startswith("--"):
                continue
            conn.execute(text(stmt_clean))

    print("✓ All tables and views created successfully!")
    print("Running seed script...")
    seed()
    print("✓ Database initialization and seeding complete!")

if __name__ == "__main__":
    init_database()

