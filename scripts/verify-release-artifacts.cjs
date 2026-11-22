const fs = require('node:fs');
const crypto = require('node:crypto');
const asar = require('@electron/asar');
const yaml = require('js-yaml');
const path = require('node:path');
const assert = require('node:assert/strict');
const { version } = require('../package.json');
const root = path.resolve(__dirname, '..');
const manifest = yaml.load(fs.readFileSync(path.join(root, 'release/latest.yml'), 'utf8'));
const file = manifest.files[0];
const installer = fs.readFileSync(path.join(root, 'release', decodeURIComponent(file.url)));
assert.equal(manifest.version, version);
assert.equal(file.size, installer.length);
assert.equal(file.sha512, crypto.createHash('sha512').update(installer).digest('base64'));
assert.equal(manifest.sha512, file.sha512);
const archive = path.join(root, 'release/win-unpacked/resources/app.asar');
const entries = asar.listPackage(archive).map(name => name.replace(/\\/g, '/').replace(/^\//, ''));
const forbidden = entries.filter(name => !name.startsWith('node_modules/') && (/(^|\/)(\.env(?:\..*)?|\.git|\.codex-tmp|backups|archivos-locales|purchases|tests|scripts)(\/|$)/i.test(name) || /\.(?:pem|pfx|dump|backup|bak)$/i.test(name)));
assert.deepEqual(forbidden, [], 'Private build input included');
const extract = name => asar.extractFile(archive, name.split('/').join(path.sep)).toString();
const pkg = JSON.parse(extract('package.json'));
assert.equal(pkg.version, version);
const bundles = entries.filter(name => /^dist\/assets\/.*\.js$/.test(name)).map(extract).join('\n');
for (const name of entries.filter(name => name.startsWith('dist/'))) {
  const current = path.join(root, name);
  if (fs.statSync(current).isFile()) {
    assert.deepEqual(asar.extractFile(archive, name.split('/').join(path.sep)), fs.readFileSync(current), `Packaged bundle differs from the current build: ${name}`);
  }
}
for (const token of ['rebu_offline_actions_v1', 'REBU_OFFLINE', 'Pendientes sin conexión']) assert.ok(bundles.includes(token), `Offline feature missing: ${token}`);
for (const token of ['save_product_deposit_once', 'supplier-cart-read']) assert.ok(!bundles.includes(token), `Unrelated feature included: ${token}`);
const values = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
const key = values.VITE_SUPABASE_ANON_KEY;
const role = key.startsWith('sb_publishable_') ? 'publishable' : JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role;
assert.ok(['anon', 'publishable'].includes(role), 'Privileged key in frontend');
const result = { version, installer: file.url, bytes: installer.length, sha512: file.sha512, blockmap: fs.statSync(path.join(root, 'release', file.url + '.blockmap')).size, bundledFiles: entries.length, privateFiles: forbidden.length, publicKeyRole: role };
fs.writeFileSync(path.join(root, '.codex-tmp/release-verification.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
