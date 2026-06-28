# 実装プラン: 個人用Obsidian看板プラグイン (Kanban Flow)

## Context

`kanban_requirement.md`(v0.2、シニアレビュー反映済み)で仕様が確定した。本家
`obsidian-kanban`(Preact + mdastベース、約28,000行)を参照資料に、個人用途へ絞った軽量な看板
プラグインをSvelte 5でスクラッチ実装する。コア機能はボード内のカードD&D移動、ファイル形式は
本家互換、パーサーは自作(raw保存・往復無損失)。マルチウィンドウ/外部ドロップ/折りたたみ/
テーブル表示/モバイルは非対応にして本家の複雑さの大半を捨てる。

確定事項(ユーザー回答):
- 配置: ルート直下に新規サブディレクトリ `obsidian-kanban-flow/` を作成(本家クローンと並列)
- プラグイン: id=`obsidian-kanban-flow`, name=`Kanban Flow`, viewType=`kanban-flow`

ゴール: 仕様9章のラウンドトリップ・ゴールデンテストを受け入れ条件に、動くものを段階的に出す。

## 技術構成(仕様3章)

TypeScript + Svelte 5(runesモード) / D&D: svelte-dnd-action 0.9.69+ / ビュー: TextFileView継承 /
ビルド: esbuild + esbuild-svelte(`main.js` + `styles.css` 出力) / デスクトップ専用 /
frontmatterキー `kanban-plugin`(本家互換)。

## プロジェクト構成

すべて新規。作成先ルートは
`/Users/kamijo/precena/project/r_and_d/obsidian_kanban_flow/obsidian-kanban-flow/`。

```
obsidian-kanban-flow/
├── manifest.json          # id=obsidian-kanban-flow, name=Kanban Flow, minAppVersion, isDesktopOnly=true
├── versions.json          # {} 初期は空でよい
├── package.json           # 下記依存・scripts
├── tsconfig.json          # @tsconfig/svelte 継承, isolatedModules
├── svelte.config.js       # esbuild-svelte と svelte-check で preprocess 共有
├── esbuild.config.mjs     # 下記
├── vitest.config.ts
├── .gitignore             # node_modules, main.js, styles.css
├── src/
│   ├── main.ts            # Plugin: registerView + 新規作成コマンド
│   ├── KanbanView.ts      # TextFileView × Svelte mount/unmount × エコーガード
│   ├── constants.ts       # VIEW_TYPE='kanban-flow', frontmatterKey, completeString, archiveString, BOARD_TEMPLATE, hasFrontmatterKeyRaw
│   ├── model/
│   │   ├── types.ts       # Board/Lane/Card/RawBlock
│   │   ├── store.svelte.ts# BoardStore($state) + 状態操作 + 完了同期
│   │   └── metadata.ts    # / 分離・付与・除去の純関数
│   ├── parser/
│   │   ├── parse.ts       # md → Board(行ベース)
│   │   └── serialize.ts   # Board → md(無損失)
│   └── ui/
│       ├── Board.svelte   # setContext で store 配布
│       ├── Lane.svelte    # use:dndzone(カード)
│       ├── Card.svelte    # displayTitle 表示 + インライン編集
│       └── dnd.ts         # finalize → store へ変換する薄い層
└── tests/
    ├── roundtrip.test.ts  # serialize(parse(md)) === md
    ├── metadata.test.ts
    ├── completion.test.ts
    └── fixtures/*.md
```

### ビルド設定の要点

依存: dependencies に `svelte-dnd-action`(バンドルする)。devDependencies に
`svelte@^5`, `esbuild`, `esbuild-svelte`(Svelte5対応版), `svelte-check@^4`, `svelte-preprocess`,
`@tsconfig/svelte`, `vitest`, `typescript`, `builtin-modules`, `obsidian`, `tslib`。
`svelte` も `svelte-dnd-action` も external にしない(Obsidianはこれらを提供しない)。

esbuild.config.mjs(本家 `obsidian-kanban/esbuild.config.mjs:203-263` を簡素化):
- `entryPoints: ['src/main.ts']`, `bundle:true`, `format:'cjs'`, `target:'es2018'`, `outfile:'main.js'`
- `external: ['obsidian','electron','@codemirror/*','@lezer/*', ...builtins]`
- plugins:
  - `esbuildSvelte({ compilerOptions: { css:'external', runes:true, dev:!isProd }, preprocess: sveltePreprocess() })`
  - CSSリネームプラグイン: `onEnd` で `main.css` → `styles.css`(本家 `esbuild.config.mjs:102-115` と同型)
