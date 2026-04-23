const API_BASE = '/api';

export async function fetchHeroes() {
  const res = await fetch(`${API_BASE}/heroes`);
  if (!res.ok) throw new Error('Failed to fetch heroes');
  return res.json();
}

export async function fetchHeroStats(rank) {
  const params = rank ? `?rank=${rank}` : '';
  const res = await fetch(`${API_BASE}/heroes/stats${params}`);
  if (!res.ok) throw new Error('Failed to fetch hero stats');
  return res.json();
}

export async function syncHeroes() {
  const res = await fetch(`${API_BASE}/sync/heroes`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to sync heroes');
  return res.json();
}

export async function fetchHeroAliases() {
  const res = await fetch(`${API_BASE}/heroes/aliases`);
  if (!res.ok) throw new Error('Failed to fetch hero aliases');
  return res.json();
}

export async function fetchPlayerProfile(accountId) {
  const res = await fetch(`${API_BASE}/player/${accountId}/profile`);
  if (!res.ok) throw new Error('Failed to fetch player profile');
  return res.json();
}

export async function fetchPlayerHeroPool(accountId) {
  const res = await fetch(`${API_BASE}/player/${accountId}/hero-pool`);
  if (!res.ok) throw new Error('Failed to fetch hero pool');
  return res.json();
}

export async function fetchRecommend(data) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${API_BASE}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('Failed to fetch recommendations');
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}
