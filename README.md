# mokumoku

mokumoku は、同じ YouTube チャンネルの中で、普段より多く見られている動画を探す Chrome 拡張機能です。公開からの経過時間を考慮して再生数を比較し、結果を閲覧中のページの横に表示します。

## 主な機能

- 同じチャンネルの動画を、基準となる再生数に対する倍率で比較できます。
- 「直近1か月」などの期間を選び、対象の動画をまとめて読み込めます。
- 「さらに読み込む」で、動画を1回分ずつ追加できます。
- 日本語と英語で表示できます。

YouTube チャンネルの「動画」タブを「新しい順」で開いた場合に対応します。

## デモ動画

<!-- markdownlint-disable-next-line MD034 -->
https://github.com/user-attachments/assets/416a7002-1c9e-4c48-b7ce-7c370734b4ef

## インストール

[Chrome ウェブストアからインストール](https://chromewebstore.google.com/detail/hmhgbppkbadnofkbnnbmolgccnpmnfoe)できます。Chrome 142 以降が必要です。

### ソースからインストールする場合

Node.js 24.12.0 以降と pnpm 12.11.2 を用意してください。

```powershell
git clone https://github.com/apricot-cake/mokumoku.git
cd mokumoku
pnpm install --frozen-lockfile
pnpm run build
```

ビルドが終わったら、Chrome で `chrome://extensions` を開き、デベロッパーモードを有効にします。「パッケージ化されていない拡張機能を読み込む」から、リポジトリ内の `.output/chrome-mv3` フォルダーを選んでください。

更新するときは、新しいソースを取得して `pnpm run build` を実行し、拡張機能の管理画面で mokumoku を再読み込みしてください。

## 開発・貢献

開発環境の準備、テスト、画面の確認方法は[開発ガイド](docs/CONTRIBUTING.md)を参照してください。

不具合の報告や改善の提案は、[GitHub Issues](https://github.com/apricot-cake/mokumoku/issues)で受け付けています。投稿は公開されるため、個人情報や公開したくない閲覧情報を含めないでください。

脆弱性は[非公開フォーム](https://github.com/apricot-cake/mokumoku/security/advisories/new)から報告してください。

## ライセンス

[MIT License](LICENSE)
