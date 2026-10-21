# 開発ガイド

## ブラウザ接続

実機確認には、開発専用プロファイル（既定は `~/.mokumoku-ext-profile`、`MOKUMOKU_DEV_PROFILE` で変更）の Chrome だけを使う。日常用の Chrome プロファイルは使わない。

自動確認は `pnpm run smoke` で行う。Puppeteer がヘッドレスの Chrome を pipe 接続で起動し、ビルド済みの拡張機能を読み込み、終了処理で Chrome も閉じる。TCP の CDP ポートは開かない。手動確認には `pnpm run browser:open` を使い、同じプロファイルの Chrome をウィンドウ付きで開いて拡張機能を読み込む。自動確認の前には、手動確認用の Chrome を閉じる。

開発中は `pnpm dev` を使う。WXT の開発サーバーが `.output/chrome-mv3-dev` へビルドし、起動後に `pnpm run browser:dev` と同じ手順で手動確認用の Chrome を開く。サイドパネルの変更はそのまま反映され、content script の変更では対象のタブが、background と locale の変更では拡張機能全体が自動で再読み込みされる。CDP で読み込んだ拡張機能は `runtime.reload()` で無効になるので、手動確認用 Chrome の保持プロセスが無効化を検知して読み込み直す。手動確認用 Chrome がすでに開いていると起動に失敗するので、閉じてから `pnpm run browser:dev` を実行する。`wxt.config.ts`（manifest の権限など）の変更は開発サーバーに反映されないので、開発サーバーと手動確認用 Chrome を閉じてから `pnpm dev` を実行し直す。

`browser:open` と `smoke` は `.output/chrome-mv3` を読み込むので、先に `pnpm run build` を実行する。CDP で読み込んだ拡張機能は、その Chrome を閉じると外れる。

実機確認では、ページへ検証用の DOM を追加せず、YouTube が表示した動画だけを使う。テスト用 HTML の結果を実機確認として扱わない。動画の再生、高評価、コメント、チャンネル登録などの操作は行わない。

自動撮影・実機確認では、Chrome をバックグラウンドで起動・操作し、前面に出したり他のアプリからフォーカスを奪ったりしない。

## 実機確認の範囲

動作や画面に影響する変更では、`pnpm run check` と `pnpm run build` の後に `pnpm run smoke` を実行する。既定の確認先は Google Japan の「動画」タブで、別のチャンネルは `pnpm run smoke <動画タブの URL>` で指定する。このコマンドは content script の読み取り結果と、ツールバー操作と同じ経路で開いたサイドパネルの表示が一致することを確かめる。続けてパネルの「さらに読み込む」を押し、動画が増えることと、ページのスクロール位置が保たれることを確かめる。最後に表示期間を「1か月以内」に絞り、古い動画が一覧から消えることを確かめてから、期間を「すべて」に戻す。

文書だけの変更では、差分と Markdown の検査で足りる。
