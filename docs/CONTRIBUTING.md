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

YouTube の応答には固定の HTML を使い、YouTube へのネットワークアクセスは行いません。この E2E は実サイトの確認とは別です。YouTube との連携に影響する変更やリリース前には、必要に応じて次の `pnpm run test:live` を実行してください。

失敗時の PNG、HTML、診断 JSON は `.output/e2e-results/` に保存します。Vitest の結果は同フォルダーの `result.json` で確認できます。

### 実際の YouTube ページを確認する

`pnpm run test:live` は、実際の YouTube を使う Vitest のテストです。通常の UI 調整は `check`・`build`・`test:e2e` で確認し、YouTube との連携に影響する変更やリリース前に必要に応じて実行します。先に `pnpm run build` を実行してください。`vitest.live.config.ts` から `e2e/**/*.live.ts` を実行し、動画情報の読み取り、サイドパネルの表示、期間選択やページ遷移などを独立したケースで確認します。

```powershell
pnpm run test:live
```

Vitest の Node.js 環境と Puppeteer を使い、ヘッドレスの Chrome へ pipe 接続します。スイート全体でログインなしの一時プロファイル、Chrome、YouTube ページを各1つ共有します。プロファイルは OS の一時フォルダーに作り、ケースの前後はパネルの開閉だけで初期化します。YouTube の実 DOM は追加・改変しません。

確認先は `MOKUMOKU_LIVE_URL` で指定でき、既定は `https://www.youtube.com/@GoogleJapan/videos` です。PowerShell で別のチャンネルを指定する例です。

```powershell
$env:MOKUMOKU_LIVE_URL = "https://www.youtube.com/@YouTube/videos"
pnpm run test:live
```

#### 実サイトへの負荷を抑える

最初のページ取得と最後の別チャンネルへの移動を各1回に抑えます。同じチャンネルの「動画」と「ライブ」は1往復し、別タブへの切り替えには `about:blank` を使います。期間フィルタは既に読み込まれた動画だけで照合し、期間境界に届く動画が足りなければ、その期間は適用せず未実施の注記を残します。動画の追加取得（continuation）は行いません。自動追加読み込みや遷移中の瞬間的な表示は、固定データの `test:e2e` で確認します。

画像・フォント・動画や player・log_event への要求を抑制します。初回パネルの要求は通信制御より先に始まる場合があるため、完全に遮断するものではありません。取得を抑制するこのテストは、見た目の検証には使いません。

ページ取得は3回、一覧 API は8回を上限とし、ページと一覧 API の要求を2秒以上空けます。並列実行と再試行は行いません。`www.youtube.com` が HTTP 403・429・503 を返した場合や CAPTCHA を検出した場合は停止します。この回数と間隔はテストの運用上限で、公式の安全閾値やアクセス制限を受けない保証ではありません。

通常 CI のブラウザテストは固定 HTML の `test:e2e` とし、実サイトへ通信する `test:live` は含めません。失敗時の PNG、HTML、診断 JSON は `.output/live-results/`、Vitest の結果は同フォルダーの `result.json` に保存します。成否を問わず `network.json` に通信数と抑制数、停止対象の応答と `Retry-After` を記録します。

## Storybook で画面を確認する

```powershell
pnpm storybook
```

起動後に [Storybook](http://127.0.0.1:6010/) をブラウザで開くと、状態ごとの画面を確認できます。左側で動画一覧、読み込み中、動画なしなどを選び、上部で日本語・英語とパネル幅を切り替えます。

動画と読み込み結果には、固定のサンプルを使っています。期間の選択や追加読み込みも試せますが、実際の YouTube や拡張機能との連携は、開発用 Chrome と `pnpm run test:live` で確認してください。

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
