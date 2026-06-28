export interface PlantNode {
  level: 'family' | 'genus' | 'species';
  japanese: string;
  romaji: string;
}

export interface PlantGroup {
  family: PlantNode;
  genuses: {
    genus: PlantNode;
    species: PlantNode[];
  }[];
}

export const plantDictionary: PlantGroup[] = [
  {
    family: { level: 'family', japanese: 'キク科', romaji: 'KIKUKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'タンポポ属', romaji: 'TANPOPOZOKU' },
        species: [
          { level: 'species', japanese: 'セイヨウタンポポ', romaji: 'SEIYOUTANPOPO' },
          { level: 'species', japanese: 'カントウタンポポ', romaji: 'KANTOUTANPOPO' },
          { level: 'species', japanese: 'シロバナタンポポ', romaji: 'SIROBANATANPOPO' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'キク属', romaji: 'KIKUZOKU' },
        species: [
          { level: 'species', japanese: 'リュウノウギク', romaji: 'RYUUNOUGIKU' },
          { level: 'species', japanese: 'ノジギク', romaji: 'NOZIGIKU' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'ヒマワリ属', romaji: 'HIMAWARIZOKU' },
        species: [
          { level: 'species', japanese: 'ヒマワリ', romaji: 'HIMAWARI' },
          { level: 'species', japanese: 'キクイモ', romaji: 'KIKUIMO' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'ヨモギ属', romaji: 'YOMOGIZOKU' },
        species: [
          { level: 'species', japanese: 'ヨモギ', romaji: 'YOMOGI' },
          { level: 'species', japanese: 'カワラヨモギ', romaji: 'KAWARAYOMOGI' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'バラ科', romaji: 'BARAKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'サクラ属', romaji: 'SAKURAZOKU' },
        species: [
          { level: 'species', japanese: 'ソメイヨシノ', romaji: 'SOMEIYOSINO' },
          { level: 'species', japanese: 'ヤマザクラ', romaji: 'YAMAZAKURA' },
          { level: 'species', japanese: 'ウメ', romaji: 'UME' },
          { level: 'species', japanese: 'モモ', romaji: 'MOMO' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'バラ属', romaji: 'BARAZOKU' },
        species: [
          { level: 'species', japanese: 'ノイバラ', romaji: 'NOIBARA' },
          { level: 'species', japanese: 'ハマナス', romaji: 'HAMANASU' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'リンゴ属', romaji: 'RINGOZOKU' },
        species: [
          { level: 'species', japanese: 'セイヨウリンゴ', romaji: 'SEIYOURINGO' },
          { level: 'species', japanese: 'ズミ', romaji: 'ZUMI' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'キイチゴ属', romaji: 'KIITIGOZOKU' },
        species: [
          { level: 'species', japanese: 'モミジイチゴ', romaji: 'MOMIZIITIGO' },
          { level: 'species', japanese: 'クマイチゴ', romaji: 'KUMAITIGO' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'ナス科', romaji: 'NASUKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'ナス属', romaji: 'NASUZOKU' },
        species: [
          { level: 'species', japanese: 'ジャガイモ', romaji: 'ZYAGAIMO' },
          { level: 'species', japanese: 'トマト', romaji: 'TOMATO' },
          { level: 'species', japanese: 'ナス', romaji: 'NASU' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'トウガラシ属', romaji: 'TOUGARASIZOKU' },
        species: [
          { level: 'species', japanese: 'トウガラシ', romaji: 'TOUGARASI' },
          { level: 'species', japanese: 'ピーマン', romaji: 'PIIMAN' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'タバコ属', romaji: 'TABAKOZOKU' },
        species: [
          { level: 'species', japanese: 'タバコ', romaji: 'TABAKO' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'バショウ科', romaji: 'BASYOUKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'バショウ属', romaji: 'BASYOUZOKU' },
        species: [
          { level: 'species', japanese: 'バナナ', romaji: 'BANANA' },
          { level: 'species', japanese: 'バショウ', romaji: 'BASYOU' },
          { level: 'species', japanese: 'リュウキュウバショウ', romaji: 'RYUUKYUUBASYOU' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'イネ科', romaji: 'INEKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'イネ属', romaji: 'INEZOKU' },
        species: [
          { level: 'species', japanese: 'イネ', romaji: 'INE' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'コムギ属', romaji: 'KOMUGIZOKU' },
        species: [
          { level: 'species', japanese: 'パンコムギ', romaji: 'PANKOMUGI' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'タケ亜科', romaji: 'TAKEAKA' },
        species: [
          { level: 'species', japanese: 'マダケ', romaji: 'MADAKE' },
          { level: 'species', japanese: 'モウソウチク', romaji: 'MOUSOUTIKU' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'トウモロコシ属', romaji: 'TOUMOROKOSIZOKU' },
        species: [
          { level: 'species', japanese: 'トウモロコシ', romaji: 'TOUMOROKOSI' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'マメ科', romaji: 'MAMEKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'ダイズ属', romaji: 'DAIZUZOKU' },
        species: [
          { level: 'species', japanese: 'ダイズ', romaji: 'DAIZU' },
          { level: 'species', japanese: 'アズキ', romaji: 'AZUKI' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'フジ属', romaji: 'HUZIZOKU' },
        species: [
          { level: 'species', japanese: 'ノダフジ', romaji: 'NODAHUZI' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'ラッカセイ属', romaji: 'RAKKASEIZOKU' },
        species: [
          { level: 'species', japanese: 'ラッカセイ', romaji: 'RAKKASEI' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'アブラナ科', romaji: 'ABURANAKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'アブラナ属', romaji: 'ABURANAZOKU' },
        species: [
          { level: 'species', japanese: 'キャベツ', romaji: 'KYABETU' },
          { level: 'species', japanese: 'ハクサイ', romaji: 'HAKUSAI' },
          { level: 'species', japanese: 'ブロッコリー', romaji: 'BUROKKORII' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'ダイコン属', romaji: 'DAIKONZOKU' },
        species: [
          { level: 'species', japanese: 'ダイコン', romaji: 'DAIKON' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'ワサビ属', romaji: 'WASABIZOKU' },
        species: [
          { level: 'species', japanese: 'ワサビ', romaji: 'WASABI' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'ウリ科', romaji: 'URIKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'キュウリ属', romaji: 'KYUURIZOKU' },
        species: [
          { level: 'species', japanese: 'キュウリ', romaji: 'KYUURI' },
          { level: 'species', japanese: 'メロン', romaji: 'MERON' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'スイカ属', romaji: 'SUIKAZOKU' },
        species: [
          { level: 'species', japanese: 'スイカ', romaji: 'SUIKA' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'カボチャ属', romaji: 'KABOTYAZOKU' },
        species: [
          { level: 'species', japanese: 'カボチャ', romaji: 'KABOTYA' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'ユリ科', romaji: 'YURIKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'ユリ属', romaji: 'YURIZOKU' },
        species: [
          { level: 'species', japanese: 'ヤマユリ', romaji: 'YAMAYURI' },
          { level: 'species', japanese: 'テッポウユリ', romaji: 'TEPPOUYURI' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'チューリップ属', romaji: 'TYUURIPPUZOKU' },
        species: [
          { level: 'species', japanese: 'チューリップ', romaji: 'TYUURIPPU' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'ブナ科', romaji: 'BUNAKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'コナラ属', romaji: 'KONARAZOKU' },
        species: [
          { level: 'species', japanese: 'コナラ', romaji: 'KONARA' },
          { level: 'species', japanese: 'クヌギ', romaji: 'KUNUGI' },
          { level: 'species', japanese: 'シラカシ', romaji: 'SIRAKASI' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'ブナ属', romaji: 'BUNAZOKU' },
        species: [
          { level: 'species', japanese: 'ブナ', romaji: 'BUNA' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'クリ属', romaji: 'KURIZOKU' },
        species: [
          { level: 'species', japanese: 'クリ', romaji: 'KURI' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'マツ科', romaji: 'MATUKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'マツ属', romaji: 'MATUZOKU' },
        species: [
          { level: 'species', japanese: 'アカマツ', romaji: 'AKAMATU' },
          { level: 'species', japanese: 'クロマツ', romaji: 'KUROMATU' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'モミ属', romaji: 'MOMIZOKU' },
        species: [
          { level: 'species', japanese: 'モミ', romaji: 'MOMI' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'ラン科', romaji: 'RANKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'シュンラン属', romaji: 'SYUNRANZOKU' },
        species: [
          { level: 'species', japanese: 'シュンラン', romaji: 'SYUNRAN' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'セッコク属', romaji: 'SEKKOKUZOKU' },
        species: [
          { level: 'species', japanese: 'セッコク', romaji: 'SEKKOKU' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'ツバキ科', romaji: 'TUBAKIKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'ツバキ属', romaji: 'TUBAKIZOKU' },
        species: [
          { level: 'species', japanese: 'ヤブツバキ', romaji: 'YABUTUBAKI' },
          { level: 'species', japanese: 'サザンカ', romaji: 'SAZANKA' },
          { level: 'species', japanese: 'チャノキ', romaji: 'TYANOKI' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'カエデ科', romaji: 'KAEDEKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'カエデ属', romaji: 'KAEDEZOKU' },
        species: [
          { level: 'species', japanese: 'イロハモミジ', romaji: 'IROHAMOMIZI' },
          { level: 'species', japanese: 'ハウチワカエデ', romaji: 'HAUTIWAKAEDE' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'シソ科', romaji: 'SISOKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'シソ属', romaji: 'SISOZOKU' },
        species: [
          { level: 'species', japanese: 'シソ', romaji: 'SISO' },
          { level: 'species', japanese: 'エゴマ', romaji: 'EGOMA' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'ハッカ属', romaji: 'HAKKAZOKU' },
        species: [
          { level: 'species', japanese: 'ハッカ', romaji: 'HAKKA' },
          { level: 'species', japanese: 'セイヨウハッカ', romaji: 'SEIYOUHAKKA' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'ラベンダー属', romaji: 'RABENDAAZOKU' },
        species: [
          { level: 'species', japanese: 'ラベンダー', romaji: 'RABENDAA' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'ヒルガオ科', romaji: 'HIRUGAOKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'サツマイモ属', romaji: 'SATUMAIMOZOKU' },
        species: [
          { level: 'species', japanese: 'サツマイモ', romaji: 'SATUMAIMO' },
          { level: 'species', japanese: 'アサガオ', romaji: 'ASAGAO' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'スギ科', romaji: 'SUGIKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'スギ属', romaji: 'SUGIZOKU' },
        species: [
          { level: 'species', japanese: 'スギ', romaji: 'SUGI' }
        ]
      }
    ]
  }
];

/**
 * Flattens the hierarchical dictionary into a linear practice list where each
 * word "evolves" by accumulating its ancestry as a prefix:
 *
 *   バナナ
 *   バショウ属バナナ
 *   バショウ科バショウ属バナナ
 *
 * The species node is the seed; the genus name, then the family name, are
 * prepended in successive evolution stages. The `node` returned for each entry
 * carries the *cumulative* japanese/romaji so the trainer types the full
 * grown form, while `path` shows the human-readable classification chain.
 *
 * Pass `{ shuffle: true }` to randomize the order in which entries appear
 * (Fisher-Yates). Each evolution stage is shuffled independently as its own
 * entry, so a fully-evolved form may appear before its bare-species seed.
 */
export function getFlatPracticeList(
  options: { shuffle?: boolean } = {}
): { node: PlantNode, path: string }[] {
  const list: { node: PlantNode, path: string }[] = [];

  plantDictionary.forEach(group => {
    group.genuses.forEach(g => {
      g.species.forEach(s => {
        // Stage 1: bare species (the seed)
        list.push({
          node: { ...s },
          path: s.japanese
        });

        // Stage 2: genus prefix prepended
        list.push({
          node: {
            level: 'genus',
            japanese: `${g.genus.japanese}${s.japanese}`,
            romaji: `${g.genus.romaji}${s.romaji}`
          },
          path: `${g.genus.japanese} ➔ ${s.japanese}`
        });

        // Stage 3: family + genus prefix prepended (fully evolved)
        list.push({
          node: {
            level: 'family',
            japanese: `${group.family.japanese}${g.genus.japanese}${s.japanese}`,
            romaji: `${group.family.romaji}${g.genus.romaji}${s.romaji}`
          },
          path: `${group.family.japanese} ➔ ${g.genus.japanese} ➔ ${s.japanese}`
        });
      });
    });
  });

  if (options.shuffle) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  return list;
}

/* ------------------------------------------------------------------ *
 * Practice categories
 *
 * The trainer matches keystrokes against `node.romaji` (uppercase A-Z),
 * so every category exposes the same `{ node, path }` shape that the
 * plant dictionary produces. Beyond plants we offer:
 *
 *   - programmer:  English coding keywords (PRINT, RETURN, FUNCTION...).
 *                  `japanese` holds a friendly meaning label, `romaji`
 *                  is the literal keyword to type.
 *   - beginner:    早期レベル。あいうえお〜やさしい単語をローマ字で。
 *                  `japanese` はひらがな表示、`romaji` は打鍵対象。
 * ------------------------------------------------------------------ */

export type PracticeCategory = 'plant' | 'programmer' | 'beginner';

export interface PracticeEntry {
  node: PlantNode;
  path: string;
}

/** A flat word: japanese=表示ラベル, romaji=打鍵対象(大文字A-Z), path=補足. */
interface FlatWord {
  japanese: string;
  romaji: string;
  path: string;
}

const programmerWords: FlatWord[] = [
  // 基本コマンド
  { japanese: '表示する', romaji: 'PRINT', path: 'きほんコマンド' },
  { japanese: '返す', romaji: 'RETURN', path: 'きほんコマンド' },
  { japanese: '関数', romaji: 'FUNCTION', path: 'きほんコマンド' },
  { japanese: '変数', romaji: 'VARIABLE', path: 'きほんコマンド' },
  { japanese: '定数', romaji: 'CONST', path: 'きほんコマンド' },
  { japanese: '読み込む', romaji: 'IMPORT', path: 'きほんコマンド' },
  { japanese: '書き出す', romaji: 'EXPORT', path: 'きほんコマンド' },
  { japanese: 'もし', romaji: 'IF', path: '制御' },
  { japanese: 'そうでなければ', romaji: 'ELSE', path: '制御' },
  { japanese: '繰り返す', romaji: 'FOR', path: '制御' },
  { japanese: '〜の間', romaji: 'WHILE', path: '制御' },
  { japanese: '抜ける', romaji: 'BREAK', path: '制御' },
  { japanese: '続ける', romaji: 'CONTINUE', path: '制御' },
  { japanese: '真', romaji: 'TRUE', path: '値' },
  { japanese: '偽', romaji: 'FALSE', path: '値' },
  { japanese: '空', romaji: 'NULL', path: '値' },
  { japanese: '配列', romaji: 'ARRAY', path: 'データ' },
  { japanese: '文字列', romaji: 'STRING', path: 'データ' },
  { japanese: '数値', romaji: 'NUMBER', path: 'データ' },
  { japanese: 'オブジェクト', romaji: 'OBJECT', path: 'データ' },
  { japanese: 'クラス', romaji: 'CLASS', path: 'データ' },
  // 道具・概念
  { japanese: 'コード', romaji: 'CODE', path: 'がいねん' },
  { japanese: 'バグ', romaji: 'BUG', path: 'がいねん' },
  { japanese: 'デバッグ', romaji: 'DEBUG', path: 'がいねん' },
  { japanese: 'コンパイル', romaji: 'COMPILE', path: 'がいねん' },
  { japanese: 'サーバー', romaji: 'SERVER', path: 'がいねん' },
  { japanese: 'データ', romaji: 'DATA', path: 'がいねん' },
  { japanese: 'ファイル', romaji: 'FILE', path: 'がいねん' },
  { japanese: 'キー', romaji: 'KEY', path: 'がいねん' },
  { japanese: '値', romaji: 'VALUE', path: 'がいねん' },
  { japanese: 'ループ', romaji: 'LOOP', path: 'がいねん' }
];

const beginnerWords: FlatWord[] = [
  // あ行 〜 文字をひとつずつ
  { japanese: 'あ', romaji: 'A', path: 'あいうえお' },
  { japanese: 'い', romaji: 'I', path: 'あいうえお' },
  { japanese: 'う', romaji: 'U', path: 'あいうえお' },
  { japanese: 'え', romaji: 'E', path: 'あいうえお' },
  { japanese: 'お', romaji: 'O', path: 'あいうえお' },
  { japanese: 'か', romaji: 'KA', path: 'かきくけこ' },
  { japanese: 'き', romaji: 'KI', path: 'かきくけこ' },
  { japanese: 'く', romaji: 'KU', path: 'かきくけこ' },
  { japanese: 'け', romaji: 'KE', path: 'かきくけこ' },
  { japanese: 'こ', romaji: 'KO', path: 'かきくけこ' },
  { japanese: 'さ', romaji: 'SA', path: 'さしすせそ' },
  { japanese: 'し', romaji: 'SI', path: 'さしすせそ' },
  { japanese: 'す', romaji: 'SU', path: 'さしすせそ' },
  { japanese: 'せ', romaji: 'SE', path: 'さしすせそ' },
  { japanese: 'そ', romaji: 'SO', path: 'さしすせそ' },
  { japanese: 'た', romaji: 'TA', path: 'たちつてと' },
  { japanese: 'て', romaji: 'TE', path: 'たちつてと' },
  { japanese: 'と', romaji: 'TO', path: 'たちつてと' },
  { japanese: 'な', romaji: 'NA', path: 'なにぬねの' },
  { japanese: 'ね', romaji: 'NE', path: 'なにぬねの' },
  { japanese: 'の', romaji: 'NO', path: 'なにぬねの' },
  { japanese: 'は', romaji: 'HA', path: 'はひふへほ' },
  { japanese: 'ひ', romaji: 'HI', path: 'はひふへほ' },
  { japanese: 'ま', romaji: 'MA', path: 'まみむめも' },
  { japanese: 'み', romaji: 'MI', path: 'まみむめも' },
  { japanese: 'め', romaji: 'ME', path: 'まみむめも' },
  { japanese: 'や', romaji: 'YA', path: 'やゆよ' },
  { japanese: 'ゆ', romaji: 'YU', path: 'やゆよ' },
  { japanese: 'よ', romaji: 'YO', path: 'やゆよ' },
  { japanese: 'ら', romaji: 'RA', path: 'らりるれろ' },
  { japanese: 'り', romaji: 'RI', path: 'らりるれろ' },
  { japanese: 'わ', romaji: 'WA', path: 'わをん' },
  // やさしい たんご
  { japanese: 'あお', romaji: 'AO', path: 'やさしいことば' },
  { japanese: 'あか', romaji: 'AKA', path: 'やさしいことば' },
  { japanese: 'いぬ', romaji: 'INU', path: 'やさしいことば' },
  { japanese: 'ねこ', romaji: 'NEKO', path: 'やさしいことば' },
  { japanese: 'うみ', romaji: 'UMI', path: 'やさしいことば' },
  { japanese: 'そら', romaji: 'SORA', path: 'やさしいことば' },
  { japanese: 'はな', romaji: 'HANA', path: 'やさしいことば' },
  { japanese: 'やま', romaji: 'YAMA', path: 'やさしいことば' },
  { japanese: 'みず', romaji: 'MIZU', path: 'やさしいことば' },
  { japanese: 'ほし', romaji: 'HOSI', path: 'やさしいことば' },
  { japanese: 'つき', romaji: 'TUKI', path: 'やさしいことば' },
  { japanese: 'たいよう', romaji: 'TAIYOU', path: 'やさしいことば' }
];

function toEntries(words: FlatWord[], options: { shuffle?: boolean }): PracticeEntry[] {
  const list: PracticeEntry[] = words.map(w => ({
    node: { level: 'species', japanese: w.japanese, romaji: w.romaji },
    path: w.path
  }));

  if (options.shuffle) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  return list;
}

/** Human-readable labels for the category selector UI. */
export const practiceCategoryLabels: Record<PracticeCategory, string> = {
  plant: '🌱 植物の名前',
  programmer: '💻 プログラマー',
  beginner: 'あ 初級（あいうえお）'
};

/**
 * Unified accessor used by the trainer. Returns the practice list for the
 * requested category, all sharing the `{ node, path }` shape.
 */
export function getPracticeList(
  category: PracticeCategory,
  options: { shuffle?: boolean } = {}
): PracticeEntry[] {
  switch (category) {
    case 'programmer':
      return toEntries(programmerWords, options);
    case 'beginner':
      return toEntries(beginnerWords, options);
    case 'plant':
    default:
      return getFlatPracticeList(options);
  }
}
