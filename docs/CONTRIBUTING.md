# 開発に参加する

この文書では、開発環境の準備、ビルド、Chrome と Storybook での確認、ローカル配備を説明します。機能と倍率の求め方は [使い方](使い方.md) を参照してください。

## 開発環境を準備する

Node.js 24.12.0 以降と pnpm 12.11.2 を使います。バージョンの指定は `package.json` にあります。

スペル検査には typos 1.51.1 を使います。実行ファイルを PATH の通った場所に配置してください。CI でも同じバージョンを使います。

```powershell
pnpm install --frozen-lockfile
```

## コードを確認する

```powershell
pnpm run check
```

## ビルドと Chrome での確認

Chrome 142 以降に対応しています。

```powershell
pnpm run build
```

開発中は次のコマンドを使います。開発サーバーが起動し、拡張機能を読み込んだ開発専用プロファイルの Chrome が開きます。ファイルを保存すると、変更が自動で反映されます。

```powershell
pnpm dev
```

`pnpm run build` でビルドした配布用の拡張機能は、次のコマンドで同じ Chrome に読み込んで確認できます。

```powershell
pnpm run browser:open
```

実際の YouTube ページでの自動確認は次のコマンドで行います。先に手動確認用の Chrome を閉じてください。ヘッドレスの Chrome で読み取りとサイドパネルの表示を確かめます。

```powershell
pnpm run smoke
```

## HTML デモを確認する

`website/` は、拡張機能をインストールせずに試せる[操作デモ](https://apricot-cake.github.io/mokumoku/)です。YouTube には接続せず、Storybook の架空サンプルと本体の倍率計算を使います。

```powershell
node scripts/build-website.ts
pnpm exec vite website --host 127.0.0.1
```

表示と操作は `website/index.html`、`style.css`、`demo.js` で管理します。生成した `website/generated/` はコミットしません。本体の倍率計算や `stories/fixtures.ts` を変えた後は、生成コマンドを実行し直してください。

`.github/workflows/website.yml` が main の変更時に生成し、GitHub Pages へ公開します。pull request では生成と構文検査だけを行います。

## Storybook で画面を確認する

```powershell
pnpm storybook
```

[Storybook](http://127.0.0.1:6010/) を内蔵ブラウザで開くと、本体と同じサイドパネルの画面を確認できます。左側で動画一覧、読み込み中、動画なしなどの状態を選び、上部で日本語・英語とパネル幅を切り替えます。画面へのフィードバックは内蔵ブラウザの「Annotate」で対象を選び、コメントを保存してからチャットで送ってください。

動画と読み込み結果は固定サンプルです。期間の選択とサンプルの追加読み込みを操作できます。YouTube や拡張機能との連携は開発用 Chrome と `pnpm run smoke` で確認します。

`pnpm run build-storybook` で `storybook-static/` に静的ビルドを出力できます。

`locales/*.yml` の文言を編集した場合は、Storybook を再起動してください。

## 任意: メインのプロファイルで使う

普段使いの Chrome でも使いたい場合は、Windows 向けのローカル配備機能を利用できます。配備のたびに、拡張機能を自動で新しいビルドへ読み込み直します。main の作業ツリーで次のコマンドを実行すると、現在のソースをビルドして `.output\deployed\chrome-mv3` へ配備します。

```powershell
pnpm run deploy:local
```

最初の1回だけ、Chrome の `chrome://extensions` でデベロッパーモードをオンにし、`.output\deployed\chrome-mv3` を「パッケージ化されていない拡張機能」として読み込みます。以降は配備のたびに、パネルを開いたときか読み込みを始めたときに新しいビルドへ読み込み直されます。読み込み直すとパネルが閉じるので、アイコンを押して開き直してください。開いている YouTube のタブには新しい content script が入るので、ページを再読み込みする必要はありません。

配備ビルドだけが固定の拡張機能 ID と `nativeMessaging` 権限を持ちます。配備時に再読み込み専用の[ネイティブメッセージングホスト](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)を現在の Windows ユーザーの HKCU へ登録し、拡張機能は配備済みのビルド ID をこのホストに問い合わせます。常時接続や定期的な確認はしません。

詳しい手順は [開発ガイド](../AGENTS.md) にあります。
