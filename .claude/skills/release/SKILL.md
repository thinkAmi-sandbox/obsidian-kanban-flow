---
name: release
description: Kanban Flow プラグインをリリースする。バージョンをバンプし、v* タグを push して GitHub Actions に draft Release を作らせる。タグの push は外向きで取り消しにくいため、push 前に必ずユーザーへ確認する。「リリースして」「バージョンを上げて」等で起動。
---

# リリーススキル

このプラグインをリリースする手順を案内する。仕組み・後始末・検証の詳細は
[docs/release-process.md](../../../docs/release-process.md) が唯一の詳細リファレンス。ここでは
**対話的に安全にリリースする手順**だけを実行する。

重要な前提:
- バージョンの真実源(SSoT)は `package.json`。`npm version` だけがタグを作る正規手段。
- リリースの起点は `v*` タグの push のみ。タグを push した瞬間に GitHub Actions が draft を作る。
- **タグ push は取り消しにくい外向き操作**。後述の手順5でユーザーの明示的な承認を得るまで push しない。

## 手順

### 1. 前提チェック
- `git status` でワーキングツリーがクリーンか確認。未コミットがあれば、コミットするかユーザーに確認してから進む(汚れたまま進めない)。
- 現在のブランチとリモートとの同期状況を確認する。

### 2. 品質ゲート
次を順に実行し、いずれか失敗したら**中止**してユーザーに報告する(壊れた版にタグを付けない)。
```bash
npm run typecheck
npm run lint
npm test
npm run build
```

### 3. バンプ種別の提案
- 直近タグからの変更を確認する: `git describe --tags --abbrev=0` で直近タグを得て `git log <tag>..HEAD --oneline`。
- 変更内容から patch / minor / major を**理由付きで提案**する(目安は docs/release-process.md の表に従う。`0.x` 系では破壊的変更でも基本 minor)。
- 最終的にどれにするかは**ユーザーに選ばせる**。勝手に決めない。

### 4. 差分の提示
- 現行バージョン(`package.json` の version)と、バンプ後のバージョンを明示してユーザーに見せる。

### 5. バンプ実行 → push 前に停止
```bash
npm version <type>        # type は手順3で確定したもの
```
- これで `manifest.json` が同期され、コミットとタグ `v<新バージョン>` が作られる。
- `git show --stat HEAD` と作られたタグを表示し、**ここで一旦停止**。
- 「このタグを push すると GitHub Actions が draft Release を作ります。push してよいですか?」と
  **ユーザーに確認**する。承認が得られるまで次に進まない。

### 6. push
承認を得たら:
```bash
git push --follow-tags
```

### 7. 以降の案内
push 後、ユーザーに次を伝える:
- GitHub Actions がビルド・署名・チェックサム生成を行い、**draft Release** を作る。
- 検証(`gh attestation verify` / `sha256sum -c`)と最終的な **Publish は手動**。**自分(エージェント)は Publish しない**。
- やり直したい場合の後始末コマンドは docs/release-process.md の「後始末」節にある、と案内する。

## やらないこと
- ユーザーの承認なしにタグを push しない。
- Release を Publish しない(draft のまま人に渡す)。
- `manifest.json` / `versions.json` の version を手で編集しない(`npm version` 経由のみ)。
