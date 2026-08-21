import sqlite3
import json
import re

# Load the current 49 segments
conn = sqlite3.connect('D:/AutoDub Sub/ai-video-factory/data/video-factory.db')
cur = conn.cursor()
cur.execute("SELECT data FROM dubbing_projects WHERE id = 'dub-1786900777961'")
data = json.loads(cur.fetchone()[0])
current_49 = data.get('segments', [])

# Current total characters (no whitespace)
chars_current = sum(len(re.sub(r'\s+', '', s.get('translated_text', ''))) for s in current_49)
words_current = sum(len(s.get('translated_text', '').split()) for s in current_49)

print(f"1. Tổng số ký tự (không khoảng trắng) hiện tại (49 đoạn): {chars_current}")
print(f"   Tổng số từ (âm tiết) hiện tại:                          {words_current}")

# Let's inspect the original Chinese text total characters (no whitespace)
zh_chars = sum(len(re.sub(r'[^\u4e00-\u9fff]', '', s.get('source_text', ''))) for s in current_49)
print(f"2. Tổng số ký tự Hán tự gốc (source_text):               {zh_chars}")
