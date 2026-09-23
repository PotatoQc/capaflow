// Worker Hi.Events (PLAN §10) : ne renvoie que des totaux, jamais de données de participants.
// GET /counts : lu par l'app (secours, toutes les 15 s).
// POST /hievents-webhook : appelé par Hi.Events à chaque scan ; pousse les totaux dans Firestore (~1 s).

interface Env {
  LIST_STUDENT: string;
  LIST_REGULAR: string;
  ALLOWED_ORIGIN: string;
  WEBHOOK_SECRET: string;
  WORKER_PASSWORD: string;
  FB_API_KEY: string;
  FB_PROJECT_ID: string;
}

type ListCount = { total: number; scanned: number };
type Counts = { student: ListCount; regular: ListCount };

const CACHE_MS = 10_000;
const WORKER_EMAIL = 'worker@example.com';
let cache: { at: number; counts: Counts } | null = null;
let token: { id: string; until: number } | null = null;

async function fetchList(id: string): Promise<ListCount> {
  const res = await fetch(`https://api.hi.events/public/check-in-lists/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Hi.Events ${res.status}`);
  const { data } = (await res.json()) as { data: { total_attendees: number; checked_in_attendees: number } };
  return { total: data.total_attendees, scanned: data.checked_in_attendees };
}

async function getCounts(env: Env, fresh: boolean): Promise<Counts> {
  if (fresh || !cache || Date.now() - cache.at > CACHE_MS) {
    const [student, regular] = await Promise.all([fetchList(env.LIST_STUDENT), fetchList(env.LIST_REGULAR)]);
    cache = { at: Date.now(), counts: { student, regular } };
  }
  return cache.counts;
}

// Signature Hi.Events (Spatie) : HMAC-SHA256 hexadécimal du corps brut, en-tête « Signature ».
async function validSignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const sig = new Uint8Array(signature.match(/../g)!.map((h) => parseInt(h, 16)));
  return crypto.subtle.verify('HMAC', key, sig, enc.encode(body));
}

// Compte technique « worker » : les règles ne lui permettent d'écrire que scans/totals.
async function idToken(env: Env): Promise<string> {
  if (token && Date.now() < token.until) return token.id;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FB_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: WORKER_EMAIL, password: env.WORKER_PASSWORD, returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`Auth ${res.status}`);
  const d = (await res.json()) as { idToken: string; expiresIn: string };
  token = { id: d.idToken, until: Date.now() + (Number(d.expiresIn) - 300) * 1000 };
  return token.id;
}

async function pushTotals(env: Env, counts: Counts): Promise<void> {
  const base = `projects/${env.FB_PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(`https://firestore.googleapis.com/v1/${base}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await idToken(env)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: [{
        update: {
          name: `${base}/events/neon-party/scans/totals`,
          fields: {
            student: { integerValue: String(counts.student.scanned) },
            regular: { integerValue: String(counts.regular.scanned) },
          },
        },
        updateTransforms: [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Firestore ${res.status}`);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/hievents-webhook') {
      const body = await request.text();
      if (!(await validSignature(body, request.headers.get('Signature'), env.WEBHOOK_SECRET))) {
        return new Response('Unauthorized', { status: 401 });
      }
      const type = (JSON.parse(body) as { event_type?: string }).event_type ?? '';
      // Hi.Events n'attend que 3 s : on répond tout de suite et on travaille en arrière-plan.
      if (type.startsWith('checkin.')) {
        ctx.waitUntil(getCounts(env, true).then((c) => pushTotals(env, c)).catch((e) => console.error(e)));
      }
      return new Response('ok');
    }

    const headers = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (request.method !== 'GET' || url.pathname !== '/counts') {
      return new Response('Not found', { status: 404, headers });
    }
    try {
      const counts = await getCounts(env, false);
      return Response.json({ ...counts, ageMs: Date.now() - cache!.at }, { headers });
    } catch {
      return Response.json({ error: 'hievents_unavailable' }, { status: 502, headers });
    }
  },
};
