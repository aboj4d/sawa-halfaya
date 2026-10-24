// Validation + routes for the public service forms:
// POST /api/inquiry | /api/ads | /api/complaints | /api/requests | /api/info
//
// Mounted from server.js after express.json() and authMiddleware:
//   app.use('/api', createServiceRouter({ createEntry, limiter: serviceLimiter }));

// Allowed fields per service: { field: { max, required } }
const SCHEMAS = {
  inquiry: {
    name:     { max: 100,  required: true },
    question: { max: 2000, required: true }
  },
  ads: {
    title:   { max: 150,  required: true },
    content: { max: 2000, required: true }
  },
  complaints: {
    name:      { max: 100,  required: true },
    complaint: { max: 2000, required: true }
  },
  requests: {
    name:    { max: 100,  required: true },
    request: { max: 2000, required: true }
  },
  // The frontend has no "info" form yet; this is the minimal contract.
  info: {
    name:    { max: 100,  required: false },
    message: { max: 2000, required: true }
  }
};

// Returns { ok:true, data } or { ok:false, error }
function validate(service, body) {
  const schema = SCHEMAS[service];
  if (!schema) return { ok: false, error: 'unknown service' };

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body must be a JSON object' };
  }

  const extra = Object.keys(body).filter((k) => !Object.prototype.hasOwnProperty.call(schema, k));
  if (extra.length) {
    return { ok: false, error: 'unexpected fields: ' + extra.slice(0, 5).join(', ') };
  }

  const data = {};
  for (const [field, rule] of Object.entries(schema)) {
    const raw = body[field];

    if (raw === undefined || raw === null) {
      if (rule.required) return { ok: false, error: `${field} is required` };
      continue;
    }
    if (typeof raw !== 'string') {
      return { ok: false, error: `${field} must be a string` };
    }

    const value = raw.trim();
    if (!value) {
      if (rule.required) return { ok: false, error: `${field} is required` };
      continue;
    }
    if (value.length > rule.max) {
      return { ok: false, error: `${field} is too long (max ${rule.max})` };
    }
    data[field] = value;
  }
  return { ok: true, data };
}

function createServiceRouter({ createEntry, limiter } = {}) {
  if (typeof createEntry !== 'function') {
    throw new Error('createServiceRouter: createEntry(service, data, userId) is required');
  }
  // required lazily so that validate() can be unit-tested without express installed
  const express = require('express');
  const router = express.Router();

  Object.keys(SCHEMAS).forEach((service) => {
    const handlers = [];
    if (limiter) handlers.push(limiter);
    handlers.push((req, res) => {
      const result = validate(service, req.body);
      if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
      try {
        createEntry(service, result.data, req.user ? req.user.id : null);
        res.json({ ok: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: 'server error' });
      }
    });
    router.post(`/${service}`, ...handlers);
  });

  return router;
}

module.exports = { createServiceRouter, validate, SCHEMAS };
