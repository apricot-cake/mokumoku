# 開発ガイド

## ブラウザ接続

実機確認には、開発専用プロファイル（既定は `~/.mokumoku-ext-profile`、`MOKUMOKU_DEV_PROFILE` で変更）の Chrome だけを使う。日常用の Chrome プロファイルは使わない。

自動確認は `pnpm run smoke` で行う。Puppeteer がヘッドレスの Chrome を pipe 接続で起動し、ビルド済みの拡張機能を読み込み、終了処理で Chrome も閉じる。TCP の CDP ポートは開かない。手動確認には `pnpm run browser:open` を使い、同じプロファイルの Chrome をウィンドウ付きで開いて拡張機能を読み込む。自動確認の前には、手動確認用の Chrome を閉じる。

どちらのコマンドも `.output/chrome-mv3` を読み込むので、先に `pnpm run build` を実行する。CDP で読み込んだ拡張機能は、その Chrome を閉じると外れる。

実機確認では、ページへ検証用の DOM を追加せず、YouTube が表示した動画だけを使う。テスト用 HTML の結果を実機確認として扱わない。動画の再生、高評価、コメント、チャンネル登録などの操作は行わない。

自動撮影・実機確認では、Chrome をバックグラウンドで起動・操作し、前面に出したり他のアプリからフォーカスを奪ったりしない。

## 実機確認の範囲

動作や画面に影響する変更では、`pnpm run check` と `pnpm run build` の後に `pnpm run smoke` を実行する。既定の確認先は Google Japan の「動画」タブで、別のチャンネルは `pnpm run smoke <動画タブの URL>` で指定する。このコマンドは content script の読み取り結果と、ツールバー操作と同じ経路で開いたサイドパネルの表示が一致することを確かめる。

文書だけの変更では、差分と Markdown の検査で足りる。
