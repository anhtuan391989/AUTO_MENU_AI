export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // === CORS FIX — cho phép gọi từ file cục bộ ===
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    // ==============================================

    if (url.pathname === '/health') {
      return Response.json({ ok: true, time: Date.now() }, { headers: corsHeaders });
    }

    if (url.pathname === '/key') {
      const songId = url.searchParams.get('id');
      if (!songId) return Response.json({ error: 'missing_id' }, { status: 400, headers: corsHeaders });
      
      const { results } = await env.DB.prepare(`
        SELECT id, key, mode, status, total_weight as weight
        FROM song_keys WHERE id = ?
      `).bind(songId).all();
      
      if (!results.length) {
        return Response.json({ found: false, status: 'not_found' }, { status: 404, headers: corsHeaders });
      }
      return Response.json({ found: true, data: results[0] }, { headers: corsHeaders });
    }

    if (url.pathname === '/vote' && request.method === 'POST') {
      const body = await request.json();
      const { songId, key, mode, weight = 1.0, source = 'user' } = body;
      
      if (!songId || !key || !mode) {
        return Response.json({ error: 'missing_fields' }, { status: 400, headers: corsHeaders });
      }
      
      const ipHash = btoa(Math.random().toString()).slice(0, 16);
      
      const existing = await env.DB.prepare(`
        SELECT 1 FROM votes WHERE song_id = ? AND ip_hash = ?
      `).bind(songId, ipHash).first();
      
      if (existing) {
        await env.DB.prepare(`
          UPDATE votes SET key = ?, mode = ?, weight = ?, created_at = ?
          WHERE song_id = ? AND ip_hash = ?
        `).bind(key, mode, weight, Date.now(), songId, ipHash).run();
      } else {
        await env.DB.prepare(`
          INSERT INTO votes (song_id, key, mode, weight, source, ip_hash)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(songId, key, mode, weight, source, ipHash).run();
      }
      
      await recalculateSong(env, songId);
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    if (url.pathname === '/admin/batch' && request.method === 'POST') {
      const auth = request.headers.get('Authorization');
      if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) {
        return Response.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders });
      }
      const { songs } = await request.json();
      for (const s of songs) {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO song_keys (id, key, mode, status, total_weight)
          VALUES (?, ?, ?, 'confirmed', 999)
        `).bind(s.id, s.key, s.mode).run();
      }
      return Response.json({ ok: true, count: songs.length }, { headers: corsHeaders });
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  }
};

async function recalculateSong(env, songId) {
  const { results } = await env.DB.prepare(`
    SELECT key, mode, SUM(weight) as total
    FROM votes WHERE song_id = ? GROUP BY key, mode ORDER BY total DESC
  `).bind(songId).all();
  
  if (!results.length) return;
  
  const totalAll = results.reduce((s, r) => s + r.total, 0);
  const top = results[0];
  const ratio = top.total / totalAll;
  
  let status = 'provisional';
  if (ratio >= 0.6 && totalAll >= 3) status = 'confirmed';
  if (results.length >= 3 && ratio < 0.6) status = 'disputed';
  
  await env.DB.prepare(`
    INSERT OR REPLACE INTO song_keys (id, key, mode, status, total_weight, confirmed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(songId, top.key, top.mode, status, totalAll, status === 'confirmed' ? Date.now() : null).run();
}