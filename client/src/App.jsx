import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis 
} from 'recharts';
import './App.css';

// game rows
const GameRow = memo(({ game, onClick }) => (
  <div className="game-row" onClick={() => onClick(game)}>
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
));

function App() {
  // local storage and account states
  const [mySteamId, setMySteamId] = useState(localStorage.getItem('ov_steamId') || '');
  const [myUsername, setMyUsername] = useState(localStorage.getItem('ov_username') || '');
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  // trackers for views and tabs
  const [activeMenu, setActiveMenu] = useState('View');
  const [activeTab, setActiveTab] = useState('User');
  // users, libraries, games
  const [users, setUsers] = useState([]);                   
  const [library, setLibrary] = useState([]);               
  const [rawUserGames, setRawUserGames] = useState({});     
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  // pagination state for library page
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 100;
  // local steam id status
  const [steamIdInput, setSteamIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // graph states
  const [graphMode, setGraphMode] = useState('bar'); 
  const [graphSource, setGraphSource] = useState('Tags'); 
  // console states
  const [consoleHistory, setConsoleHistory] = useState([
    "OpenValve Console Started",
    "Type 'help' for commands."
  ]);
  const [consoleInput, setConsoleInput] = useState('');
  const consoleEndRef = useRef(null);
  // statics for defining tabs and used colors
  const tabs = ['Graph', 'Library', 'User', 'Console'];
  const COLORS = ['#95a92f', '#d8d69f', '#777976', '#c8c8c8', '#af9449', '#6e7d64', '#aeb5a8'];
  
  // scrolling in the console tab 
  useEffect(() => {
    if (activeTab === 'Console' && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleHistory, activeTab]);

  // defaults the page to 1 when the library changes
  useEffect(() => {
    setCurrentPage(1);
  }, [library.length]);

  // autoload stored steamid from storage
  useEffect(() => {
    const storedId = localStorage.getItem('ov_steamId');
    if (storedId) {
      fetchAndAddUser(storedId, true); 
    }
  }, []);

  // format the returned steam timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  // grabs a users status, like offline or Busy. This switch interprets the codes that steam returns.
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

  // if they are in a game, return the game being played
  const getPersonaStateClass = (stateCode, gameExtraInfo) => {
    if (gameExtraInfo) return 'user-status-ingame';
    if (stateCode === 0) return 'user-status-offline';
    return 'user-status-online';
  };

  // combines all the data grabbed about the games from the users libraries and puts them into one large collection
  // this is displayed in the library tab
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
        //if any of this info exists, assign it to the existing game
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

  // consults the SteamAPI for a user, if they exist, add them to the users list
  // then grabs their games, and updates the library to include it
  // this can be called manually with the "Add User" button, or autoloaded when using "Add Friends"
  const fetchAndAddUser = async (steamIdToFetch, isAutoLoad = false) => {
    if (!steamIdToFetch) return;
    setLoading(true);
    if (!isAutoLoad) setError('');

    try {
      // get games
      const gameRes = await fetch(`http://localhost:5000/api/games?steamid=${steamIdToFetch}`);
      if (!gameRes.ok) throw new Error(`User not found or Private Profile`);
      const gameData = await gameRes.json();
      // get profile
      const userRes = await fetch(`http://localhost:5000/api/user?steamid=${steamIdToFetch}`);
      if (!userRes.ok) throw new Error(`User profile fetch failed`);
      const userProfile = await userRes.json();
      // adding / updating a user
      setUsers(prevUsers => {
        // if user exists, update them (might have new level/ban data now)
        const idx = prevUsers.findIndex(u => u.steamid === userProfile.steamid);
        if (idx !== -1) {
           const newUsers = [...prevUsers];
           newUsers[idx] = userProfile;
           return newUsers;
        }
        return [...prevUsers, userProfile];
      });

      // update games and libraries
      setRawUserGames(prev => ({ ...prev, [userProfile.steamid]: gameData }));
      
      setLibrary(prevLib => {
        const updated = mergeLibrary(prevLib, gameData, userProfile.personaname);
        return updated.sort((a, b) => a.name.localeCompare(b.name));
      });

      if (!isAutoLoad) setSteamIdInput('');

    } catch (err) {
      console.error("ADD USER ERROR:", err);
      if (!isAutoLoad) setError(err.message || 'Error adding user.');
    } finally {
      setLoading(false);
    }
  };

  // when the "add user" button is clicked
  const handleAddUser = (e) => {
    e.preventDefault(); // prevents reloading
    fetchAndAddUser(steamIdInput);
  };
  // saves SteamID and a chosen username to the browser local storage
  const handleSaveAccount = () => {
    localStorage.setItem('ov_steamId', mySteamId);
    localStorage.setItem('ov_username', myUsername);
    setIsEditingAccount(false);
    
    if (mySteamId) {
      fetchAndAddUser(mySteamId);
    }
  };

  // when the 'x' button is clicked on a user card.
  const handleClearAccount = () => {
    localStorage.removeItem('ov_steamId');
    localStorage.removeItem('ov_username');
    setMySteamId('');
    setMyUsername('');
    setIsEditingAccount(true); 
  };

  // grabs all the friends from a steamID, goes through each one and puts them through the "fetchAndAddUser" function
  const handleAddFriends = async (steamid) => {
    try {
      console.log(`Fetching friends for ${steamid}...`);
      const res = await fetch(`http://localhost:5000/api/friends?steamid=${steamid}`);
      if (!res.ok) throw new Error("Could not fetch friends list");
      
      const friendsData = await res.json();
      
      if (Array.isArray(friendsData) && friendsData.length > 0) {
        
        const newFriends = friendsData.filter(f => !users.some(u => u.steamid === f.steamid));
        if (newFriends.length === 0) {
          alert("All public friends from this user are already added.");
          return;
        }
        
        setUsers(prev => [...prev, ...newFriends]);

        let currentLib = [...library];
        let currentRaw = { ...rawUserGames };
        
        for (const friend of newFriends) {
          try {
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
        alert("No friends found."); 
      }

    } catch (err) {
      console.error(err);
      alert("Failed to add friends. Profile might be private.");
    }
  };

  // removing the user and their games from the library
  const handleRemoveUser = (steamidToRemove) => {
    const remainingUsers = users.filter(u => u.steamid !== steamidToRemove);
    setUsers(remainingUsers);
    
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

  // when the "search" function is used in the console. Does a lookup on our servers database for the AppID
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

  // handles SQL put into the console. Highly sanitized and filtered on the server backend
  const handleConsoleSQL = async (query) => {
     setConsoleHistory(prev => [...prev, `Executing SQL: ${query}...`]); // filling up the console with the history of commands and output
     try {
        const res = await fetch('http://localhost:5000/api/console/sql', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ query: query })
        });
        const data = await res.json();
        if (res.ok) {
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

  // when the "submit" button is used in the console. uses a switch to direct it to the right handler function.
  const handleConsoleSubmit = async (e) => {
    e.preventDefault();
    const input = consoleInput.trim();
    if (!input) return;

    setConsoleHistory(prev => [...prev, `] ${input}`]);
    setConsoleInput('');

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
        const match = input.match(/^sql\s+"([^"]+)"$/i);
        if (!match) {
            output = ["Usage: sql \"select * from games where price = 0\""];
        } else {
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

  // generates and handles the data to be used for the graph visualizations
  const graphData = useMemo(() => {
    if (library.length === 0) return [];
    const counts = {};
    const sourceKey = graphSource.toLowerCase(); 

    library.forEach(game => {
      let rawData = game[sourceKey];
      let itemsList = [];

      if (rawData) {
        if (Array.isArray(rawData)) {
          rawData.forEach(item => {
            if (typeof item === 'string') itemsList.push(item);
            else if (typeof item === 'object' && item.description) itemsList.push(item.description);
          });
        } else if (typeof rawData === 'object') {
          itemsList = Object.keys(rawData);
        }
      }

      if (itemsList.length === 0) {
        if (sourceKey === 'tags') itemsList = ['Uncategorized'];
      }

      itemsList.forEach(item => {
        counts[item] = (counts[item] || 0) + 1;
      });
    });

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

  // some buttons, that direct to proper functions
  const handleGameClick = (game) => {
    setSelectedGame(game);
  }
  const closeGameModal = () => {
    setSelectedGame(null);
  }
  const handleUserClick = (user) => {
    setSelectedUser(user);
  }
  const closeUserModal = () => {
    setSelectedUser(null);
  }
  
  const paginatedLibrary = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return library.slice(startIndex, startIndex + itemsPerPage);
  }, [library, currentPage]);

  const totalPages = Math.ceil(library.length / itemsPerPage);

  const handlePageChange = (direction) => {
    if (direction === 'prev' && currentPage > 1) {
      setCurrentPage(p => p - 1);
    } else if (direction === 'next' && currentPage < totalPages) {
      setCurrentPage(p => p + 1);
    }
  };

  /////////////////////////////////////////////////////
  //                                                 //
  //                   THE FRONTEND                  //
  //                                                 //
  /////////////////////////////////////////////////////
  
  // Account Render Logic Helper
  const renderAccountContent = () => {
    // Show form is no ID or in the 'edit' screen
    if (isEditingAccount || !mySteamId) {
      return (
        <div className="user-card-base" style={{ width: '300px' }}>
          <div className="add-user-header">ACCOUNT SETTINGS</div>
          <div style={{ fontSize: '10px', color: '#888', margin: '4px 0 10px 0' }}>
            Settings are saved to your browser local storage.
          </div>

          <div style={{ marginBottom: '8px' }}>
            <label style={{display:'block', fontSize:'10px', color:'#aaa', marginBottom:'2px'}}>CHOSEN USERNAME:</label>
            <input 
              className="add-user-input" 
              type="text" 
              value={myUsername} 
              onChange={(e) => setMyUsername(e.target.value)} 
              placeholder="Enter display name"
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{display:'block', fontSize:'10px', color:'#aaa', marginBottom:'2px'}}>STEAM ID (AUTOLOAD):</label>
            <input 
              className="add-user-input" 
              type="text" 
              value={mySteamId} 
              onChange={(e) => setMySteamId(e.target.value)} 
              placeholder="7656119..."
            />
          </div>

          <div className="button-group">
            <button className="add-user-btn" onClick={handleSaveAccount}>SAVE</button>
            <button className="add-user-btn" onClick={handleClearAccount} style={{color: '#aaa'}}>CLEAR DATA</button>
            <button className="add-user-btn" style={{marginTop: '10px'}} onClick={() => setActiveMenu('View')}>CANCEL</button>
          </div>
        </div>
      );
    }

    // if ID exists, try to find user data
    const myUser = users.find(u => u.steamid === mySteamId);

    if (myUser) {
      // showing large profile card
      return (
        <div className="account-large-card">
          <div className="detail-header" style={{fontSize: '14px', padding:'8px'}}>
            <span className="detail-title">{myUser.personaname}</span>
            <span className="level-badge">{myUser.steam_level || '?'}</span>
          </div>
          
          <div className="detail-content" style={{flexGrow:1}}>
            <div className="detail-left" style={{width: '200px'}}>
               <img 
                  src={myUser.avatarfull} 
                  alt={myUser.personaname}
                  className="detail-image"
                  style={{height: '200px', width: '200px'}}
               />
               <div className={getPersonaStateClass(myUser.personastate, myUser.gameextrainfo)} style={{fontSize:'12px', textAlign:'center', marginTop:'4px'}}>
                 {getPersonaStateLabel(myUser.personastate, myUser.gameextrainfo)}
               </div>
            </div>

            <div className="detail-right" style={{fontSize:'12px'}}>
               <div style={{marginBottom:'12px'}}>
                 <div style={{color:'#aaa', fontSize:'10px'}}>REAL NAME</div>
                 <div>{myUser.realname || 'N/A'}</div>
               </div>
               
               <div style={{marginBottom:'12px'}}>
                 <div style={{color:'#aaa', fontSize:'10px'}}>LOCATION</div>
                 <div>
                   {myUser.loccountrycode ? `${myUser.loccountrycode}` : 'N/A'}
                 </div>
               </div>

               <div style={{marginBottom:'12px'}}>
                 <div style={{color:'#aaa', fontSize:'10px'}}>MEMBER SINCE</div>
                 <div>{formatDate(myUser.timecreated)}</div>
               </div>

               <div style={{marginBottom:'12px'}}>
                 <div style={{color:'#aaa', fontSize:'10px'}}>BAN STATUS</div>
                 {myUser.bans ? (
                   <div className="ban-stat">
                     <span style={{color: myUser.bans.VACBanned ? '#ff4444' : '#95a92f'}}>
                       {myUser.bans.VACBanned ? `VAC BANNED (${myUser.bans.NumberOfVACBans})` : 'NO VAC BANS'}
                     </span>
                     <br/>
                     <span style={{color: myUser.bans.CommunityBanned ? '#ff4444' : '#95a92f'}}>
                       {myUser.bans.CommunityBanned ? 'COMMUNITY BANNED' : 'GOOD STANDING'}
                     </span>
                     {myUser.bans.DaysSinceLastBan > 0 && (
                        <div style={{fontSize:'10px', color:'#888', marginTop:'2px'}}>
                          {myUser.bans.DaysSinceLastBan} days since last ban
                        </div>
                     )}
                   </div>
                 ) : <div>Loading...</div>}
               </div>

               <div style={{marginTop:'auto'}}>
                 <button className="add-user-btn" onClick={() => setIsEditingAccount(true)}>EDIT SETTINGS</button>
               </div>
            </div>
          </div>
        </div>
      );
    } else {
      return (
        <div className="user-card-base">
          <div className="placeholder-box">Loading Profile...</div>
          <button className="add-user-btn" onClick={() => setIsEditingAccount(true)}>EDIT SETTINGS</button>
        </div>
      );
    }
  };

  return (
    <div className="steam-window">
      {/* Header */}
      <div className="top-header-bar">
        <div className="header-left-stack">
          <div className="window-title">OpenValve</div>
          <div className="menu-items-container">
            <div className="menu-item" onClick={() => setActiveMenu('OpenValve')} style={{ textDecoration: activeMenu === 'OpenValve' ? 'underline' : 'none', color: activeMenu === 'OpenValve' ? '#fff' : '' }}>OpenValve</div>
            <div className="menu-item" onClick={() => setActiveMenu('View')} style={{ textDecoration: activeMenu === 'View' ? 'underline' : 'none', color: activeMenu === 'View' ? '#fff' : '' }}>View</div>
            <div className="menu-item" onClick={() => setActiveMenu('Account')} style={{ textDecoration: activeMenu === 'Account' ? 'underline' : 'none', color: activeMenu === 'Account' ? '#fff' : '' }}>Account</div>
            <div className="menu-item" onClick={() => setActiveMenu('Help')} style={{ textDecoration: activeMenu === 'Help' ? 'underline' : 'none', color: activeMenu === 'Help' ? '#fff' : '' }}>Help</div>
          </div>
        </div>
        <div className="profile-placeholder">
          <div className="account-name">
            {myUsername ? `${myUsername.toUpperCase()} | ` : ''}
            {users.length > 0 ? `${users.length} Users Active` : 'No Users'}
          </div>
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

                    {/* Add User Submission Box */}
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

              {/* User Detail Modal (Active Tab Only) */}
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
                    <>
                    <div className="game-list">
                      {paginatedLibrary.map(game => (
                        <GameRow key={game.appid} game={game} onClick={handleGameClick} />
                      ))}
                    </div>
                    {/* Pagination Footer */}
                    <div className="library-footer">
                       <button 
                          className="pagination-btn" 
                          onClick={() => handlePageChange('prev')} 
                          disabled={currentPage === 1}
                       >
                         &lt; PREV
                       </button>
                       <span>PAGE {currentPage} OF {totalPages || 1}</span>
                       <button 
                          className="pagination-btn" 
                          onClick={() => handlePageChange('next')} 
                          disabled={currentPage === totalPages}
                       >
                         NEXT &gt;
                       </button>
                    </div>
                    </>
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

        {/* Account Menu */}
        {activeMenu === 'Account' && (
          <div className="tab-subwindow-container">
            <div className="content-subwindow" style={{ padding: '20px', alignItems: 'center', justifyContent: 'center' }}>
              {renderAccountContent()}
            </div>
          </div>
        )}

        {activeMenu === 'Help' && <div className="tab-subwindow-container"><div className="content-subwindow"><div className="placeholder-box">Help Offline.</div></div></div>}
      </div>
    </div>
  );
}

export default App;