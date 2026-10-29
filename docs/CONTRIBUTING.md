# 開発ガイド

開発環境の準備、テスト、Chrome での動作確認、ローカル配備の手順をまとめています。倍率の求め方と表示条件は[倍率について](倍率について.md)を参照してください。

## 開発環境を準備する

Node.js 24.12.0 以降、pnpm 12.11.2、Chrome 142 以降を用意してください。Node.js と pnpm の指定は `package.json` にもあります。

スペル検査には typos 1.51.1 を使います。コマンドとして実行できるよう、実行ファイルを PATH の通った場所に配置してください。CI でも同じバージョンを使います。

ソースを取得し、依存パッケージをインストールします。

```powershell
git clone https://github.com/apricot-cake/mokumoku.git
cd mokumoku
pnpm install --frozen-lockfile
```

開発中は `pnpm dev` を使います。開発サーバーが起動し、拡張機能を読み込んだ Chrome が開きます。ファイルを保存すると、変更が自動で反映されます。

```powershell
pnpm dev
```

この Chrome は、普段使いとは別の開発専用プロファイルを使います。保存先は既定で `~/.mokumoku-ext-profile` です。`MOKUMOKU_DEV_PROFILE` で変更できます。

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

配布用のビルドを確認するときは、開発用 Chrome を閉じてから、次のコマンドで開き直します。

```powershell
pnpm run browser:open
```

`wxt.config.ts` の権限などを変更した場合は、開発サーバーと開発用 Chrome の両方を閉じ、`pnpm dev` を実行し直してください。

### 固定データで拡張機能の E2E を確認する

ビルド後に、次のコマンドを実行します。

```powershell
pnpm run build
pnpm run test:e2e
```

Vitest の Node.js 環境から Puppeteer でヘッドレスの Chrome を pipe 接続で起動します。ケースごとに OS の一時フォルダー内へ専用プロファイルを作り、ビルド済みの拡張機能を読み込みます。ツールバー操作と同じ経路で実際のサイドパネルを開き、期間の選択、任意期間の入力、タブの切り替え、ページ遷移などを確認します。

YouTube の応答には固定の HTML を使い、YouTube へのネットワークアクセスは行いません。この E2E は実サイトの確認とは別です。YouTube との連携に影響する変更やリリース前には、必要に応じて次の `pnpm run smoke` を実行してください。

失敗時の PNG、HTML、診断 JSON は `.output/e2e-results/` に保存します。Vitest の結果は同フォルダーの `result.json` で確認できます。

### 実際の YouTube ページを確認する

自動確認には `pnpm run smoke` を使います。先に `pnpm run build` を実行し、手動確認用の Chrome を閉じてください。ウィンドウを表示しないヘッドレスモードで、動画情報の読み取りとサイドパネルの表示を確認します。

```powershell
pnpm run smoke
```

別のチャンネルを使う場合は、`pnpm run smoke <動画またはライブタブのURL>` と指定します。

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
