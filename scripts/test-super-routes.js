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
  const csrf = loginPage.body.match(/name="_csrf" value="([^"]+)"/)[1];
  const body = `_csrf=${encodeURIComponent(csrf)}&usuario=admin&senha=admin123`;
  const post = await req('POST', '/super/login', {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(body),
    Cookie: cookie
  }, body);
  const c = [cookie, ...(post.headers['set-cookie'] || []).map((x) => x.split(';')[0])].join('; ');

  for (const path of ['/super', '/super/sistemas', '/super/rifas', '/super/vendas', '/super/organizadores', '/super/plataforma', '/super/marketing']) {
    const r = await req('GET', path, { Cookie: c }, null);
    console.log(path, r.status, r.body.length);
  }
})().catch(console.error);
