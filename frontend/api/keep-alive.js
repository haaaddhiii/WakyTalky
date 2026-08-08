// Pings Supabase daily via Vercel Cron so the free-tier project never hits
// the 7-day inactivity auto-pause. Reads a single row from a publicly
// readable table (RLS allows anon SELECT on profiles) — cheap and enough
// to count as activity.
export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return res.status(500).json({ ok: false, error: 'Missing Supabase env vars' });
  }

  try {
    const response = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    return res.status(response.ok ? 200 : 502).json({
      ok: response.ok,
      status: response.status,
      pinged_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
}
