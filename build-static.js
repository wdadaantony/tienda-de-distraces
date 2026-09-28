const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, 'public');
fs.mkdirSync(path.join(out, 'data'), { recursive: true });
fs.copyFileSync(path.join(__dirname, 'data', 'db.json'), path.join(out, 'data', 'db.json'));
fs.cpSync(path.join(__dirname, 'uploads'), path.join(out, 'uploads'), { recursive: true });
