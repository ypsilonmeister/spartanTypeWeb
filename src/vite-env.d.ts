/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" / "true" のときだけ解析パイプラインの計測が有効になる。 */
  readonly VITE_ANALYSIS_PROFILE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
