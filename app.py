from flask import Flask, jsonify, request
from flask_cors import CORS
import psycopg2
import psycopg2.extras
import requests
import os
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)
CORS(app) 

DB_CONFIG = {
    "dbname": "steamgames",
    "user": "steamadmin",
    "password": "gobble294#3frank",
    "host": "localhost"
}

# unrolls DB_CONFIG and returns the psycopg2 connection
# used for querying or updating the database
# NOTE: Not sure if the database is going to be updateable from the frontend, we'll see
def get_db_connection():
    return psycopg2.connect(**DB_CONFIG)

# turns vanityURLs into SteamIDs
def resolve_steam_identifier(input_id, api_key):
    # if it's a 17 digit number, return and use it
    if input_id.isdigit() and len(input_id) == 17:
        return input_id
    # if it's a 'vanity url' resolve it as such
    try:
        url = "http://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/"
        params = {'key': api_key, 'vanityurl': input_id}
        resp = requests.get(url, params=params)
        data = resp.json()
        # steam returns `success` as `1` if found.
        if data.get('response', {}).get('success') == 1:
            return data['response']['steamid']
    except Exception as e:
        print(f"Error resolving Vanity URL: {e}")
    return None

# get the status of the backend/server
@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({"status": "online", "backend": "Flask"}) # if the server sees this, it's online

# 
@app.route('/api/user', methods=['GET'])
def get_user_summary():
    raw_input = request.args.get('steamid') # could be a vanityURL or SteamID
    api_key = os.getenv('STEAM_API_KEY')
    
    if not raw_input or not api_key:
        return jsonify({"error": "Missing params"}), 400

    # try resolving the ID
    # NOTE: resolve_steam_identifier will detect if it's already a SteamID, and just return it immediately.
    resolved_id = resolve_steam_identifier(raw_input, api_key)
    if not resolved_id:
        return jsonify({"error": "User not found or private"}), 404

    try:
        # makes the API call
        url = "http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/"
        params = {'key': api_key, 'steamids': resolved_id}
        
        response = requests.get(url, params=params)
        response.raise_for_status()
        # if the players field is there- there is a valid user summary
        data = response.json()
        players = data.get('response', {}).get('players', [])
        
        if players:
            return jsonify(players[0])
        else:
            return jsonify({"error": "User not found"}), 404

    except Exception as e:
        return jsonify({"error": str(e)}), 500
        
# from a users steamID, grab their friends list in the form of SteamIDs
# NOTE: the 'GET' request method will contain the steam_id in its request args
@app.route('/api/friends', methods=['GET'])
def get_friends():
    steam_id = request.args.get('steamid') #grabbed from the submission box on the client
    api_key = os.getenv('STEAM_API_KEY')
    
    if not steam_id or not api_key:
        return jsonify({"error": "Missing params"}), 400

    try:
        # get list of friends steamIDs
        friend_url = "http://api.steampowered.com/ISteamUser/GetFriendList/v0001/"
        friend_params = {'key': api_key, 'steamid': steam_id, 'relationship': 'friend'}
        
        friend_res = requests.get(friend_url, params=friend_params)
        friend_res.raise_for_status()
        friend_data = friend_res.json()
        friends_list = friend_data.get('friendslist', {}).get('friends', [])
        if not friends_list:
            return jsonify([])

        # extract steamIDs then batch fetch their summaries
        # Note: We limit to the first 50 friends pulled to avoid rate limiting.
        # FIXME: This may be able to update to all of a users friends using some pause / timer
        friend_ids = [f['steamid'] for f in friends_list[:50]]
        ids_comma_separated = ','.join(friend_ids)
        
        summary_url = "http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/"
        summary_params = {'key': api_key, 'steamids': ids_comma_separated}
        summary_res = requests.get(summary_url, params=summary_params)
        summary_res.raise_for_status()
        summary_data = summary_res.json()
        
        players = summary_data.get('response', {}).get('players', [])
        return jsonify(players)

    except Exception as e:
        print(f"Error fetching friends: {e}")
        return jsonify({"error": "Failed to fetch friends. Profile might be private."}), 500

