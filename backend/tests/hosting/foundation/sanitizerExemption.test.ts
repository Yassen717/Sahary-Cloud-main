import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { checkXSS, preventNoSQLInjection, sanitizeAll } from '../../../src/middlewares/sanitization';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  // Same global sanitizers, same order as src/index.ts.
  app.use(sanitizeAll);
  app.use(checkXSS);
  app.use(preventNoSQLInjection);
  app.put('/api/v1/hosting/files/content', (req: Request, res: Response) => {
    res.json({ body: req.body });
  });
  app.put('/api/v1/hosting/other', (req: Request, res: Response) => {
    res.json({ body: req.body });
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(400).json({ success: false, message: err.message });
  });
  return app;
};

const HTML_PAYLOAD = '<!doctype html><script>alert(1)</script><p>$where {x}</p>';

describe('PUT /api/v1/hosting/files/content sanitizer exemption', () => {
  const app = buildApp();

  test('HTML/script/$-payload round-trips byte-for-byte on the exempt route', async () => {
    const body = { path: '/index.html', content: HTML_PAYLOAD };
    const r = await request(app).put('/api/v1/hosting/files/content').send(body);
    expect(r.status).toBe(200);
    expect(r.body.body).toEqual(body);
  });

  test('query string does not defeat the path match', async () => {
    const body = { path: '/x.html', content: HTML_PAYLOAD };
    const r = await request(app).put('/api/v1/hosting/files/content?overwrite=true').send(body);
    expect(r.status).toBe(200);
    expect(r.body.body).toEqual(body);
  });

  test('object bodies with $-keys pass on the exempt route', async () => {
    const body = { path: '/x', content: { $where: 'this.x' } };
    const r = await request(app).put('/api/v1/hosting/files/content').send(body);
    expect(r.status).toBe(200);
    expect(r.body.body).toEqual(body);
  });

  test('same payload is still sanitized on other routes', async () => {
    // sanitizeAll trims / strips control chars on non-preserved fields.
    const body = { name: '  spaced out  ', content: HTML_PAYLOAD };
    const r = await request(app).put('/api/v1/hosting/other').send(body);
    expect(r.status).toBe(200);
    expect(r.body.body.name).toBe('spaced out');
    // The preserved 'content' field is untouched by sanitizeAll itself.
    expect(r.body.body.content).toBe(HTML_PAYLOAD);
  });

  test('$-key bodies are still rejected on other routes', async () => {
    const r = await request(app).put('/api/v1/hosting/other').send({ $where: 'x' });
    expect(r.status).toBe(400);
  });

  test('script-containing non-preserved field is still blocked on other routes', async () => {
    const r = await request(app)
      .put('/api/v1/hosting/other')
      .send({ name: '<script>alert(1)</script>' });
    expect(r.status).toBe(400);
  });

  test('non-PUT methods on the same path are still sanitized', async () => {
    const app2 = express();
    app2.use(express.json());
    app2.use(sanitizeAll);
    app2.use(checkXSS);
    app2.use(preventNoSQLInjection);
    app2.post('/api/v1/hosting/files/content', (req: Request, res: Response) => {
      res.json({ body: req.body });
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app2.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      res.status(400).json({ success: false, message: err.message });
    });
    const r = await request(app2)
      .post('/api/v1/hosting/files/content')
      .send({ name: '<script>alert(1)</script><p>x</p>' });
    expect(r.status).toBe(400);
  });
});
