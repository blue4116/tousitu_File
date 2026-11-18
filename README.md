# 糖尿病改善サポート - Auth0専用ログイン画面修正版

## 今回の修正
- Auth0公式SPA SDKのCDNを公式ドキュメント掲載の2.30へ更新
- ログイン時はUsername-Password-Authentication接続を明示
- 新規登録時はscreen_hint=signupを指定し、Auth0 Universal Loginの登録画面を開く
- SDK初期化エラーの内容を画面に表示

## GitHub Pagesへの反映
このZIP内の6ファイルをリポジトリ直下へ上書きしてください。
反映後、アプリをCtrl+F5で再読み込みします。

## Auth0アプリ設定
Allowed Callback URLs / Allowed Logout URLs:
https://blue4116.github.io/tousitu_File/

Allowed Web Origins:
https://blue4116.github.io

Database connection:
Username-Password-Authentication を対象SPAアプリで有効にしてください。
接続設定の「サインアップを無効にする」はOFFにしてください。

## 注意
この版はAuth0認証の接続確認用です。食事・血糖値・体組成のクラウド保存APIはまだ接続されていません。Client Secretはフロントエンドへ記載しないでください。
