require('dotenv').config();
const http = require('http');

function req(method, path, headers, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ hostname: '127.0.0.1', port: 3000, path, method, headers }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  const loginPage = await req('GET', '/super/login', {}, null);
  const cookie = (loginPage.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  const csrfMatch = loginPage.body.match(/name="_csrf" value="([^"]+)"/);
  const csrf = csrfMatch ? csrfMatch[1] : null;
  console.log('csrf', csrf ? 'ok' : 'missing');

  const body = `_csrf=${encodeURIComponent(csrf)}&usuario=admin&senha=admin123`;
  const post = await req('POST', '/super/login', {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(body),
    Cookie: cookie
  }, body);
  const cookie2 = [cookie, ...(post.headers['set-cookie'] || []).map((c) => c.split(';')[0])].join('; ');
  console.log('login', post.status, post.headers.location);

  const dash = await req('GET', '/super', { Cookie: cookie2 }, null);
  console.log('dashboard', dash.status);
  if (dash.status !== 200) console.log(dash.body.slice(0, 500));
  else console.log('OK length', dash.body.length);
})().catch(console.error);
