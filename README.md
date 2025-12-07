# OpenValve
*Jon Rutan & Trevor Corcoran*  
This README stinks, and MUST be updated.  

NOTE: I haven't included the instructions for setting up the Steamgames database, which is a local postgresql database.  
You'll need to run `migrate.py` against the `games.json` file from the dataset. I, being quite intelligent, pushed the local db password into this repo.  


## Setup
To start the server and client:  
**Server**
1. `python3 -m venv .venv` - Create the Python virtual environment.  
2. `source .venv/bin/activate` - Go into the virtual environment.  
3. `pip install -r requirements.txt` - Install the required pip packages.  
4. `python3 app.py` - Runs the server API backend. This will occupy your terminal.  
  
**Client**
1. Navigate to inside the `client` directory.  
2. `npm install` - To install the needed node packages.  
3. `npm run dev` - To run the vite development environment. This will occupy your terminal.  


### Sources
- Steam Games database sourced from (Kaggle)[https://www.kaggle.com/datasets/fronkongames/steam-games-dataset/data?select=games.json]
