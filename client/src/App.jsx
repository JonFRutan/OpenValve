import { useState, useRef, useEffect, useMemo } from 'react';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis 
} from 'recharts';
import './App.css';

function App() {
  // active trackers for views and tabs
  const [activeMenu, setActiveMenu] = useState('View');
  const [activeTab, setActiveTab] = useState('User');
  // users, libraries, and games
  const [users, setUsers] = useState([]);                   
  const [library, setLibrary] = useState([]);               
  const [rawUserGames, setRawUserGames] = useState({});     
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  
  const [steamIdInput, setSteamIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // graph States
  const [graphMode, setGraphMode] = useState('bar'); // bar, pie, radar
  const [graphSource, setGraphSource] = useState('Tags'); // tags, genres, categories

  // console states
  const [consoleHistory, setConsoleHistory] = useState([
    "OpenValve Console Started",
    "Type 'help' for commands."
  ]);
  const [consoleInput, setConsoleInput] = useState('');
  const consoleEndRef = useRef(null);

  const tabs = ['Graph', 'Library', 'User', 'Console'];

  const COLORS = ['#95a92f', '#d8d69f', '#777976', '#c8c8c8', '#af9449', '#6e7d64', '#aeb5a8'];

  useEffect(() => {
    if (activeTab === 'Console' && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleHistory, activeTab]);

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  // Helper to interpret Steam's personastate integer
  const getPersonaStateLabel = (stateCode, gameExtraInfo) => {
    if (gameExtraInfo) return `Playing: ${gameExtraInfo}`;
    switch(stateCode) {
      case 0: return 'Offline';
      case 1: return 'Online';
      case 2: return 'Busy';
      case 3: return 'Away';
      case 4: return 'Snooze';
      case 5: return 'Looking to Trade';
      case 6: return 'Looking to Play';
      default: return 'Online';
    }
  };

  const getPersonaStateClass = (stateCode, gameExtraInfo) => {
    if (gameExtraInfo) return 'user-status-ingame';
    if (stateCode === 0) return 'user-status-offline';
    return 'user-status-online';
  };

// combines all the users libraries into one collection to be displayed on the 'Library' tab
  const mergeLibrary = (currentLibrary, newGames, ownerName) => {
    const gameMap = new Map();
    currentLibrary.forEach(g => {
      gameMap.set(g.appid, { ...g, owners: [...g.owners] });
    });

    newGames.forEach(game => {
      if (gameMap.has(game.appid)) {
        const existingGame = gameMap.get(game.appid);
        if (!existingGame.owners.includes(ownerName)) {
          existingGame.owners.push(ownerName);
        }
        // merge metadata if missing
        if (!existingGame.tags && game.tags) existingGame.tags = game.tags;
        if (!existingGame.genres && game.genres) existingGame.genres = game.genres;
        if (!existingGame.categories && game.categories) existingGame.categories = game.categories;
        if (!existingGame.description && game.description) existingGame.description = game.description;
        if (!existingGame.price && game.price) existingGame.price = game.price;
        if (!existingGame.release_date && game.release_date) existingGame.release_date = game.release_date;
        if (!existingGame.userScore && game.userScore) existingGame.userScore = game.userScore;
      } else {
        gameMap.set(game.appid, { ...game, owners: [ownerName] });
      }
    });

    return Array.from(gameMap.values());
  };

  // adding a new user to the 'users' array, and including their games into the steam library
  const handleAddUser = async (e) => {
    e.preventDefault(); //prevents page reload
    if (!steamIdInput) return;

    setLoading(true);
    setError('');

    // hit the flask servers API (app.py) for resolving an account
    try {
      // first try hitting for games
      const gameRes = await fetch(`http://localhost:5000/api/games?steamid=${steamIdInput}`);
      if (!gameRes.ok) throw new Error(`User not found or Private Profile`);
      const gameData = await gameRes.json();
      // then try hitting for profile.
      const userRes = await fetch(`http://localhost:5000/api/user?steamid=${steamIdInput}`);
      if (!userRes.ok) throw new Error(`User profile fetch failed`);
      const userProfile = await userRes.json();
      // prevent a user from being added twice.
      if (users.some(u => u.steamid === userProfile.steamid)) {
        throw new Error("User already added.");
      }

      if (Array.isArray(gameData)) {
        // NOTE: `...` is essentially 'unrolling' the array for it's values.
        // meaning here we assign the 'newUsers' array as all the previous users from 'users' and include the new userProfile
        const newUsers = [...users, userProfile];
        setUsers(newUsers);
        // similar to last block, 'rawUserGames' is the list of all users games, this is simply updated to include the new users games.
        const newRawGames = { ...rawUserGames, [userProfile.steamid]: gameData };
        setRawUserGames(newRawGames);
        // 
        const updatedLibrary = mergeLibrary(library, gameData, userProfile.personaname);
        updatedLibrary.sort((a, b) => a.name.localeCompare(b.name));
        // change the library to be the new updated library, including the new users games.
        setLibrary(updatedLibrary);
        setSteamIdInput('');
      }
    } catch (err) {
      console.error("ADD USER ERROR:", err);
      setError(err.message || 'Error adding user.');
    } finally {
      setLoading(false);
    }
  };

  // adding all of a currently added users friends.
  // works iff the user has a public profile AND has their friends visible.
  const handleAddFriends = async (steamid) => {
    try {
      console.log(`Fetching friends for ${steamid}...`);
      const res = await fetch(`http://localhost:5000/api/friends?steamid=${steamid}`);
      if (!res.ok) throw new Error("Could not fetch friends list");
      // fetch the friends list from the flask API
      const friendsData = await res.json();
      // they actually need to have friends
      if (Array.isArray(friendsData) && friendsData.length > 0) {
        // confusing mess, essentially it checks the users friends against the already added steam ids to avoid repeated usesrs
        // uses '.filter' to do this
        const newFriends = friendsData.filter(f => !users.some(u => u.steamid === f.steamid));
        if (newFriends.length === 0) {
          alert("All public friends from this user are already added.");
          return;
        }
        //
        setUsers(prev => [...prev, ...newFriends]);

        let currentLib = [...library];
        let currentRaw = { ...rawUserGames };
        // for every new user found in the friends of a current user...
        for (const friend of newFriends) {
          try {
            // grab their games
            const gameRes = await fetch(`http://localhost:5000/api/games?steamid=${friend.steamid}`);
            if (gameRes.ok) {
              const games = await gameRes.json();
              if (Array.isArray(games)) {
                currentRaw[friend.steamid] = games;
                currentLib = mergeLibrary(currentLib, games, friend.personaname);
              } else {
                currentRaw[friend.steamid] = null;
              }
            } else {
              currentRaw[friend.steamid] = null;
            }
          } catch (e) {
            console.warn(`Failed to fetch games for ${friend.personaname}`, e);
            currentRaw[friend.steamid] = null;
          }
          setRawUserGames({ ...currentRaw });
          const sortedLib = [...currentLib].sort((a, b) => a.name.localeCompare(b.name));
          setLibrary(sortedLib);
        }

      } else {
        alert("No friends found."); // mfw :(
      }

    } catch (err) {
      console.error(err);
      alert("Failed to add friends. Profile might be private.");
    }
  };
  // when you click the 'X' on a user card, remove their profile from the user cards, and remove their games from the library/
  const handleRemoveUser = (steamidToRemove) => {
    // remainingUsers is the list of users with the usersID filtered out from it, then call setUsers again to update the users list without them
    const remainingUsers = users.filter(u => u.steamid !== steamidToRemove);
    setUsers(remainingUsers);
    // to get the newRawGames, we grab the rawUserGames array, and delete the instance of the users steamId that appear within it.
    // then call setRawUserGames to update the array.
    const newRawGames = { ...rawUserGames };
    delete newRawGames[steamidToRemove];
    setRawUserGames(newRawGames);

    let rebuiltLib = [];
    remainingUsers.forEach(u => {
      const g = Array.isArray(newRawGames[u.steamid]) ? newRawGames[u.steamid] : [];
      rebuiltLib = mergeLibrary(rebuiltLib, g, u.personaname);
    });

    rebuiltLib.sort((a, b) => a.name.localeCompare(b.name));
    setLibrary(rebuiltLib);
  };

  const renderGameCount = (id) => {
    const games = rawUserGames[id];
    if (games === undefined) return <span style={{ color: '#888' }}>...</span>;
    if (games === null) return <span style={{ color: '#888' }}>N/A</span>;
    if (games.length === 0) return <span style={{ color: '#888' }}>N/A</span>;
    return <span style={{ color: '#95a92f' }}>{games.length}</span>;
  };

// helper for the 'search' command
  const handleConsoleSearch = async (appid) => {
    setConsoleHistory(prev => [...prev, `Searching database for AppID: ${appid}...`]);
    
    try {
      const res = await fetch(`http://localhost:5000/api/games?appid=${appid}`);
      const data = await res.json();

      if (res.ok && data.length > 0) {
        const game = data[0];
        const output = [
          `STATUS: FOUND [200 OK]`,
          `----------------------------------------`,
          `ID:    ${game.appid}`,
          `NAME:  ${game.name}`,
          `PRICE: ${parseFloat(game.price) === 0 ? 'FREE' : '$' + game.price}`,
          `TAGS:  ${game.tags ? Object.keys(game.tags).join(', ') : 'None'}`,
          `DESC:  ${game.description ? game.description.substring(0, 100) + '...' : 'No description'}`,
          `----------------------------------------`
        ];
        setConsoleHistory(prev => [...prev, ...output]);
      } else {
        setConsoleHistory(prev => [...prev, `ERROR: ${data.error || 'Game not found.'}`]);
      }
    } catch (err) {
      setConsoleHistory(prev => [...prev, `NETWORK ERROR: ${err.message}`]);
    }
  };

  // helper for 'sql' command
  const handleConsoleSQL = async (query) => {
     setConsoleHistory(prev => [...prev, `Executing SQL: ${query}...`]);

     try {
        const res = await fetch('http://localhost:5000/api/console/sql', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ query: query })
        });
        
        const data = await res.json();

        if (res.ok) {
           // Basic formatting for the resulting JSON list
           const formatted = JSON.stringify(data, null, 2).split('\n');
           const output = ["STATUS: SUCCESS [200 OK]", ...formatted];
           setConsoleHistory(prev => [...prev, ...output]);
        } else {
           setConsoleHistory(prev => [...prev, `SQL ERROR: ${data.error}`]);
        }

     } catch (err) {
        setConsoleHistory(prev => [...prev, `NETWORK ERROR: ${err.message}`]);
     }
  }

  // handles when the user clicks submit in the console
  const handleConsoleSubmit = async (e) => {
    e.preventDefault();
    const input = consoleInput.trim();
    if (!input) return;

    // echo the users input
    setConsoleHistory(prev => [...prev, `] ${input}`]);
    setConsoleInput('');

    // parsing the command
    const parts = input.split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    let output = [];

    switch (command) {
      case 'help':
        output = [
          "OPENVALVE CONSOLE v1.0",
          "----------------------",
          "help           : Displays this list of commands.",
          "search <appid> : Fetches game data from the DB by Steam App ID.",
          "sql \"<query>\"  : Executes a read-only SQL query against the database.",
          "gpt <prompt>   : [NOT IMPLEMENTED]"
        ];
        break;

      case 'sql':
        // use regex to capture content inside quotes
        // sql "select * from games"
        const match = input.match(/^sql\s+"([^"]+)"$/i);
        if (!match) {
            output = ["Usage: sql \"select * from games where price = 0\""];
        } else {
            // we return here because handleConsoleSQL is async and handles its own output
            await handleConsoleSQL(match[1]);
            return; 
        }
        break;

      case 'gpt':
        output = ["System.NotImplementedException: AI module not connected."];
        break;

      case 'search':
        if (args.length === 0) {
          output = ["Usage: search <appid> (e.g., 'search 440')"];
        } else {
          await handleConsoleSearch(args[0]);
          return; 
        }
        break;

      default:
        output = [`Unknown command: '${command}'. Type 'help' for valid commands.`];
    }

    if (output.length > 0) {
      setConsoleHistory(prev => [...prev, ...output]);
    }
  };

