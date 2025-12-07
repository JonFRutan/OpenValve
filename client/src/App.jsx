import { useState, useRef, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import './App.css';

function App() {

  // palette
  const COLORS = ['#95a92f', '#d8d69f', '#777976', '#c8c8c8', '#af9449', '#6e7d64', '#aeb5a8'];

  // active trackers for views and tabs
  const [activeMenu, setActiveMenu] = useState('View');
  const [activeTab, setActiveTab] = useState('User');
  // users, libraries, and games
  const [users, setUsers] = useState([]);                   // list of all added users
  const [library, setLibrary] = useState([]);               // 
  const [rawUserGames, setRawUserGames] = useState({});     // list of all steam games pulled from users

  const [steamIdInput, setSteamIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [graphMode, setGraphMode] = useState('bar');

  // console states
  const [consoleHistory, setConsoleHistory] = useState([
    "OpenValve Console Initialized",
    "Type 'help' for a list of commands."
  ]);
  const [consoleInput, setConsoleInput] = useState('');
  const consoleEndRef = useRef(null);

  // tabs
  const tabs = ['Graph', 'Library', 'User', 'Console'];

  // scrolls the console window down for new entries
  useEffect(() => {
    if (activeTab === 'Console' && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleHistory, activeTab]);

  // formats the date into something legible
  // steam returns a 
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric', //e.g. 2012
      month: 'short',  //e.g. 9
      day: 'numeric'   //e.g. 21
    });
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
        if ((!existingGame.tags || existingGame.tags.length === 0) && game.tags) {
          existingGame.tags = game.tags;
        }
        if ((!existingGame.tags || existingGame.tags.length === 0) && game.tags) {
          existingGame.tags = game.tags;
        }
        if (!existingGame.description && game.description) existingGame.description = game.description;
        if (!existingGame.price && game.price) existingGame.price = game.price;

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
          "sql <query>    : [NOT IMPLEMENTED]",
          "gpt <prompt>   : [NOT IMPLEMENTED]"
        ];
        break;

      case 'sql':
        output = ["System.NotImplementedException: SQL engine offline."];
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

  // chart data calculation
  const piGraphData = useMemo(() => {
    if (library.length === 0) return [];

    const tagCounts = {};

    library.forEach(game => {
      let tagsList = [];

      // see if it has tags
      if (game.tags) {
        if (Array.isArray(game.tags)) {
          tagsList = game.tags;
        } else if (typeof game.tags === 'object') {
          tagsList = Object.keys(game.tags);
        }
      }

      if (tagsList.length === 0 && game.genres && Array.isArray(game.genres)) {
        tagsList = game.genres;
      }

      if (tagsList.length === 0) {
        tagsList = ['Uncategorized'];
      }

      tagsList.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    // only use tags found in X% of all the games
    const threshold = library.length * 0.20;

    // convert to array, filter by threshold, and sort
    const data = Object.keys(tagCounts)
      .map(key => ({
        name: key,
        value: tagCounts[key]
      }))
      .filter(item => item.value >= threshold) // Only keep tags in >= 20% of games
      .sort((a, b) => b.value - a.value);

    return data
  }, [library]);


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


  /////////////////////////////////////////////////////
  //                                                 //
  //               The returned frontend             //
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
                      <div className="library-header" style={{ justifyContent: 'space-between' }}>
                        <span style={{ flexGrow: 1 }}>LIBRARY TAG DISTRIBUTION</span>
                        <div className="graph-header-controls">
                          <button
                            className={`graph-toggle-btn ${graphMode === 'bar' ? 'active' : ''}`}
                            onClick={() => setGraphMode('bar')}
                          >
                            BAR
                          </button>
                          <button
                            className={`graph-toggle-btn ${graphMode === 'pie' ? 'active' : ''}`}
                            onClick={() => setGraphMode('pie')}
                          >
                            PIE
                          </button>
                        </div>
                      </div>

                      <div className="graph-wrapper">
                        {/* Bar Chart */}
                        {graphMode === 'bar' && (
                          <div className="chart-container">
                            {piGraphData.length > 0 ? (
                              (() => {
                                const maxVal = Math.max(...piGraphData.map(d => d.value), 1);
                                return piGraphData.map((entry, i) => (
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
                                <p>Games loaded, but no tags data found.</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Pie Chart */}
                        {graphMode === 'pie' && piGraphData.length > 0 && (
                          <div className="graph-absolute-fill">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={piGraphData}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={false}
                                  outerRadius={300} // size of the pie chart
                                  fill="#8884d8"
                                  dataKey="value"
                                  stroke="#20241b" 
                                  strokeWidth={2}
                                >
                                  {piGraphData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                                <Legend 
                                  layout="vertical" 
                                  verticalAlign="middle" 
                                  align="right"
                                  wrapperStyle={{
                                    fontSize: '10px', 
                                    color: '#c8c8c8',
                                    right: 20,
                                    backgroundColor: '#3d4436', 
                                    border: '1px solid #777976', 
                                    padding: '10px',
                                    maxHeight: '80%',       
                                    overflowY: 'auto'       
                                  }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                      </div>

                      <div className="graph-footer">
                        Top tags based on {library.length} games.
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
                          <button className="add-user-btn">
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

              {/* Library Tab */}
              {activeTab === 'Library' && (
                <>
                  <div className="library-header">
                    <span style={{width: '232px'}}>NAME</span> 
                    <span style={{flexGrow: 1}}>DESCRIPTION</span>
                    <span style={{width: '60px', textAlign: 'right'}}>PRICE</span>
                    <span style={{width: '180px', textAlign: 'right', marginLeft: '8px'}}>OWNER(S)</span>
                  </div>

                  {library.length > 0 ? (
                    <div className="game-list">
                      {library.map(game => (
                        <div key={game.appid} className="game-row">
                          <div className="game-icon" style={game.img_icon_url ? { backgroundImage: `url(http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg)` } : {}}></div>
                          <div className="game-name">{game.name}</div>
                          <div className="game-desc-col">{game.description || '-'}</div>
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