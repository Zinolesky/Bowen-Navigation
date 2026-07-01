import psycopg
import os
from decouple import config

# Read from .env
db_name = config('POSTGRES_DB', default='bowen_navigator')
db_user = config('POSTGRES_USER', default='postgres')
db_password = config('POSTGRES_PASSWORD', default='')
db_host = config('POSTGRES_HOST', default='127.0.0.1')
db_port = config('POSTGRES_PORT', default='5432')

print(f"Connecting to database {db_name} as {db_user}...")

try:
    conn = psycopg.connect(
        dbname=db_name,
        user=db_user,
        password=db_password,
        host=db_host,
        port=db_port,
        autocommit=True
    )
    
    with conn.cursor() as cur:
        print("Dropping the public schema to completely reset the database...")
        cur.execute("DROP SCHEMA public CASCADE;")
        cur.execute("CREATE SCHEMA public;")
        cur.execute("GRANT ALL ON SCHEMA public TO public;")
        
    print("Database reset successfully! You can now run 'python manage.py migrate' cleanly.")
    conn.close()
except Exception as e:
    print("Error:", e)
