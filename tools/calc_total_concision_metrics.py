import sqlite3
import json
import re

conn = sqlite3.connect('D:/AutoDub Sub/ai-video-factory/data/video-factory.db')
cur = conn.cursor()
cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786900777961'")
data = json.loads(cur.fetchone()[0])
current_49 = data.get('segments', [])

# Load deploy script or compute exact original texts
from deploy_full_concision_and_render import clean_vietnamese_sentence, pilot_10_map

# Total current characters without whitespace
total_current_no_space = sum(len(re.sub(r'\s+', '', s.get('translated_text', ''))) for s in current_49)

print(f"Total current characters (no whitespace): {total_current_no_space}")
