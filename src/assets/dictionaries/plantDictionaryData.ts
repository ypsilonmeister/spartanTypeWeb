import type { PlantGroup } from '../../types/practice';

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
