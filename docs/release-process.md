# リリース手順

このプラグインのリリースに関する**唯一の詳細リファレンス**です。README とリリーススキル
(`.claude/skills/release/`) は、詳細をこのファイルに委ねています。

## 仕組み（なぜこの形か）

- **バージョンの真実源(SSoT)は `package.json`**。`npm version` でここを更新する。
- `npm version` の `version` フックが [`scripts/version-bump.mjs`](../scripts/version-bump.mjs) を呼び、
  `manifest.json` の `version` を自動同期する（手で `manifest.json` を編集しない）。
- **リリースの起点は `v*` タグの push だけ**。そのタグを作る唯一の手段が `npm version`。
  → **バンプを忘れる = タグが無い = リリースが発生しない**。古い版がサイレントに公開される事故が
  構造的に起きない。
- タグ push を受けて [`.github/workflows/build.yml`](../.github/workflows/build.yml) が動き、
  ビルド・署名・チェックサム生成を行い、**draft Release** を作成する。
- `versions.json` は `minAppVersion` を固定運用するため `{"0.0.1":"1.0.0"}` の1行で据え置き。
  リリースごとの更新は不要。

## 手順

**前提**: 対象ブランチに upstream が設定されていること。upstream が無いと手順3の
`git push --follow-tags` が `no upstream branch` で失敗し、タグも飛ばずワークフローも起動しない。
初回は先に upstream を設定する:

```bash
git push -u origin <branch>   # 初回のみ。upstream 未設定のブランチで実行
```

（`/release` スキルは、upstream が無い場合はバンプもタグ作成も行わずに停止する。）

```bash
# 1. ワーキングツリーがクリーンで、upstream が設定済みであることを確認
git status
git rev-parse --abbrev-ref --symbolic-full-name @{u}   # upstream が無いとエラー

# 2. バージョンを上げる（manifest.json も自動同期され、コミット＋タグが作られる）
npm version patch        # patch / minor / major

# 3. コミットとタグを push（タグ push が Actions を起動する）
git push --follow-tags
```

`git push --follow-tags` の後、GitHub Actions が:

1. `typecheck` / `lint` / `test` を実行（壊れた版をリリースしない）
2. `npm run build` で `dist/` を生成
3. `main.js` / `styles.css` / `manifest.json` の SHA-256 を `checksums.txt` に出力
4. **SLSA build provenance** を keyless 署名で発行（秘密鍵・API キー不要）
5. 自動生成ノート付きの **draft Release** を作成し、上記アセットを添付

## バンプ種別の選び方

| 種別 | 上がる桁 | 目安 |
|---|---|---|
| `patch` | `0.0.1 → 0.0.2` | バグ修正・内部改善。大半の変更はこれ |
| `minor` | `0.0.1 → 0.1.0` | 目立つ機能追加 |
| `major` | `0.0.1 → 1.0.0` | 破壊的変更。`0.x` の間は基本上げず、「安定版」を宣言したい節目で |

## 公開前の検証

draft の段階で、添付アセットを検証できる。

```bash
# Release のアセットをダウンロード（例）
gh release download v0.0.2 --repo thinkAmi-sandbox/obsidian-kanban-flow

# build provenance（改ざんされていないこと・CIが作ったことの証明）
gh attestation verify main.js --repo thinkAmi-sandbox/obsidian-kanban-flow

# チェックサム照合
sha256sum -c checksums.txt
```

## Publish（公開）

Release は **draft** で作られる。**自動公開はしない**（取り消し不能な公開を避けるため）。

1. GitHub の Releases 画面で draft を開く
2. 自動生成された "What's Changed" を確認し、必要なら手で加筆
3. **Publish** を押して公開

> なお GitHub の自動生成ノートは**マージ済み PR**から作られる。直接コミット中心の運用では
> "What's Changed" は薄く、Full Changelog の compare リンクが主になる。

## 後始末（テスト・中止時）

draft とタグは取り消せるので、テストや誤操作はやり直せる。

```bash
# 1. draft Release を削除（--cleanup-tag でリモートタグも一緒に消える）
gh release delete v0.0.2 --cleanup-tag --yes

# 2. ローカルタグを削除
git tag -d v0.0.2

# 3. バージョンバンプのコミットを取り消す（直前の1コミットが npm version のものであること）
git reset --hard HEAD~1

# 4. リモートブランチを巻き戻す
git push --force-with-lease origin <branch>
```

注意点:

- `git reset --hard HEAD~1` は「バンプコミットが最新」が前提。`git log --oneline -3` で確認してから実行する。
- **attestation は削除できない**（Sigstore の追記専用ログに記録されるため）。ただし draft Release を
  消せばその成果物はダウンロードできなくなるので実害はない。残っても無視してよい。
- ビルドが問題なく通り「このまま最初のリリースにしてよい」場合は、後始末せず draft を Publish する
  だけでもよい。

## 設計上の決定（背景）

- **Immutable Releases は当面オフ**。公開後も Release の削除・編集・差し替えができる「やり直せる」
  状態を優先する。改ざん対策は「ロック」ではなく **attestation 署名 + checksums** による検知で担保。
- 署名は **keyless**（GitHub OIDC + Sigstore）。リポジトリ Secrets に鍵・トークンを置かないため、
  漏洩しうる秘密が存在しない。
- 多層の CI ガードは設けていない。`npm version` 経由に手順を固定することで、タグと各ファイルの
  バージョン整合が**構造的に**保たれるため。
