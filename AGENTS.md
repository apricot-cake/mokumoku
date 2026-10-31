# 開発ガイド

## ブラウザ接続

手動の実機確認には、開発専用プロファイル（既定は `~/.mokumoku-ext-profile`、`MOKUMOKU_DEV_PROFILE` で変更）の Chrome を使う。固定データの E2E は、ケースごとに OS の一時フォルダーへ専用プロファイルを作る。実サイトの自動テストは、スイート全体でログインなしの一時プロファイル、Chrome、YouTube ページを各1つ共有する。日常用の Chrome プロファイルは使わない。

実サイトの自動確認は `pnpm run test:live` で行う。Vitest の Node.js 環境と Puppeteer がヘッドレスの Chrome を pipe 接続で起動し、ビルド済みの拡張機能を読み込み、終了処理で Chrome も閉じる。TCP の CDP ポートは開かない。手動確認には `pnpm run browser:open` を使い、開発専用プロファイルの Chrome をウィンドウ付きで開いて拡張機能を読み込む。

開発中は `pnpm dev` を使う。WXT の開発サーバーが `.output/chrome-mv3-dev` へビルドし、起動後に `pnpm run browser:dev` と同じ手順で手動確認用の Chrome を開く。サイドパネルの変更はそのまま反映され、background と locale の変更では拡張機能全体が自動で再読み込みされる。content script を変えると WXT は対象のタブを再読み込みするが、開発版の background がこれを新しい content script の注入に置き換えるので、追加で読み込んだ動画などページの状態は残る。拡張機能全体を読み込み直したときも、開いている YouTube のタブへ content script を入れ直す。CDP で読み込んだ拡張機能は `runtime.reload()` で無効になるので、手動確認用 Chrome の保持プロセスが無効化を検知して読み込み直す。手動確認用 Chrome がすでに開いていると起動に失敗するので、閉じてから `pnpm run browser:dev` を実行する。`wxt.config.ts`（manifest の権限など）の変更は開発サーバーに反映されないので、開発サーバーと手動確認用 Chrome を閉じてから `pnpm dev` を実行し直す。手動確認用 Chrome で開いていたタブはプロファイルの `mokumoku-tabs.json` に記録され、次の起動で拡張機能を読み込んだあとに開き直される。Chrome 自身の復元は強制終了されると効かないので使わない。

`browser:open`、`test:e2e`、`test:live` は `.output/chrome-mv3` を読み込むので、先に `pnpm run build` を実行する。CDP で読み込んだ拡張機能は、その Chrome を閉じると外れる。

同じパスのビルドを再インストールするだけでは、Chrome が古い background を実行する場合がある。開発用 Chrome の読み込み処理は、拡張機能を一度外してから読み込み直す。`test:live` はパネルの表示だけでなく、所有タブが記録されることも確認する。

実サイトの確認では、YouTube が表示した DOM を追加・改変せず、その動画だけを使う。テスト用 HTML の結果を実機確認として扱わない。動画の再生、高評価、コメント、チャンネル登録などの操作は行わない。

自動撮影・実機確認では、Chrome をバックグラウンドで起動・操作し、前面に出したり他のアプリからフォーカスを奪ったりしない。

## 実機確認の範囲

画面へのフィードバックには `pnpm storybook` を使う。HTTP 応答を確かめてから `http://127.0.0.1:6010/` を内蔵ブラウザで開き、状態別のストーリーを表示する。Storybook は本体の画面と固定サンプルを使う。Storybook 内の表示・操作確認を、YouTube 上での実機確認として扱わない。Storybook の設定やストーリーを変えた場合は `pnpm run build-storybook` も確認する。