- `sourcemap: isProd?false:'inline'`, `minify:isProd`。dev=`context.watch()`, prod=`rebuild()+exit`

## 中核設計

### 1. Svelte 5 × TextFileView 統合(`src/KanbanView.ts`)

`import { mount, unmount } from 'svelte'` を本家の Preact `render`/`unmountComponentAtNode` の代わりに使う。
**Viewごとに contentEl へ Board.svelte を1つ mount**(本家のWindow単位 DragDropApp + ポータルは捨てる)。

ライフサイクル接続(本家 `obsidian-kanban/src/KanbanView.tsx` のTextFileView挙動を参照):
- `setViewData(data, clear)`: ロード入口。`clear || !store` なら旧コンポーネントを unmount →
  `new BoardStore(parseBoard(data), { requestSave: () => this.requestSave() })` → mount。
  そうでなければ `store.replaceBoard(parseBoard(data))`(外部編集の全再パース)。末尾で `lastSavedData = data`。
- `getViewData()`: 保存出口。`serializeBoard(store.board)` を返し、`lastSavedData = out` を記録(エコーガード)。
- `onClose()`: unmount。`clear()`: abstract のため空実装(本家 `KanbanView.tsx:481-500` のコメント根拠)。

状態の渡し方(**採用案**): `BoardStore`(内部に `$state` の board を持つクラス)を `mount` の props で
1本渡し、`Board.svelte` が `setContext` で子孫(Lane/Card)へ再配布。`getViewData()` は `store.board` を
直接読む。これで「唯一の状態=store、UIもViewも参照」というStateManagerパターン(仕様6章1項)が
runesで自然に実現。モジュールグローバルstoreは複数ファイルで衝突するため不採用。

不確実点と対策: `.svelte.ts` でのrunesクラスコンパイルが esbuild-svelte で通るかは M1 で実証する。
通らない場合は store の `$state` を Board.svelte 側で生成し props 経由にするフォールバック。

### 2. データモデルと状態操作(`src/model/`)

最小型(本家 `ItemData` を大幅簡素化。checked/checkChar/title/titleSearch等は持たない):
```ts
interface Card { id: string; titleRaw: string; }   // 完了状態はレーン位置から導出、保存しない
interface Lane { id: string; title: string; isComplete: boolean; cards: Card[]; unknownBlocks: RawBlock[]; }
interface Board { frontmatter: string; lanes: Lane[]; archive: RawBlock | null; settingsBlock: string | null; trailingUnknown: RawBlock[]; }
interface RawBlock { raw: string; }
```
- `displayTitle`・`addedDate`・`doneDate` は `$derived` で titleRaw から算出(保存しない)
- カードの完了は「完了レーンに居るか」から導出。チェックボックス文字も titleRaw の一部として温存(4.4-5)
- id は安定key(描画安定性 6章4項)。出力に出ないため往復無損失に影響しない

`BoardStore`(`store.svelte.ts`、仕様6章2項: 操作をここに集約、UIは呼ぶだけ):
- `replaceBoard(next)` — 外部編集の差し替え。保存は駆動しない
- `addCard(laneId, rawTitle)` — ` {today}` 付与(端末ローカル日付)
- `updateCardTitle(cardId, newRaw)` — 保存時に metadata 分離ルール適用(末尾手入力は昇格・上書き 4.2-4)
- `moveItem(from, to)` — **完了レーン境界の同期をここに集約**。`from.isComplete !== to.isComplete` の時のみ
  `false→true`: ` {today}` + `[ ]→[x]` / `true→false`: ` ` 全除去 + `[x]→[ ]`。それ以外は titleRaw 不変(5.3)
- `archiveCard(cardId)` — 状態を変えず archive へ(` `付与も`[x]`化もしない、4.3)
- `deleteCard(cardId)` — UI層で確認ダイアログ後に呼ぶ(5.5)
- 各操作末尾で `requestSave()` を駆動

エコーガード(仕様6章5項、本家 `KanbanView.tsx:204-211` の `this.data !== data` 比較を踏襲):
`getViewData()` の戻り値を `lastSavedData` に記録 → `main.ts` の `vault.on('modify')` ハンドラで
`file===this.file && data===lastSavedData` なら自己保存エコーとして無視。本家 `main.ts:529-547` の
debounce + 別ファイル限定ガードも併用。

### 3. 自作パーサー(`src/parser/`、mdast不使用・行ベース)

