// FIX SCRIPT v2
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/(tabs)/view-resources.tsx');
let c = fs.readFileSync(filePath, 'utf8');

// Corruption pattern: each special char was replaced with \ufffd + '?' (two chars)
const CORR = '\ufffd?'; // the two-char corruption sequence

const fixes = [
  // Template literal: ${w.start}–${w.end}
  ['`${w.start}' + CORR + '{w.end}`', '`${w.start}\u2013${w.end}`'],
  // wins.map join / : '—'  (end of ternary string '—')
  ["'" + CORR + "}", "'\u2014'}"],  // covers '—' at end: replace \ufffd?} with \u2014'} -- wait that won't work
  // {s.start} – {s.end}
  ['{s.start} ' + CORR + ' {s.end}', '{s.start} \u2013 {s.end}'],
  // 🗓️ calendar emoji (variation selector eaten -> \ufffd?)
  ['\uD83D\uDDD3' + CORR, '\uD83D\uDDD3\uFE0F'],
  // ⊕ extra open slots
  [CORR + ' Extra open slots', '\u2295 Extra open slots'],
  // ❓ FAQ
  ['>' + CORR + ' FAQ<', '>\u2753 FAQ<'],
  // ← Back
  ['>' + CORR + ' Back<', '>\u2190 Back<'],
  // ✓ Verified
  ['>' + CORR + ' Verified<', '>\u2713 Verified<'],
  // ★{Number in rating stat
  ['>' + CORR + '{Number', '>\u2605{Number'],
  // '—' hide_price (the corruption replaces '—')
  ["? '" + CORR + " : rate", "? '\u2014' : rate"],
  ["`$${rate}` : '" + CORR, "`$${rate}` : '\u2014'"],
  // wins join \ '—' at end (': '—'}
  [", ') : '" + CORR + "}", ", ') : '\u2014'}"],
  // ⭐ REVIEWS
  [CORR + ' REVIEWS', '\u2b50 REVIEWS'],
  // ⭐ Leave a Review
  [CORR + ' Leave a Review', '\u2b50 Leave a Review'],
  // 'Submitting…'
  ["'Submitting" + CORR + "'", "'Submitting\u2026'"],
  // 🕐 start – end in glBadge (fmtTime result)
  [') } ' + CORR + ' {fmtTime', ') } \u2013 {fmtTime'],
  [') }) ' + CORR + ' {fmtTime', ') }) \u2013 {fmtTime'],
  // Handle generic: fmtTime(...)} CORR {fmtTime
  ['fmtTime(selectedLesson.start_time)} ' + CORR + ' {fmtTime', 'fmtTime(selectedLesson.start_time)} \u2013 {fmtTime'],
  ['fmtTime(item.start_time)} ' + CORR + ' {fmtTime', 'fmtTime(item.start_time)} \u2013 {fmtTime'],
  // ✅ registered
  ["'" + CORR + " You are registered", "'\u2705 You are registered"],
  // ⏳ pending
  ["'" + CORR + " Your request is pending", "'\u23f3 Your request is pending"],
  // ⏳ waitlist
  ["'" + CORR + " You are on the waitlist", "'\u23f3 You are on the waitlist"],
  // Registering…
  ["'Registering" + CORR, "'Registering\u2026"],
  // ✅ Register Now
  ["'" + CORR + " Register Now'", "'\u2705 Register Now'"],
  // Search coaches… / classes…
  ["'Search coaches" + CORR + "'", "'Search coaches\u2026'"],
  ["'Search classes" + CORR + "'", "'Search classes\u2026'"],
  // ✅ Registered / ⏳ Pending / ⏳ Waitlisted
  ["'" + CORR + " Registered'", "'\u2705 Registered'"],
  ["'" + CORR + " Pending'", "'\u23f3 Pending'"],
  ["'" + CORR + " Waitlisted'", "'\u23f3 Waitlisted'"],
  // placeholder="Write your message…"
  ['placeholder="Write your message' + CORR + '"', 'placeholder="Write your message\u2026"'],
  // Sending…
  ["'Sending" + CORR + "'", "'Sending\u2026'"],
  // 'Sending… : 'Send Booking
  ["'Sending" + CORR + " : 'Send", "'Sending\u2026' : 'Send"],
  // placeholder="Any special requests or notes…"
  ['placeholder="Any special requests or notes' + CORR + '"', 'placeholder="Any special requests or notes\u2026"'],
  // View → in card footer
  ['>View ' + CORR + '</Text>', '>View \u2192</Text>'],
  // Generic: 'Sending… without closing quote (ternary)
  ["'Sending" + CORR, "'Sending\u2026'"],
];

let count = 0;
for (const [pat, rep] of fixes) {
  const before = c;
  c = c.replace(pat, rep);
  if (c !== before) { count++; }
}

const remaining = (c.match(/\ufffd/g) || []).length;
console.log('Fixed', count, 'patterns. Remaining corruptions:', remaining);

if (remaining > 0) {
  c.split('\n').forEach((l, i) => {
    if (l.includes('\ufffd')) console.log('  STILL BAD line', i + 1, ':', l.substring(0, 100));
  });
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Done. Lines:', c.split('\n').length);