`pnpm run build` の後に `pnpm run test:e2e` で拡張機能の E2E を実行する。Vitest の Node.js 環境と Puppeteer を使い、ヘッドレスの Chrome へ pipe 接続する。ツールバー操作と同じ経路で実サイドパネルを開き、期間選択・任意期間入力・タブ切り替え・ページ遷移などを確認する。YouTube の応答は固定 HTML で、YouTube へはネットワークアクセスしないため、実サイト確認としては扱わない。失敗時の PNG・HTML・診断 JSON は `.output/e2e-results/`、Vitest の結果は同フォルダーの `result.json` に保存する。

動作や画面に影響する変更では、通常は `pnpm run check`、`pnpm run build`、固定データの `pnpm run test:e2e` で確認する。`pnpm run test:live` は YouTube との連携に影響する変更やリリース前に、必要に応じて明示的に実行する。確認先は `MOKUMOKU_LIVE_URL` で指定し、既定は `https://www.youtube.com/@GoogleJapan/videos`。`vitest.live.config.ts` が `e2e/**/*.live.ts` を実行する。各ケースの前後はパネルの開閉で初期化し、ページの再取得を繰り返さない。最初のページ取得と最後の別チャンネルへの移動を各1回、同じチャンネルの「動画」と「ライブ」を1往復し、別タブの確認には `about:blank` を使う。

実サイトでは content script の読み取り結果とパネル内容、既に読み込まれた範囲内での期間フィルタ、タブ・ページ遷移、パネル再開時の初期化を確認する。期間境界を確認するための動画が足りなければ、その期間は適用せず未実施の注記を残す。動画の追加取得（continuation）は行わない。自動追加読み込みや遷移中の瞬間的な表示は固定 E2E で確認する。

画像・フォント・動画、player・log_event への要求を抑制する。初回パネルの要求は通信制御より先に始まる場合があり、完全な遮断は保証しない。このテストは見た目の検証には使わない。ページ取得は3回、一覧 API は8回を上限とし、ページと一覧 API の要求を2秒以上空ける。並列実行・再試行はしない。`www.youtube.com` が HTTP 403・429・503 を返した場合や CAPTCHA を検出した場合は停止する。これらはテストの運用上限で、公式の安全閾値やアクセス制限を受けない保証ではない。

通常 CI のブラウザテストは固定 HTML の `test:e2e` とし、実サイトへ通信する `test:live` は含めない。失敗時の PNG・HTML・診断 JSON は `.output/live-results/`、Vitest の結果は同フォルダーの `result.json` に保存する。成否を問わず `network.json` に通信数と抑制数、停止対象の応答と `Retry-After` を記録する。

文書だけの変更では、差分と Markdown の検査で足りる。

## ストア提出と GitHub Releases

Chrome ウェブストアへの提出ごとに、提出バージョンの GitHub Release を作成する。タグは `v<バージョン>` とし、提出用 ZIP のソースに対応するコミットを指す。作業途中のコミットや、提出後の変更を含む HEAD を使わない。

Release の題名はバージョン番号とする。本文は前の提出版からの利用者向けの主な変更点を短い箇条書きでまとめる。初回は主な機能を記載する。提出、審査、ストアでの公開を区別し、未確認の公開完了を記載しない。同じバージョンの再提出では既存の Release を更新する。

提出記録と Release のバージョン、タグの対象、変更内容を照合し、公開されたページを確認してから提出作業を完了とする。README から Releases の一覧へ案内する。

## メインのプロファイルへの配備

動作や画面に影響する拡張機能の変更が完了したら、main の主作業ツリーで `pnpm run deploy:local` を実行する。メインのプロファイルに読み込んだ拡張機能が、次にパネルを開いたときに新しいビルドへ読み込み直される。Native Messaging Host を HKCU へ登録するので、コマンド全体にユーザー領域への書き込みを許可して実行する。Claude Code の Bash からは、隔離を外してもレジストリの書き込みが Bash の中だけの領域に振り向けられ、Chrome から見えない。配備は登録が Chrome から見えるかを WMI 経由で確かめ、見えなければエラーで止まるので、その場合は PowerShell から実行する。
