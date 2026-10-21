// wxt.config.ts の vite.define がビルド時に置き換える定数。
/** メインのプロファイル向けのローカル配備ビルドか（pnpm run deploy:local）。 */
declare const __MOKUMOKU_LOCAL_DEPLOY__: boolean;
/** ローカル配備ビルドの ID。それ以外のビルドでは空文字列。 */
declare const __MOKUMOKU_BUILD_ID__: string;
