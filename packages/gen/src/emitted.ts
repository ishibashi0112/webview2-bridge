/** エミッタが返すファイル。`path` は出力ディレクトリからの相対パス */
export interface EmittedFile {
  path: string;
  content: string;
}
