# 開発ガイド

開発環境の準備、テスト、Chrome での動作確認、ローカル配備の手順をまとめています。倍率の求め方と表示条件は[倍率について](倍率について.md)を参照してください。

## 開発環境を準備する

必要な Node.js、pnpm、Chrome のバージョンは、[README](../README.md#インストール)を参照してください。Node.js と pnpm の指定は `package.json` にもあります。

スペル検査には typos 1.51.1 を使います。コマンドとして実行できるよう、実行ファイルを PATH の通った場所に配置してください。CI でも同じバージョンを使います。

リポジトリのフォルダーで、依存パッケージをインストールします。

```powershell
pnpm install --frozen-lockfile
```

## コードを確認する

次のコマンドで、コードと Markdown の書式、スペル、型、単体テストをまとめて確認します。

```powershell
pnpm run check
```

文書だけを変更した場合は、`pnpm run lint:markdown` と `pnpm run lint:typos` で確認できます。

## ビルドと Chrome での確認

配布用の拡張機能をビルドするには、次のコマンドを使います。生成先は `.output/chrome-mv3` です。

```powershell
pnpm run build
```

開発中は `pnpm dev` を使います。開発サーバーが起動し、拡張機能を読み込んだ Chrome が開きます。ファイルを保存すると、変更が自動で反映されます。

```powershell
pnpm dev
```

この Chrome は、普段使いとは別の開発専用プロファイルを使います。保存先は既定で `~/.mokumoku-ext-profile` です。`MOKUMOKU_DEV_PROFILE` で変更できます。

配布用のビルドを確認するときは、開発用 Chrome を閉じてから、次のコマンドで開き直します。

```powershell
pnpm run browser:open
```

`wxt.config.ts` の権限などを変更した場合は、開発サーバーと開発用 Chrome の両方を閉じ、`pnpm dev` を実行し直してください。

### 実際の YouTube ページを確認する

自動確認には `pnpm run smoke` を使います。先に `pnpm run build` を実行し、手動確認用の Chrome を閉じてください。ウィンドウを表示しないヘッドレスモードで、動画情報の読み取りとサイドパネルの表示を確認します。

```powershell
pnpm run smoke
```

別のチャンネルを使う場合は、`pnpm run smoke <動画タブのURL>` と指定します。

## Storybook で画面を確認する

```powershell
pnpm storybook
```

起動後に [Storybook](http://127.0.0.1:6010/) をブラウザで開くと、状態ごとの画面を確認できます。左側で動画一覧、読み込み中、動画なしなどを選び、上部で日本語・英語とパネル幅を切り替えます。

動画と読み込み結果には、固定のサンプルを使っています。期間の選択や追加読み込みも試せますが、実際の YouTube や拡張機能との連携は、開発用 Chrome と `pnpm run smoke` で確認してください。

`pnpm run build-storybook` で `storybook-static/` に静的ビルドを出力できます。

`locales/*.yml` の文言を編集した場合は、Storybook を再起動してください。

## 任意: 普段使いの Chrome に配備する

Windows では、普段使いの Chrome 向けにビルドを配備し、更新を自動で読み込み直す機能を使えます。main の作業フォルダーで、次のコマンドを実行してください。現在のソースをビルドし、`.output/deployed/chrome-mv3` へ配備します。

```powershell
pnpm run deploy:local
```

最初の1回は、Chrome の `chrome://extensions` でデベロッパーモードを有効にし、`.output/deployed/chrome-mv3` を「パッケージ化されていない拡張機能」として読み込みます。

以降は配備するたびに、パネルを開いたときか読み込みを始めたときに、新しいビルドへ読み込み直されます。その際はパネルが閉じるので、アイコンを押して開き直してください。開いている YouTube のタブにも新しいコンテンツスクリプトが入るため、ページの再読み込みは不要です。

この配備用ビルドには、固定の拡張機能 ID と `nativeMessaging`、`scripting` 権限が含まれます。通常の配布用ビルドには含まれません。

配備時には、再読み込み専用の[ネイティブメッセージングホスト](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)を、Windows レジストリのユーザー領域（HKCU）へ登録します。拡張機能が端末内のプログラムと通信するための仕組みで、配備済みのビルド ID の確認に使います。常時接続や定期的な確認は行いません。
