# Kanban Flow

Svelte 5 でスクラッチ実装した、個人利用向けの軽量な Markdown ベース看板プラグイン(Obsidian)。
ファイル形式は [obsidian-kanban](https://github.com/mgmeyers/obsidian-kanban) 互換
(frontmatter キー `kanban-plugin`、`**Complete**` 完了レーン、`***` アーカイブ区切り、
`%% kanban:settings %%` 設定ブロック)。

デスクトップ専用。詳細仕様は `./docs/kanban_requirement.md`、設計は `./docs/plan.md` を参照。

## できること

- レーンはファイルの `## ` 見出しから読む(テンプレート: TODO / DOING / TODAY / DONE / PENDING)
- カードのドラッグ&ドロップ(レーン内の並べ替え・レーン間の移動)
- カードの作成 / インライン編集 / アーカイブ / 削除
- メタデータの自動付与: 作成時に登録日 `➕ YYYY-MM-DD`、`**Complete**` レーンへ移動すると
  完了日 `✅ YYYY-MM-DD`(レーンから出すと除去)
- 無損失ラウンドトリップ: パーサーが解釈しないもの(タグ・`^ブロックID`・`@{日付}`・
  カスタムチェックボックス文字・設定ブロック)は生のまま温存

## やらないこと(仕様準拠)

マルチウィンドウ、ボード間移動、外部ドロップ、レーン折りたたみ、テーブル表示、モバイル、
ビューの自動切替。

## 開発

```bash
npm install
npm test         # vitest: round-trip / メタ分離 / 完了同期 / アーカイブ(受け入れ条件)
npm run typecheck
npm run build    # dist/ に成果物を出力
npm run dev      # ウォッチビルド(dist/ に出力)
```

ビルド成果物はすべて `dist/`(gitignore 対象)に出力されます。`dist/` は配置に必要なファイルが
揃った状態(下記)になっており、そのままプラグインフォルダとして使えます:

```
dist/
  ├── manifest.json
  ├── versions.json
  ├── main.js
  └── styles.css
```

## リリース

```bash
# 対象ブランチに upstream が無い初回のみ: git push -u origin <branch>
npm version patch        # patch / minor / major。manifest.json も自動同期される
git push --follow-tags   # v* タグ push で GitHub Actions が起動する
```

タグ push を起点に GitHub Actions がビルド・署名(SLSA provenance)・チェックサム生成を行い、
自動生成ノート付きの **draft Release** を作成します。内容を確認して、GitHub UI から手動で
Publish してください(自動公開はされません)。

検証・後始末・設計の詳細は [docs/release-process.md](docs/release-process.md) を参照。
Claude Code では `/release` スキルが手順を案内します。

## vault へのインストール(手動)

`dist/` の中身を vault のプラグインフォルダへコピー(または `dist/` をシンボリックリンク):

```
<vault>/.obsidian/plugins/obsidian-kanban-flow/   ← dist/ の中身を配置
```

その後、設定 → コミュニティプラグイン で **Kanban Flow** を有効化。

## 手動確認チェックリスト

1. **作成** — コマンドパレット →「Create new Kanban Flow board」。5レーンのボードが開く。
2. **無損失** — ファイルメニューの「Open as markdown」でテンプレートを確認し、再度ボードで開く。
3. **追加 / 編集** —「+ Add card」で `➕ <今日>` が付与される。カードをダブルクリックで編集
   (Enter / フォーカスアウトで確定、Escape で破棄)。
4. **ドラッグ** — カードをレーン間で移動。**DONE** に入れると `✅ <今日>` と `[x]` が付き、
   DONE から出すと `✅` が消えて `[ ]` に戻る。同一レーン内の並べ替えでは他は変化しない。
   ドロップ直後のちらつきが出ないことを確認。
5. **アーカイブ / 削除** — カードを右クリック(または ⋯ ボタン)。削除は確認ダイアログが出る。
6. **互換性** — 本プラグインで編集したボードを本家 obsidian-kanban で開く。逆に、タグ /
   `^ブロックID` / `@{}` 入りのファイルを本プラグインで開き、記法が壊れないことを確認。
7. **外部編集** — 別ペインや別端末でファイルを編集し、保存ループを起こさず再パース・再描画される
   ことを確認。


## 関連ブログ

- [ObsidianでToDoを管理できるobsidian-kanban-flowプラグインを作ってみた - メモ的な思考的な](https://thinkami.hatenablog.com/entry/2026/06/28/212806)