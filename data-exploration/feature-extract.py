"""Extracts features from the steam dataset."""

import pandas as pd

if __name__ == "__main__":
    data = pd.read_json("./games.json")
    print(data)
