const { createHmac } = require('node:crypto');
const { isIP } = require('node:net');

// All three changes happen together, including when requests arrive concurrently.
const incrementScript = `
local previous = redis.call('GET', KEYS[2])
local total = tonumber(redis.call('GET', KEYS[1]) or '0')
if previous then
  if tonumber(previous) ~= tonumber(ARGV[1]) then return {-1, total, 0} end
  return {1, total, 0}
end
local used = tonumber(redis.call('GET', KEYS[3]) or '0')
local amount = tonumber(ARGV[1])
if used + amount > 120 then
  return {0, total, math.max(1, redis.call('TTL', KEYS[3]))}
end
redis.call('INCRBY', KEYS[3], amount)
if used == 0 then redis.call('EXPIRE', KEYS[3], 60) end
total = redis.call('INCRBY', KEYS[1], amount)
redis.call('SET', KEYS[2], amount, 'EX', 86400)
return {1, total, 0}
`;

function createHandler({ env = process.env, fetcher = fetch } = {}) {
  return async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Vary', 'Origin');
    const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    const allowed = new Set((env.SPARK_ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean));
    for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
      if (host) allowed.add(`https://${host}`);
    }
    if (env.VERCEL_ENV !== 'production') allowed.delete('https://limzhengjie.com');
    const origin = req.headers.origin;
    if (origin && !allowed.has(origin)) return send(403, { error: 'Origin not allowed' });
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
    }
    if (req.method === 'OPTIONS') {
      if (!origin) return send(403, { error: 'Origin required' });
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '3600');
      res.statusCode = 204; return res.end();
    }
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return send(405, { error: 'Method not allowed' });
    }
    const redisURL = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
    const redisToken = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
    if (!redisURL || !redisToken || !env.SPARK_RATE_SALT) {
      return send(503, { error: 'Counter unavailable' });
    }
    const stage = env.VERCEL_ENV === 'production' ? 'production' : env.VERCEL_ENV === 'preview' ? 'preview' : 'development';
    const prefix = `spark:${stage}`;
    let command = ['GET', `${prefix}:total`];
    if (req.method === 'POST') {
      if (!origin) return send(403, { error: 'Origin required' });
      if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
        return send(415, { error: 'JSON required' });
      }
      if (Number(req.headers['content-length']) > 512) return send(413, { error: 'Request too large' });
      let body = req.body;
      try { if (typeof body === 'string') body = JSON.parse(body); } catch (_) { return send(400, { error: 'Invalid request' }); }
      if (!body || Object.keys(body).length !== 2 ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId) ||
          !Number.isInteger(body.amount) || body.amount < 1 || body.amount > 10) {
        return send(400, { error: 'Invalid request' });
      }
      // Vercel overwrites this header at its edge. Other deployments use the socket.
      const address = env.VERCEL === '1' ? req.headers['x-forwarded-for'] : req.socket?.remoteAddress;
      if (typeof address !== 'string' || !isIP(address)) return send(400, { error: 'Client address unavailable' });
      const visitor = createHmac('sha256', env.SPARK_RATE_SALT).update(address).digest('hex');
      command = ['EVAL', incrementScript, '3', `${prefix}:total`, `${prefix}:request:${body.requestId.toLowerCase()}`,
        `${prefix}:rate:${visitor}`, String(body.amount)];
    }
    try {
      const response = await fetcher(redisURL, {
        method: 'POST', headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(command), signal: AbortSignal.timeout(4000)
      });
      if (!response.ok) throw new Error('Storage unavailable');
      const data = await response.json();
      if (data.error || !Object.hasOwn(data, 'result')) throw new Error('Storage unavailable');
      const total = req.method === 'GET' ? Number(data.result ?? 0) : Number(data.result?.[1]);
      if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid total');
      if (req.method === 'POST') {
        if (data.result?.[0] === 0) {
          const retryAfter = Math.min(60, Math.max(1, Number(data.result[2]) || 60));
          res.setHeader('Retry-After', String(retryAfter));
          return send(429, { error: 'Take a little breather', retryAfter });
        }
        if (data.result?.[0] === -1) return send(409, { error: 'Request ID already used' });
        if (data.result?.[0] !== 1) throw new Error('Invalid result');
      }
      return send(200, { total });
    } catch (_) {
      // Do not expose service credentials or substitute a fake zero during outages.
      return send(503, { error: 'Counter unavailable' });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
