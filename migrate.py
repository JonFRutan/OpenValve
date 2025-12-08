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
                estimated_owners TEXT,
                peak_ccu INTEGER,
                required_age INTEGER,
                price NUMERIC(10, 2),
                dlc_count INTEGER,
                description TEXT,
                short_description TEXT,
                languages TEXT,
                header_image TEXT,
                website TEXT,
                support_windows BOOLEAN,
                support_mac BOOLEAN,
                support_linux BOOLEAN,
                user_score INTEGER,
                positive INTEGER,
                negative INTEGER,
                score_rank TEXT,
                achievements INTEGER,
                recommendations INTEGER,
                notes TEXT,
                average_playtime_forever INTEGER,
                average_playtime_2weeks INTEGER,
                median_playtime_forever INTEGER,
                median_playtime_2weeks INTEGER,
                developers JSONB,
                publishers JSONB,
                categories JSONB,
                genres JSONB,
                tags JSONB
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
        INSERT INTO games (
            steam_id, name, release_date, estimated_owners, peak_ccu, required_age, 
            price, dlc_count, description, short_description, languages, header_image, 
            website, support_windows, support_mac, support_linux, user_score, positive, 
            negative, score_rank, achievements, recommendations, notes, 
            average_playtime_forever, average_playtime_2weeks, median_playtime_forever, 
            median_playtime_2weeks, developers, publishers, categories, genres, tags
        )
        VALUES (
            %s, %s, %s, %s, %s, %s, 
            %s, %s, %s, %s, %s, %s, 
            %s, %s, %s, %s, %s, %s, 
            %s, %s, %s, %s, %s, 
            %s, %s, %s, 
            %s, %s, %s, %s, %s, %s
        )
        ON CONFLICT (steam_id) DO NOTHING;
    """

    try:
        with open(JSON_FILE, 'rb') as f:
            # kvitems assumes the steam app IDs are the primary keys
            parser = ijson.kvitems(f, "")
            
            for steam_id, game in parser:
                if not game.get('name'):
                    continue

                # populate row with data, using safe defaults (.get) for every field
                row = (
                    int(steam_id),
                    game.get('name'),
                    game.get('release_date', 'TBA'),
                    game.get('estimated_owners', ''),
                    game.get('peak_ccu', 0),
                    game.get('required_age', 0),
                    game.get('price', 0.0),
                    game.get('dlc_count', 0),
                    game.get('detailed_description', ''),
                    game.get('short_description', ''),
                    game.get('supported_languages', ''),
                    game.get('header_image', ''),
                    game.get('website', ''),
                    game.get('windows', False),
                    game.get('mac', False),
                    game.get('linux', False),
                    game.get('user_score', 0),
                    game.get('positive', 0),
                    game.get('negative', 0),
                    game.get('score_rank', ''),
                    game.get('achievements', 0),
                    game.get('recommendations', 0),
                    game.get('notes', ''),
                    game.get('average_playtime_forever', 0),
                    game.get('average_playtime_2weeks', 0),
                    game.get('median_playtime_forever', 0),
                    game.get('median_playtime_2weeks', 0),
                    json.dumps(game.get('developers', [])),
                    json.dumps(game.get('publishers', [])),
                    json.dumps(game.get('categories', [])),
                    json.dumps(game.get('genres', [])),
                    json.dumps(game.get('tags', []))
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