import psycopg2
import ijson
import os
import json

# local database
DB_CONFIG = {
    "dbname": "steamgames",
    "user": "steamadmin",
    "password": "gobble294#3frank",
    "host": "localhost"
}

JSON_FILE = '/opt/Steam/Data/games.json'

def migrate():
    print("Connecting to PostgreSQL...")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
    except Exception as e:
        print(f"Connection failed: {e}")
        return

    try:
        cur.execute("DROP TABLE IF EXISTS games;")
        cur.execute("""
            CREATE TABLE games (
                id SERIAL PRIMARY KEY,
                steam_id INTEGER UNIQUE,
                name TEXT,
                release_date TEXT,
                tags JSONB,            
                developers JSONB,
                description TEXT,
                price NUMERIC(10, 2),
                header_image TEXT
            );
        """)
        conn.commit()
    except Exception as e:
        print(f"Schema reset failed: {e}")
        conn.close()
        return

    print(f"Streaming data from {JSON_FILE}...")
    
    count = 0
    batch_size = 1000
    batch_data = []

    insert_query = """
        INSERT INTO games 
        (steam_id, name, release_date, tags, developers, description, price, header_image)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (steam_id) DO NOTHING;
    """

    try:
        with open(JSON_FILE, 'rb') as f:
            # kvitems assumes the steam app IDs are the primary keys
            parser = ijson.kvitems(f, "")
            
            for steam_id, game in parser:
                if not game.get('name'):
                    continue

                # populate a row with pulled data.
                row = (
                    int(steam_id),
                    game.get('name'),
                    game.get('release_date', 'TBA'),
                    json.dumps(game.get('tags', [])),
                    json.dumps(game.get('developers', [])),
                    game.get('detailed_description', ''),
                    game.get('price', 0),
                    game.get('header_image', '')
                )
                
                batch_data.append(row)
                count += 1

                if len(batch_data) >= batch_size:
                    cur.executemany(insert_query, batch_data)
                    conn.commit()
                    batch_data = []
                    print(f"\rProcessed {count} games...", end="")

            if batch_data:
                cur.executemany(insert_query, batch_data)
                conn.commit()

        print(f"\nTotal games imported: {count}")

    except Exception as e:
        print(f"\nError during migration: {e}")
    finally:
        if cur: cur.close()
        if conn: conn.close()

if __name__ == "__main__":
    migrate()