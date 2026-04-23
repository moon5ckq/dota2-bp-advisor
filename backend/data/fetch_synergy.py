#!/usr/bin/env python3
"""Fetch hero synergy data from OpenDota explorer API using curl."""
import json, time, sqlite3, subprocess, urllib.parse, os

DB_PATH = '/root/.openclaw/workspace/dota2-bp-advisor/backend/data/dota2.db'
OUT_PATH = '/root/.openclaw/workspace/dota2-bp-advisor/backend/data/hero_synergy.json'
TMP_PATH = OUT_PATH + '.tmp'
MIN_GAMES = 10

conn = sqlite3.connect(DB_PATH)
hero_ids = [r[0] for r in conn.execute('SELECT id FROM heroes ORDER BY id').fetchall()]
conn.close()
print(f"Total heroes: {len(hero_ids)}", flush=True)

data = {}
errors = []

def query_opendota(sql, timeout=90):
    url = f"https://api.opendota.com/api/explorer?sql={urllib.parse.quote(sql)}"
    r = subprocess.run(['curl', '-s', '--max-time', str(timeout), url], capture_output=True, text=True)
    if r.returncode != 0:
        raise Exception(f"curl failed: {r.stderr}")
    if not r.stdout.strip():
        raise Exception("empty response")
    result = json.loads(r.stdout)
    if 'err' in result and result['err']:
        raise Exception(f"API error: {result['err']}")
    return result.get('rows', [])

for idx, hid in enumerate(hero_ids):
    sql = f"SELECT pm2.hero_id as partner_id, count(*) as games, sum(case when (pm1.player_slot < 128 and matches.radiant_win) or (pm1.player_slot >= 128 and not matches.radiant_win) then 1 else 0 end) as wins FROM player_matches pm1 JOIN player_matches pm2 ON pm1.match_id = pm2.match_id AND pm1.hero_id != pm2.hero_id AND ((pm1.player_slot < 128 AND pm2.player_slot < 128) OR (pm1.player_slot >= 128 AND pm2.player_slot >= 128)) JOIN matches ON pm1.match_id = matches.match_id WHERE pm1.hero_id = {hid} GROUP BY pm2.hero_id"
    
    for attempt in range(3):
        try:
            rows = query_opendota(sql)
            h_str = str(hid)
            data[h_str] = {}
            for row in rows:
                g = row['games']
                if g < MIN_GAMES:
                    continue
                w = row['wins']
                data[h_str][str(row['partner_id'])] = {
                    "games": g, "wins": w, "win_rate": round(w / g * 100, 1)
                }
            break
        except Exception as e:
            err_str = str(e)
            if '429' in err_str or 'rate' in err_str.lower():
                print(f"  Rate limited hero {hid}, sleep 60s", flush=True)
                time.sleep(60)
            elif attempt < 2:
                print(f"  Retry hero {hid}: {e}", flush=True)
                time.sleep(10)
            else:
                print(f"  FAILED hero {hid}: {e}", flush=True)
                errors.append(hid)
    
    if (idx + 1) % 10 == 0 or idx == len(hero_ids) - 1:
        print(f"Progress: {idx+1}/{len(hero_ids)} done, {len(errors)} errors, {sum(len(v) for v in data.values())} pairs", flush=True)
        with open(TMP_PATH, 'w') as f:
            json.dump({"meta": {"generated_at": "2026-04-23T13:53:00+08:00", "description": "partial"}, "data": data}, f)
    
    time.sleep(4)

# Write final
total_pairs = sum(len(v) for v in data.values())
all_wr = [v['win_rate'] for d in data.values() for v in d.values()]
avg_wr = sum(all_wr) / len(all_wr) if all_wr else 0

with open(OUT_PATH, 'w', encoding='utf-8') as f:
    json.dump({
        "meta": {"generated_at": "2026-04-23T13:53:00+08:00", "description": "英雄两两同队配合胜率"},
        "data": data
    }, f, ensure_ascii=False)

if os.path.exists(TMP_PATH):
    os.remove(TMP_PATH)

print(f"\nDone! Heroes: {len(data)}, Pairs: {total_pairs}, Avg WR: {avg_wr:.1f}%, Errors: {len(errors)}", flush=True)
if errors:
    print(f"Failed: {errors}", flush=True)
