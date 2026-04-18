import asyncio
import os
from dotenv import load_dotenv
import psycopg

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/debtor_alert")
# Convert postgresql+psycopg to postgresql to use raw psycopg without sqlalchemy
url = DATABASE_URL.replace("postgresql+psycopg", "postgresql")

def migrate():
    try:
        with psycopg.connect(url) as conn:
            with conn.cursor() as cur:
                print("Adding manual_days_overdue column...")
                cur.execute("ALTER TABLE invoices ADD COLUMN manual_days_overdue INTEGER;")
                conn.commit()
                print("Migration successful.")
    except Exception as e:
        if 'already exists' in str(e):
            print("Column already exists.")
        else:
            print("Error migrating:", e)

if __name__ == "__main__":
    migrate()