// graph data calculations
  const graphData = useMemo(() => {
    if (library.length === 0) return [];

    const counts = {};
    const sourceKey = graphSource.toLowerCase(); // 'tags', 'genres', 'categories'

    library.forEach(game => {
      let rawData = game[sourceKey];
      let itemsList = [];

      //nNormalize data (handle objects, arrays, or dicts)
      if (rawData) {
        if (Array.isArray(rawData)) {
          // arrays (e.g. Genres: ["Action", "Indie"] or [{id:1, description:"Action"}])
          rawData.forEach(item => {
            if (typeof item === 'string') itemsList.push(item);
            else if (typeof item === 'object' && item.description) itemsList.push(item.description);
          });
        } else if (typeof rawData === 'object') {
          // dictionary (e.g. Tags: {"FPS": 100, "Action": 50})
          itemsList = Object.keys(rawData);
        }
      }

      if (itemsList.length === 0) {
        // only use 'Uncategorized' if looking at Tags, otherwise ignore
        if (sourceKey === 'tags') itemsList = ['Uncategorized'];
      }

      itemsList.forEach(item => {
        counts[item] = (counts[item] || 0) + 1;
      });
    });

    // only use tags found in AT LEAST 15% of games, and genres found in AT LEAST 5% of games.
    const threshold = library.length * (graphSource === 'Tags' ? 0.15 : 0.05); 

    return Object.keys(counts)
      .map(key => ({ name: key, value: counts[key] }))
      .filter(item => item.value >= threshold)
      .sort((a, b) => b.value - a.value);
  }, [library, graphSource]);


  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="graph-tooltip">
          <p>{`${payload[0].name}: ${payload[0].value}`}</p>
        </div>
      );
    }
    return null;
  };

  const handleGameClick = (game) => {
    setSelectedGame(game);
  }

  const closeGameModal = () => {
    setSelectedGame(null);
  }
  
  // NEW: User Modal Handlers
  const handleUserClick = (user) => {
    setSelectedUser(user);
  }

  const closeUserModal = () => {
    setSelectedUser(null);
  }


  /////////////////////////////////////////////////////
  //                                                 //
  //                   THE FRONTEND                  //
  //                                                 //
  /////////////////////////////////////////////////////
  return (
    <div className="steam-window">
      {/* Header */}
      <div className="top-header-bar">
        <div className="header-left-stack">
          <div className="window-title">OpenValve</div>
          <div className="menu-items-container">
            <div className="menu-item" onClick={() => setActiveMenu('OpenValve')} style={{ textDecoration: activeMenu === 'OpenValve' ? 'underline' : 'none', color: activeMenu === 'OpenValve' ? '#fff' : '' }}>OpenValve</div>
            <div className="menu-item" onClick={() => setActiveMenu('View')} style={{ textDecoration: activeMenu === 'View' ? 'underline' : 'none', color: activeMenu === 'View' ? '#fff' : '' }}>View</div>
            <div className="menu-item" onClick={() => setActiveMenu('Help')} style={{ textDecoration: activeMenu === 'Help' ? 'underline' : 'none', color: activeMenu === 'Help' ? '#fff' : '' }}>Help</div>
          </div>
        </div>
        <div className="profile-placeholder">
          <div className="account-name">{users.length > 0 ? `${users.length} Users Active` : 'No Users'}</div>
          <div className="status-indicator">{loading ? 'Working...' : 'Online'}</div>
        </div>
      </div>

      {/* Body */}
      <div className="window-body">

        {/* View Menu */}
        {activeMenu === 'View' && (
          <div className="tab-subwindow-container">
            <div className="tabs-row">
              {tabs.map(tab => (
                <div key={tab} className={`tab-button ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                  {tab}
                </div>
              ))}
            </div>

            <div className="content-subwindow">

              {/* Graph Tab */}
              {activeTab === 'Graph' && (
                <div className="graph-container">
                  {library.length > 0 ? (
                    <>
                      <div className="library-header" style={{justifyContent: 'space-between', alignItems: 'center'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                           <span>LIBRARY DISTRIBUTION:</span>
                           {/* Dropdown Selector */}
                           <select 
                              value={graphSource} 
                              onChange={(e) => setGraphSource(e.target.value)}
                              style={{
                                backgroundColor: '#3d4436', 
                                color: '#d8d69f', 
                                border: '1px solid #777976',
                                fontSize: '10px',
                                fontFamily: 'inherit',
                                outline: 'none'
                              }}
                           >
                              <option value="Tags">Tags</option>
                              <option value="Genres">Genres</option>
                              <option value="Categories">Categories</option>
                           </select>
                        </div>

                        <div className="graph-header-controls">
                          <button 
                            className={`graph-toggle-btn ${graphMode === 'bar' ? 'active' : ''}`}
                            onClick={() => setGraphMode('bar')}
                          >
                            [ BAR ]
                          </button>
                          <button 
                            className={`graph-toggle-btn ${graphMode === 'pie' ? 'active' : ''}`}
                            onClick={() => setGraphMode('pie')}
                          >
                            [ PIE ]
                          </button>
                          <button 
                            className={`graph-toggle-btn ${graphMode === 'radar' ? 'active' : ''}`}
                            onClick={() => setGraphMode('radar')}
                          >
                            [ RADAR ]
                          </button>
                        </div>
                      </div>
                      
                      <div className="graph-wrapper">
                        {/* Bar Chart */}
                        {graphMode === 'bar' && (
                          <div className="chart-container">
                            {graphData.length > 0 ? (
                              (() => {
                                const maxVal = Math.max(...graphData.map(d => d.value), 1);
                                return graphData.map((entry, i) => (
                                  <div key={entry.name} className="chart-row">
                                    <div className="chart-label" title={entry.name}>
                                      {entry.name.toUpperCase()}
                                    </div>
                                    <div className="chart-bar-track">
                                      <div 
                                        className="chart-bar-fill" 
                                        style={{
                                          width: `${(entry.value / maxVal) * 100}%`,
                                          backgroundColor: COLORS[i % COLORS.length]
                                        }}
                                      ></div>
                                    </div>
                                    <div className="chart-value">{entry.value}</div>
                                  </div>
                                ));
                              })()
                            ) : (
                              <div className="placeholder-box">
                                <p>No {graphSource} data found matching criteria.</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Pie Chart */}
                        {graphMode === 'pie' && graphData.length > 0 && (
                          <div className="graph-absolute-fill">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={graphData}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={false}
                                  outerRadius={350}
                                  dataKey="value"
                                  stroke="#20241b" 
                                  strokeWidth={2}
                                >
                                  {graphData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                                <Legend 
                                  layout="vertical" verticalAlign="middle" align="right"
                                  wrapperStyle={{
                                    fontSize: '10px', color: '#c8c8c8', right: 20,
                                    backgroundColor: '#3d4436', border: '1px solid #777976', 
                                    padding: '10px', maxHeight: '80%', overflowY: 'auto'
                                  }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        {/* Radar Chart */}
                        {graphMode === 'radar' && graphData.length > 0 && (
                          <div className="graph-absolute-fill">
                             <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={graphData.slice(0, 15)}>
                                  <PolarGrid stroke="#5a6a50" />
                                  <PolarAngleAxis dataKey="name" tick={{ fill: '#c8c8c8', fontSize: 10 }} />
                                  <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fill: '#95a92f', fontSize: 10 }} />
                                  <Radar
                                    name={graphSource}
                                    dataKey="value"
                                    stroke="#d8d69f"
                                    strokeWidth={2}
                                    fill="#95a92f"
                                    fillOpacity={0.6}
                                  />
                                  <Tooltip content={<CustomTooltip />} />
                                </RadarChart>
                             </ResponsiveContainer>
                          </div>
                        )}

                      </div>
                      
                      <div className="graph-footer">
                         Top {graphSource} based on {library.length} games.
                      </div>
                    </>
                  ) : (
                    <div className="placeholder-box">
                      <p>No data. Add users to generate graph.</p>
                    </div>
                  )}
                </div>
              )}

              {/* User Tab */}
              {activeTab === 'User' && (
                <div className="user-grid-container">
                  <div className="user-grid">

                    {/* User card listings */}
                    {users.map(u => (
                      <div key={u.steamid} className="user-card-base">
                        <div className="profile-mini-header">
                          <span className="profile-mini-name">{u.personaname}</span>
                          <span className="remove-x" onClick={() => handleRemoveUser(u.steamid)}>X</span>
                        </div>

                        <div className="profile-mini-body">
                          <img src={u.avatarfull} alt="avatar" className="profile-mini-avatar" />
                          <div className="profile-mini-stats">

                            <div className="mini-stat-row">
                              <span className="mini-stat-label">Member Since:</span>
                            </div>
                            <div className="mini-stat-row" style={{ marginBottom: '4px' }}>
                              <span className="mini-stat-val">{formatDate(u.timecreated)}</span>
                            </div>

                            <div className="mini-stat-row">
                              <span className="mini-stat-label">Games:</span>
                              <span className="mini-stat-val">
                                {renderGameCount(u.steamid)}
                              </span>
                            </div>

                            <a href={u.profileurl} target="_blank" rel="noreferrer" className="mini-profile-link">
                              View Steam Profile
                            </a>
                          </div>
                        </div>

                        {/* User Card Buttons */}
                        <div className="button-group">
                          <button className="add-user-btn" onClick={() => handleAddFriends(u.steamid)}>
                            ADD FRIENDS
                          </button>
                          <button className="add-user-btn" onClick={() => handleUserClick(u)}>
                            ACCOUNT DETAILS
                          </button>
                        </div>

                      </div>
                    ))}

                    {/* Add User Submission Box (Accepting Steam ID or vanityURL) */}
                    <div className="user-card-base">
                      <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div className="add-user-header">ADD USER</div>
                        <div style={{ fontSize: '10px', color: '#888', marginBottom: '8px' }}>Enter ID or Vanity URL</div>

                        <input className="add-user-input" type="text" placeholder="gabelogannewell" value={steamIdInput} onChange={(e) => setSteamIdInput(e.target.value)} />

                        {error && <div className="error-text">{error}</div>}

                        <div style={{ flexGrow: 1 }}></div>

                        <button type="submit" disabled={loading} className="add-user-btn">
                          {loading ? 'ADDING...' : 'ADD USER'}
                        </button>
                      </form>
                    </div>

                  </div>
                </div>
              )}

              {/* User Detail Modal */}
              {selectedUser && (
                <div className="modal-overlay" onClick={closeUserModal}>
                  <div className="user-detail-card" onClick={(e) => e.stopPropagation()}>
                    <div className="detail-header">
                      <span className="detail-title">{selectedUser.personaname}</span>
                      <span className="close-x" onClick={closeUserModal}>X</span>
                    </div>
                    
                    <div className="detail-content">
                      <div className="detail-left">
                         <img 
                            src={selectedUser.avatarfull} 
                            alt={selectedUser.personaname}
                            className="detail-image"
                         />
                         <div className="detail-stats">
                           <div><strong>Steam ID:</strong> {selectedUser.steamid}</div>
                           <div><strong>Country:</strong> {selectedUser.loccountrycode || 'N/A'}</div>
                           <div className={getPersonaStateClass(selectedUser.personastate, selectedUser.gameextrainfo)}>
                             {getPersonaStateLabel(selectedUser.personastate, selectedUser.gameextrainfo)}
                           </div>
                         </div>
                      </div>

                      <div className="detail-right">
                         <div className="detail-desc" style={{height: 'auto', maxHeight: '100px'}}>
                           {selectedUser.realname ? (
                              <div style={{marginBottom: '10px'}}><strong>Real Name:</strong> {selectedUser.realname}</div>
                           ) : <div style={{marginBottom: '10px', fontStyle: 'italic', color: '#777'}}>No Real Name Public</div>}
                           
                           <div><strong>Joined:</strong> {formatDate(selectedUser.timecreated)}</div>
                           <div><strong>Last Logoff:</strong> {formatDate(selectedUser.lastlogoff)}</div>
                         </div>
                         
                         <div style={{marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '4px'}}>
                           <a href={selectedUser.profileurl} target="_blank" rel="noreferrer" className="add-user-btn" style={{textAlign: 'center', textDecoration: 'none'}}>
                              OPEN STEAM PROFILE
                           </a>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Library Tab */}
              {activeTab === 'Library' && (
                <>
                  <div className="library-header">
                    <span className="game-name-col">NAME</span> 
                    <span className="game-desc-col">DESCRIPTION</span>
                    <span className="game-date-col">RELEASED</span>
                    <span className="game-score-col">SCORE</span>
                    <span className="game-price-col">PRICE</span>
                    <span className="game-owner-col">OWNER(S)</span>
                  </div>

                  {library.length > 0 ? (
                    <div className="game-list">
                      {library.map(game => (
                        <div key={game.appid} className="game-row" onClick={() => handleGameClick(game)}>
                          <div className="game-icon" style={game.img_icon_url ? { backgroundImage: `url(http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg)` } : {}}></div>
                          <div className="game-name-col">{game.name}</div>
                          <div className="game-desc-col">{game.description || '-'}</div>
                          <div className="game-date-col">{game.release_date || '-'}</div>
                          <div className="game-score-col">{game.userScore || '-'}</div>
                          <div className="game-price-col">
                            {parseFloat(game.price) === 0 ? 'FREE' : `$${game.price}`}
                          </div>
                          <div className="game-owner-col">{game.owners.join(', ')}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="placeholder-box">
                      <p>Library is empty. Add users in the User tab.</p>
                    </div>
                  )}

                  {/* GAME DETAIL CARD OVERLAY */}
                  {selectedGame && (
                    <div className="modal-overlay" onClick={closeGameModal}>
                      <div className="game-detail-card" onClick={(e) => e.stopPropagation()}>
                        <div className="detail-header">
                          <span className="detail-title">{selectedGame.name}</span>
                          <span className="close-x" onClick={closeGameModal}>X</span>
                        </div>
                        <div className="detail-content">
                          <div className="detail-left">
                             <img 
                                src={`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${selectedGame.appid}/header.jpg`} 
                                alt={selectedGame.name}
                                className="detail-image"
                                onError={(e) => {e.target.style.display='none'}}
                             />
                             <div className="detail-stats">
                                <div><strong>App ID:</strong> {selectedGame.appid}</div>
                                <div><strong>Price:</strong> {parseFloat(selectedGame.price) === 0 ? 'Free' : `$${selectedGame.price}`}</div>
                                <div><strong>Released:</strong> {selectedGame.release_date || 'N/A'}</div>
                                <div><strong>Score:</strong> {selectedGame.userScore || 'N/A'}</div>
                             </div>
                          </div>
                          <div className="detail-right">
                             <div className="detail-desc">{selectedGame.description || 'No description available.'}</div>
                             <div className="detail-tags">
                                {selectedGame.tags && typeof selectedGame.tags === 'object' 
                                  ? Object.keys(selectedGame.tags).map(t => <span key={t} className="tag-pill">{t}</span>)
                                  : null}
                             </div>
                             <div className="detail-owners">Owned by: {selectedGame.owners.join(', ')}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Console Tab */}
              {activeTab === 'Console' && (
                <div className="console-border">
                  <div className="console-wrapper">
                    <div className="console-log">
                      {consoleHistory.map((line, i) => (
                        <div key={i} className="console-line">{line}</div>
                      ))}
                      <div ref={consoleEndRef} />
                    </div>
                    <form className="console-input-area" onSubmit={handleConsoleSubmit}>
                      <input
                        className="console-input"
                        type="text"
                        value={consoleInput}
                        onChange={(e) => setConsoleInput(e.target.value)}
                        autoFocus
                      />
                      <button type="submit" className="console-btn">Submit</button>
                    </form>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* OpenValve Info Window */}
        {activeMenu === 'OpenValve' && (
          <div className="tab-subwindow-container">
            <div className="content-subwindow" style={{ padding: '20px', alignItems: 'center', justifyContent: 'center' }}>
              <div className="user-card-base" style={{ width: '400px' }}>
                <div className="add-user-header">ABOUT OPENVALVE</div>
                <div style={{ fontSize: '11px', lineHeight: '1.6', color: '#c8c8c8', marginTop: '10px' }}>
                  <p>OpenValve is a Steam games database, data visualization tool, and SteamWebAPI frontend with an interface emulating the class 2000s Steam UI.</p>
                  <p>It is developed and run by <strong>Jon Rutan</strong> and <strong>Trevor Corcoran</strong> and began as a partner project for a university database class.</p>
                  <p>OpenValve and it's creators are not associated with Valve Corporation.</p>
                  <p></p>
                  <button className="add-user-btn" style={{ marginTop: '20px' }} onClick={() => setActiveMenu('View')}>RETURN</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeMenu === 'Help' && <div className="tab-subwindow-container"><div className="content-subwindow"><div className="placeholder-box">Help Offline.</div></div></div>}
      </div>
    </div>
  );
}

export default App;