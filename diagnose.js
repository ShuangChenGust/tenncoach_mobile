const fs = require('fs');
const c = fs.readFileSync('D:/TennisMatch/tenncoach-mobile/app/(tabs)/view-resources.tsx', 'utf8');
const lines = c.split('\n');
const bad = [];
lines.forEach((l, i) => {
  if (l.includes('\ufffd')) bad.push({ n: i + 1, t: l.substring(0, 140) });
});
console.log('count:', bad.length);
bad.forEach(x => console.log('L' + x.n + ':', JSON.stringify(x.t)));
