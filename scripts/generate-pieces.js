import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const outDir = join(import.meta.dirname, '..', 'assets', 'pieces');
mkdirSync(outDir, { recursive: true });

const pieces = [
  { id: 'FU', kanji: '歩', promoted: false },
  { id: 'KY', kanji: '香', promoted: false },
  { id: 'KE', kanji: '桂', promoted: false },
  { id: 'GI', kanji: '銀', promoted: false },
  { id: 'KI', kanji: '金', promoted: false },
  { id: 'KA', kanji: '角', promoted: false },
  { id: 'HI', kanji: '飛', promoted: false },
  { id: 'GY', kanji: '玉', promoted: false },
  { id: 'OU', kanji: '王', promoted: false },
  { id: 'TO', kanji: 'と', promoted: true },
  { id: 'NY', kanji: '杏', promoted: true },
  { id: 'NK', kanji: '圭', promoted: true },
  { id: 'NG', kanji: '全', promoted: true },
  { id: 'UM', kanji: '馬', promoted: true },
  { id: 'RY', kanji: '龍', promoted: true },
];

function makeSvg(kanji, promoted, rotated) {
  const fill = '#F5DEB3';
  const stroke = '#8B7355';
  const textColor = promoted ? '#CC0000' : '#333333';
  const transform = rotated ? ' transform="rotate(180 50 55)"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110">
  <g${transform}>
    <polygon points="50,6 90,36 80,104 20,104 10,36" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
    <polygon points="50,10 86,38 77,100 23,100 14,38" fill="none" stroke="${stroke}" stroke-width="0.5" opacity="0.4"/>
    <text x="50" y="62" text-anchor="middle" dominant-baseline="middle" font-family="'Hiragino Mincho ProN','Yu Mincho','MS Mincho',serif" font-size="44" fill="${textColor}">${kanji}</text>
  </g>
</svg>`;
}

for (const p of pieces) {
  writeFileSync(join(outDir, `0${p.id}.svg`), makeSvg(p.kanji, p.promoted, false));
  writeFileSync(join(outDir, `1${p.id}.svg`), makeSvg(p.kanji, p.promoted, true));
}

console.log(`Generated ${pieces.length * 2} piece SVGs in ${outDir}`);
