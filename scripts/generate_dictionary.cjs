const fs = require('fs');

const katakanaToRomajiMap = {
  'ア': 'A', 'イ': 'I', 'ウ': 'U', 'エ': 'E', 'オ': 'O',
  'カ': 'KA', 'キ': 'KI', 'ク': 'KU', 'ケ': 'KE', 'コ': 'KO',
  'サ': 'SA', 'シ': 'SI', 'ス': 'SU', 'セ': 'SE', 'ソ': 'SO',
  'タ': 'TA', 'チ': 'TI', 'ツ': 'TU', 'テ': 'TE', 'ト': 'TO',
  'ナ': 'NA', 'ニ': 'NI', 'ヌ': 'NU', 'ネ': 'NE', 'ノ': 'NO',
  'ハ': 'HA', 'ヒ': 'HI', 'フ': 'HU', 'ヘ': 'HE', 'ホ': 'HO',
  'マ': 'MA', 'ミ': 'MI', 'ム': 'MU', 'メ': 'ME', 'モ': 'MO',
  'ヤ': 'YA', 'ユ': 'YU', 'ヨ': 'YO',
  'ラ': 'RA', 'リ': 'RI', 'ル': 'RU', 'レ': 'RE', 'ロ': 'RO',
  'ワ': 'WA', 'ヲ': 'WO', 'ン': 'N',
  'ガ': 'GA', 'ギ': 'GI', 'グ': 'GU', 'ゲ': 'GE', 'ゴ': 'GO',
  'ザ': 'ZA', 'ジ': 'ZI', 'ズ': 'ZU', 'ゼ': 'ZE', 'ゾ': 'ZO',
  'ダ': 'DA', 'ヂ': 'ZI', 'ヅ': 'ZU', 'デ': 'DE', 'ド': 'DO',
  'バ': 'BA', 'ビ': 'BI', 'ブ': 'BU', 'ベ': 'BE', 'ボ': 'BO',
  'パ': 'PA', 'ピ': 'PI', 'プ': 'PU', 'ペ': 'PE', 'ポ': 'PO',
  'ァ': 'A', 'ィ': 'I', 'ゥ': 'U', 'ェ': 'E', 'ォ': 'O',
  'ヮ': 'WA',
  'ー': '' // Long vowel omitted in simple romaji matching
};

const yoonMap = {
  'キャ': 'KYA', 'キュ': 'KYU', 'キョ': 'KYO',
  'シャ': 'SYA', 'シュ': 'SYU', 'ショ': 'SYO',
  'チャ': 'TYA', 'チュ': 'TYU', 'チョ': 'TYO',
  'ニャ': 'NYA', 'ニュ': 'NYU', 'ニョ': 'NYO',
  'ヒャ': 'HYA', 'ヒュ': 'HYU', 'ヒョ': 'HYO',
  'ミャ': 'MYA', 'ミュ': 'MYU', 'ミョ': 'MYO',
  'リャ': 'RYA', 'リュ': 'RYU', 'リョ': 'RYO',
  'ギャ': 'GYA', 'ギュ': 'GYU', 'ギョ': 'GYO',
  'ジャ': 'ZYA', 'ジュ': 'ZYU', 'ジョ': 'ZYO',
  'ビャ': 'BYA', 'ビュ': 'BYU', 'ビョ': 'BYO',
  'ピャ': 'PYA', 'ピュ': 'PYU', 'ピョ': 'PYO'
};

function convertKatakanaToRomaji(text) {
  let result = '';
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    // Handle standard suffixes like "科" (KA), "属" (ZOKU)
    if (char === '科') {
      result += 'KA';
      i++;
      continue;
    }
    if (char === '属') {
      result += 'ZOKU';
      i++;
      continue;
    }

    // Yoon (small y-kana like キャ, シュ)
    if (nextChar && (nextChar === 'ャ' || nextChar === 'ュ' || nextChar === 'ョ')) {
      const combo = char + nextChar;
      if (yoonMap[combo]) {
        result += yoonMap[combo];
        i += 2;
        continue;
      }
    }

    // Sokuon (small ッ)
    if (char === 'ッ' && nextChar) {
      // Find the romaji of the next character and double its first consonant
      const nextRomaji = convertKatakanaToRomaji(nextChar);
      if (nextRomaji) {
        result += nextRomaji[0]; // double the consonant
      }
      i++;
      continue;
    }

    // Standard Katakana map
    if (katakanaToRomajiMap[char] !== undefined) {
      result += katakanaToRomajiMap[char];
    } else {
      // Keep non-katakana characters as-is (e.g. English text)
      result += char.toUpperCase();
    }
    i++;
  }
  return result;
}

// Read input file or console args
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Usage: node scripts/generate_dictionary.cjs <text_file_path> or direct text string");
  console.log("Example format in file:");
  console.log("キク科\n  タンポポ属\n    セイヨウタンポポ\n    カントウタンポポ\n  キク属\n    リュウノウギク");
  process.exit(0);
}

let inputText = '';
if (fs.existsSync(args[0])) {
  inputText = fs.readFileSync(args[0], 'utf8');
} else {
  inputText = args.join('\n');
}

// Parse text lines hierarchical
const lines = inputText.split(/\r?\n/).filter(line => line.trim().length > 0);
const dictionary = [];

let currentFamily = null;
let currentGenus = null;

lines.forEach(line => {
  const indent = line.search(/\S/); // count leading spaces
  const name = line.trim();
  
  if (indent === 0) {
    // Family level
    currentFamily = {
      family: { level: 'family', japanese: name, romaji: convertKatakanaToRomaji(name) },
      genuses: []
    };
    dictionary.push(currentFamily);
    currentGenus = null;
  } else if (indent > 0 && indent <= 3) {
    // Genus level
    if (!currentFamily) {
      console.error("Error: Found Genus before any Family was defined.");
      process.exit(1);
    }
    currentGenus = {
      genus: { level: 'genus', japanese: name, romaji: convertKatakanaToRomaji(name) },
      species: []
    };
    currentFamily.genuses.push(currentGenus);
  } else if (indent > 3) {
    // Species level
    if (!currentGenus) {
      console.error("Error: Found Species before any Genus was defined.");
      process.exit(1);
    }
    currentGenus.species.push({
      level: 'species',
      japanese: name,
      romaji: convertKatakanaToRomaji(name)
    });
  }
});

// Write to typescript format
const outputContent = `import type { PlantGroup } from './plantDictionary';

export const plantDictionary: PlantGroup[] = ${JSON.stringify(dictionary, null, 2)};
`;

console.log("\n=== Generated TypeScript Code ===");
console.log(outputContent);

// Also offer writing to output file
const destFile = 'src/utils/plantDictionary.ts';
console.log(`Writing dictionary containing ${dictionary.length} families directly to ${destFile}...`);

// Keep existing exports/types, replace the array
const existingContent = fs.readFileSync(destFile, 'utf8');
const arrayStartIndex = existingContent.indexOf('export const plantDictionary: PlantGroup[] =');
if (arrayStartIndex !== -1) {
  const header = existingContent.substring(0, arrayStartIndex);
  const tailIndex = existingContent.indexOf('export function getFlatPracticeList()');
  const footer = tailIndex !== -1 ? existingContent.substring(tailIndex) : '';
  
  const finalFileContent = `${header}export const plantDictionary: PlantGroup[] = ${JSON.stringify(dictionary, null, 2)};\n\n${footer}`;
  fs.writeFileSync(destFile, finalFileContent, 'utf8');
  console.log("Successfully updated plantDictionary.ts!");
} else {
  console.log("Failed to locate plantDictionary variable to replace. Printed output instead.");
}