`parseBoard(md)` はトップダウンに外側の容器から剥がす:
1. frontmatter 抽出(先頭 `---`〜`---` を生で。`kanban-plugin` 有無判定)
2. 末尾の `%% kanban:settings ... %%` を `settingsBlock` に、`***` 以降を `archive` に生で確保
3. 残りを `## ` でレーン分割 → 各レーンで `**Complete**` 段落検出(`isComplete`)、
   `^-\s*\[.\]\s` でカード開始、インデント継続行を同一カードの titleRaw に連結(複数行カード 4.4-1)、
   リストでも見出しでもない裸ブロックは `unknownBlocks` に位置保持(4.4-4)

メタデータ分離(`metadata.ts`、仕様4.2の核): `/\s*( | )\s(\d{4}-\d{2}-\d{2})$/` を**1行目の行末から
繰り返し剥がす**。剥がせなくなった点が本文末尾(本文中の絵文字 `- [ ] マークの仕様を調べる` は対象外)。
同種複数は値=最後、除去=列内全て(4.2-3)。

`serializeBoard(board)` はパースの逆。frontmatter → 各レーン(見出し + `**Complete**` + unknownBlocks +
カード群、カードは titleRaw をそのまま)→ `***` + archive → settings。生文字列の結合で再構成。

### 4. D&D接続層(`src/ui/dnd.ts` + Lane.svelte)

svelte-dnd-action は `use:dndzone` + `consider`/`finalize` で動き、ゾーンごとに**新配列**を渡す。
カードゾーンのみで開始(レーン横ソートは仕様5.4でUI不要)。全レーンのカードゾーンを同一 `type:'card'`
にしてレーン間移動を可能化。`{#each cards as card (card.id)}` の安定keyでちらつき防止(6章4項)。

**整合方式(最大リスク・M3冒頭でspike検証)**: このライブラリはレーン間移動時、移動元と移動先の
**2つのゾーンで別々に `finalize` が発火**し、`(from,to)` を直接は渡さない。さらに `$state` プロキシを
そのまま渡すとライブラリ側の配列複製・比較と干渉する懸念がある。採用方式:
- 各 Lane の表示配列は store から**派生したプレーン配列**(`$derived` で素オブジェクト化)を dndzone に bind し、
  `consider` 中はローカルで差し替えてアニメーションさせる(store はまだ触らない)
- `finalize` で `store.reconcileLane(laneId, newPlainItems)` に確定反映。これを主APIとし、
  `moveItem(from,to)` はその上の薄い意味づけラッパ
- **完了同期**(` `/`[x]`)は「移動先レーンの `isComplete`」と「カードが直前に居たレーンの `isComplete`」を
  突き合わせて判定(2分割 `finalize` の source/target レーンIDから復元)。同期は `store` 内部に集約し、
  dnd層は移動の事実だけ伝える(ライブラリ差替に強い)。仕様5.3「境界を越えた時のみ触る/それ以外は不変」を厳守
- M3はこの整合・`$state`プロキシ干渉・ちらつきの3点を最小コンポーネントで実証してから本実装に入る

## 実装フェーズ(動くものを早く)

- **M0 パーサー+ゴールデンテスト(コード生成より先)** — `parser/` + `metadata.ts` + `tests/`。Obsidian非依存の
  純TS。vitest で round-trip / メタ分離 / 完了同期を緑に。**受け入れ条件として固める**(仕様9章)
- **M1 足場+静的表示** — manifest/esbuild/main.ts/KanbanView.ts。registerView + 下記2コマンド +
  ファイルメニュー項目。Board.svelte は読み取り専用プレーンテキスト。開閉で無損失を確認。`.svelte.ts` runes 実証もここ
  - 「Kanban Flow ボードを新規作成」: `createNewMarkdownFile` → `vault.modify(file, BOARD_TEMPLATE)`
    (frontmatter + 5レーン + DONE直下 `**Complete**`、仕様4.1)→ `setViewState({type:VIEW_TYPE, state:{file}})`
  - **「Kanban Flow ボードとして開く」(必須)**: 自動切替を将来送りにしたため、既存 `.md` は2回目以降
    標準markdownビューで開く。この再オープン導線(コマンド + `file-menu`/`more-options` メニュー項目、
    `hasFrontmatterKeyRaw` で看板ファイル判定)が無いと作ったボードを看板表示で開けない
- **M2 状態操作(D&D抜き)** — add/update/archive/delete + インライン編集(blur/Enterで確定・Escapeで破棄) +
  確認ダイアログ + エコーガード + パース失敗/空ボードのフォールバック表示
- **M3 D&D** — まず整合spike(中核設計4の3点)→ svelte-dnd-action 接続、reconcileLane/moveItem、完了レーン境界同期、ちらつき手動確認
- **M4 外部編集反映+仕上げ** — `vault.on('modify')` → 全再パース → replaceBoard。本家で開ける互換確認

