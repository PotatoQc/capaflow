// Worker Hi.Events (PLAN §10) : ne renvoie que des totaux, jamais de données de participants.

interface Env {
  LIST_STUDENT: string;
  LIST_REGULAR: string;
  ALLOWED_ORIGIN: string;
}

type ListCount = { total: number; scanned: number };
type Counts = { student: ListCount; regular: ListCount };

const CACHE_MS = 10_000;
let cache: { at: number; counts: Counts } | null = null;

async function fetchList(id: string): Promise<ListCount> {
  const res = await fetch(`https://api.hi.events/public/check-in-lists/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Hi.Events ${res.status}`);
  const { data } = (await res.json()) as { data: { total_attendees: number; checked_in_attendees: number } };
  return { total: data.total_attendees, scanned: data.checked_in_attendees };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, 'Cache-Control': 'no-store', Vary: 'Origin' };
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname !== '/counts') {
      return new Response('Not found', { status: 404, headers });
    }
    try {
      if (!cache || Date.now() - cache.at > CACHE_MS) {
        const [student, regular] = await Promise.all([fetchList(env.LIST_STUDENT), fetchList(env.LIST_REGULAR)]);
        cache = { at: Date.now(), counts: { student, regular } };
      }
      return Response.json({ ...cache.counts, ageMs: Date.now() - cache.at }, { headers });
    } catch {
      return Response.json({ error: 'hievents_unavailable' }, { status: 502, headers });
    }
  },
};
