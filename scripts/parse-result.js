// 用 node 解析 JSON（避開 Windows cp950 編碼問題）
const fs = require('fs');
const data = fs.readFileSync('C:/Users/user/ai-result.json');
const d = JSON.parse(data.toString('utf8'));

if (d.error) {
  console.log('[ERR]', d.message);
  process.exit(1);
}

const r = d.report;
console.log('[OK] AI Report generated');
console.log('  Summary    :', (r.summary || '').slice(0, 120));
console.log('  Highlights :', (r.highlights || []).length, 'items');
console.log('  Strengths  :', (r.strengths || []).length, 'items');
console.log('  Scores     :');
const s = r.scores || {};
Object.entries(s).forEach(([k, v]) => console.log(`    ${k.padEnd(20)} : ${v}`));
console.log('  Financial  :', (r.financialAnalysis || '').slice(0, 120));
console.log('  Conclusion :', (r.conclusion || '').slice(0, 120));