将来(スコープ外): MarkdownRenderer リッチ表示(8章2項)、setViewState モンキーパッチ自動切替(8章1項)、レーン横D&D。

## 詰めるべき点(各Mで対応)

レビューで洗い出した未確定点。方針はここで確定済み、実装時に従う。

1. **D&D整合(最大リスク・M3)** — 中核設計4の「整合方式」を参照。M3冒頭でspike実証してから本実装。
2. **インライン編集の確定粒度(M2)** — 編集中はコンポーネントのローカル状態。store へのコミットは
   blur/Enter のみ、Escape で破棄。キー入力ごとの保存はしない(再描画でカーソルが飛ぶため)。
3. **パース失敗・空ボード(M2)** — `parseBoard` 例外時は最小エラー表示(本家のエラーレーン相当)、
   レーンゼロ件時は空状態表示。ビューがクラッシュ/空白化しないこと。
4. **カードIDの再パース再採番(M4)** — IDは永続化せずパース時採番のため、外部編集→全再パースで
   全カードIDが変わり keyed `{#each}` の再利用が切れる。エコーガードで自己保存起因の再パースは
   防げるので再描画は「真に外部編集された時のみ」。同一 titleRaw が複数あるとID対応が不安定になる点は、
   titleRaw+レーン内位置からの準安定ID導出で緩和(M4で判断、まずは外部編集時の全再描画を許容)。
5. **往復一致の空白・改行ポリシー(M0)** — `serialize(parse(md)) === md` は厳密比較。改行は `\n` に正規化し
   末尾改行1つを保証する方針を serializer に固定し、フィクスチャもそれに合わせる(CRLF等はパース時に正規化)。
6. **テストの日付非決定性(M0)** — `metadata.ts` は純関数のまま(日付は引数で注入)。端末ローカルの
   `todayStr()` 供給は store のみが担当。これによりパーサー/メタのテストは日付非依存で決定的に保つ。
7. **既知の制約** — 同一ボードを複数ペインで開くと store が二重化し保存が競合する。個人用・単一運用前提で
   当面は非対応とする(必要になれば本家のファイル単位 StateManager 共有方式を導入)。

## 参照する本家ファイル(流用不可・設計根拠のみ)

- `obsidian-kanban/src/KanbanView.tsx` — TextFileViewライフサイクル、`requestSaveToDisk` エコーガードの原型
- `obsidian-kanban/src/StateManager.ts` — StateManagerパターンの原型
- `obsidian-kanban/src/parsers/common.ts` — `frontmatterKey`/`completeString`(`**Complete**`)/`archiveString`(`***`)/settingsブロック形式(我々の `BOARD_TEMPLATE` はこれらを使い5レーン版に拡張)
- `obsidian-kanban/esbuild.config.mjs` — CSSリネームプラグイン・external設定の原型
- `obsidian-kanban/src/parsers/formats/list.ts` — 見出し→レーン、`**Complete**`判定、archive扱い、boardToMd の原型

## 検証(Verification)

- **パーサー(最重要)**: `npm test`(vitest)。`tests/fixtures/` に仕様9章1項の必須フィクスチャ
  (複数行カード / frontmatter+settings / archive / 未知ブロック / カスタムチェックボックス `[X]`,`[/]` /
  本家生成ファイル `@{}`・タグ・`^blockId` 入り)。`serialize(parse(md)) === md` を全件で確認。
  metadata.test.ts(本文中絵文字・複数 ・ 欠損・編集昇格)、completion.test.ts(境界の付与除去・非境界で無変化)
- **ビルド**: `npm run build` で `main.js` + `styles.css` が生成。`svelte-check` で型エラー0
- **プラグイン動作(手動、Obsidian上)**: テスト用vaultの `.obsidian/plugins/obsidian-kanban-flow/` に
  manifest.json/main.js/styles.css を配置 → 有効化 → 「Kanban Flowボード作成」コマンドで新規ボード →
  カード追加・タイトル編集・D&D移動・完了レーン出入りで ` `/`[x]` 同期・アーカイブ・削除(確認ダイアログ)を確認
- **互換性(仕様7章)**: 本プラグインで編集したファイルを本家 obsidian-kanban で開いて表示・編集できること。
  本家生成ファイルを本プラグインで開いて未知記法を壊さないこと(round-trip と手動の両方で)
- **ちらつき(仕様6章4項)**: D&Dドロップ直後にカードが一瞬消えない。エコーガードで保存ループが起きない