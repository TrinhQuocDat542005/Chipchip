import sqlite3
import json
import re

# Let's inspect the current 49 segments character counts (no whitespace)
DB_PATH = 'D:/AutoDub Sub/ai-video-factory/data/video-factory.db'
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786900777961'")
data = json.loads(cur.fetchone()[0])
current_49 = data.get('segments', [])

total_chars_current_no_space = sum(len(re.sub(r'\s+', '', s.get('translated_text', ''))) for s in current_49)
total_words_current = sum(len(s.get('translated_text', '').split()) for s in current_49)

print(f"Current 49 Segments:")
print(f"  Total characters (no whitespace): {total_chars_current_no_space}")
print(f"  Total words (syllables):          {total_words_current}")