# get all the games a user owns
# Note: the 'GET' request method will contain the steam_id in its request args
@app.route('/api/games', methods=['GET'])
def get_games():
    raw_input = request.args.get('steamid') #grabbed from the submission box on the client
    
    # first, see if the steamID was provided (USER LIBRARY LOOKUP)
    if raw_input:
        api_key = os.getenv('STEAM_API_KEY')
        if not api_key:
            return jsonify({"error": "Server missing STEAM_API_KEY"}), 500
        # resolve their id
        resolved_id = resolve_steam_identifier(raw_input, api_key)
        if not resolved_id:
            return jsonify({"error": "User not found"}), 404
        # make the API call
        try:
            url = "http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/"
            params = {
                'key': api_key,
                'steamid': resolved_id,
                'include_appinfo': 1,
                'include_played_free_games': 1,
                'format': 'json'
            }
            response = requests.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            # if the API call was successful, we'll grab the list of games from the users library
            games_list = data.get('response', {}).get('games', []) 

            # attach the tags, descriptions, and prices
            if games_list:
                # get the app ids of the games
                app_ids = [g['appid'] for g in games_list]
                conn = get_db_connection()
                cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                try:
                    # ask the db for tags, description, and price
                    # uses Postgres ANY() for array matching
                    cur.execute("SELECT steam_id, tags, description, price FROM games WHERE steam_id = ANY(%s)", (app_ids,))
                    local_data = cur.fetchall()
                    
                    # create lookup maps
                    tag_map = {item['steam_id']: item['tags'] for item in local_data}
                    desc_map = {item['steam_id']: item['description'] for item in local_data}
                    price_map = {item['steam_id']: item['price'] for item in local_data}
                    
                    # attach data to the steam game objects
                    for game in games_list:
                        gid = game['appid']
                        game['tags'] = tag_map.get(gid, [])
                        game['description'] = desc_map.get(gid, "")
                        game['price'] = price_map.get(gid, "")
                        
                except Exception as db_err:
                    print(f"Database Enrichment Error: {db_err}")
                finally:
                    cur.close()
                    conn.close()

            return jsonify(games_list)
        except Exception as e:
            return jsonify({"error": "Failed to fetch from Steam API"}), 502

    # second, if no steamID was provided...
    else:
        # check for a single provided appid  (Used by Console on frontend)
        search_id = request.args.get('appid')
        if search_id:
            conn = get_db_connection()
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            try:
                cur.execute("""
                    SELECT steam_id as appid, name, price, description, tags 
                    FROM games 
                    WHERE steam_id = %s
                """, (search_id,))
                game = cur.fetchone()
                
                if game:
                    return jsonify([game]) # return as a list
                else:
                    return jsonify({"error": "Game not found in database"}), 404
            except Exception as e:
                return jsonify({"error": str(e)}), 500
            finally:
                cur.close()
                conn.close()

        limit = request.args.get('limit', 10)
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        try:
            cur.execute("""
                SELECT steam_id as appid, name, price, header_image, description, tags 
                FROM games 
                ORDER BY RANDOM() 
                LIMIT %s;
            """, (limit,))
            games = cur.fetchall()
            return jsonify(games)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
        finally:
            cur.close()
            conn.close()
            
@app.route('/', methods=['GET'])
def index():
    """Quick landing page for the API."""
    return '''<!DOCTYPE html>
    <html><head>
        <title>API Service</title>
        <style>
                body { background: #000; color: #0f0; font-family: monospace; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; flex-direction: column; }
        h1 { font-size: 2em; text-shadow: 0 0 10px #0f0; margin-bottom: 10px; }
        a { color: #00f; font-size: 2em; text-shadow: 0 0 10px #00f; margin-bottom: 10px; text-decoration: none; }
        a:hover { text-decoration: underline; }
        </style>
    </head>
    <body>
        <h1>OpenValve Backend</h1>
        <a href="https://github.com/JonFRutan/OpenValve">GitHub Link</a>
    </body></html>'''

if __name__ == '__main__':
    app.run(debug=True, port=5000)
