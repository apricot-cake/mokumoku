# mokumoku

mokumoku は、YouTube チャンネル内で、公開からの経過時間を考慮して再生数が伸びている動画を探す Chrome 拡張機能です。比較結果を、閲覧中のページと並べたサイドパネルに表示します。

## 主な機能

- 同じチャンネルの動画を、通常の再生数に対する倍率で比較
- 「直近1か月」などの期間を選び、対象の動画をまとめて読み込み
- 「さらに読み込む」で、動画を1回分ずつ追加
- 日本語・英語の表示

YouTube チャンネルの「動画」タブを「新しい順」で開いた場合に対応します。倍率は、読み込み済みの動画の累積再生数と経過時間から推定します。計算方法と条件は[使い方](docs/使い方.md#倍率の求め方)を参照してください。

## インストール

Chrome 142 以降が必要です。ソースから導入する場合は、Node.js 24.12.0 以降と pnpm 12.11.2 を用意します。

```powershell
git clone https://github.com/apricot-cake/mokumoku.git
cd mokumoku
pnpm install --frozen-lockfile
pnpm run build
```

Chrome で `chrome://extensions` を開き、デベロッパーモードを有効にします。「パッケージ化されていない拡張機能を読み込む」から、リポジトリ内の `.output/chrome-mv3` を選んでください。

更新時はソースを更新して `pnpm run build` を実行し、拡張機能の管理画面で mokumoku を再読み込みします。

## 使い方

1. YouTube チャンネルの「動画」タブを「新しい順」で開きます。
2. Chrome のツールバーで mokumoku のアイコンを押します。
3. サイドパネルで倍率と動画一覧を確認します。期間を指定して読み込む場合は「読み込み範囲」を選びます。

公開から1日未満の動画は参考値として別に表示します。基準に使える動画が8本未満の場合は、倍率を表示しません。

パネルは開いたタブ専用です。同じウィンドウで別のタブへ切り替えたり、別のページへ移動したりすると閉じます。同じチャンネル内の移動では開いたままになります。

## ドキュメント

- [使い方・倍率の求め方](docs/使い方.md)
- [プライバシーポリシー](PRIVACY.md)
- [ストア提出準備](CHROMEWEBSTORE.md)

## 開発・貢献

環境構築、テスト、開発用 Chrome と Storybook での確認は[開発ガイド](docs/CONTRIBUTING.md)を参照してください。

不具合や改善の提案は[GitHub Issues](https://github.com/apricot-cake/mokumoku/issues)へお願いします。投稿は公開されるため、個人情報や公開したくない閲覧情報を含めないでください。

脆弱性は[非公開フォーム](https://github.com/apricot-cake/mokumoku/security/advisories/new)から報告してください。

## ライセンス

[MIT License](LICENSE)
