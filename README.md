# 糖尿病改善サポート（GitHub Pages + Supabase）

食事写真・料理内容・油や調味料のメモ、血糖値、体重・体組成を記録するWebアプリの初期版です。
複数アカウントでデータを分離するため、Supabase Auth、Postgres、StorageのRLSを使用します。

## 含まれる機能
- メールアドレスとパスワードによる新規登録・ログイン
- アカウント別の食事・血糖値・体重/体組成データ保存
- 食事写真のアップロード（private Storage）
- 料理・調味料メモ欄、栄養推定結果の編集欄
- 血糖値（mg/dL）と測定タイミングの記録
- 体重、体脂肪率、筋肉量、体水分率、内臓脂肪レベル、BMI
- 食事・血糖値・体組成の記録一覧と削除
- 食事・血糖値・体組成の時刻指定ブラウザー通知（アプリが開いている間）

## 重要：写真AIと通知について
- `supabase/functions/analyze-food/index.ts` は安全な接続先の雛形です。AIプロバイダー接続が未設定の状態で、推定したふりをしないようにしています。AIプロバイダーを選び、Edge Functionに接続を実装してから写真分析が有効になります。
- ブラウザー通知はアプリを開いている間に動作します。アプリを閉じた状態・端末再起動後にも確実に通知するには、Web Push購読、Push配信サーバー、VAPIDキー等の追加設定が必要です。iOSではホーム画面に追加したWebアプリ等の制約もあります。
- GitHub Pagesは静的ホスティングです。AI秘密鍵は `app.js` に書かず、Supabase Edge FunctionのSecretに保存してください。
- 栄養値は推定値で、食材量、商品、調理方法、油の残量などで誤差が出ます。AI推定値と調味料分の二重計上に注意してください。
- 本アプリは診断・治療の代わりではありません。血糖値目標や食事目標、薬・インスリン量をAIが決めないでください。

## 1. Supabaseを作成
1. Supabaseで新しいプロジェクトを作成します。
2. Authentication > URL Configurationで、公開後のGitHub Pages URLをSite URLとRedirect URLsに登録します。
3. SQL Editorで `supabase_schema.sql` の全内容を実行します。
4. Project Settings > API から Project URL と publishable/anon public key を取得します。
5. `app.js` の先頭にある `SUPABASE_URL` と `SUPABASE_ANON_KEY` を置き換えます。service_roleキーは絶対に使わないでください。
6. Authenticationのメール確認設定を必要に応じて調整します。

## 2. GitHub Pagesで公開
1. このZIPを展開し、中身をGitHubリポジトリのルートにアップロードします。
2. `index.html`, `style.css`, `app.js`, `manifest.json`, `sw.js` がリポジトリのルートにあることを確認します。
3. Repository > Settings > Pagesでブランチと `/ (root)` を選んで公開します。
4. 公開したURLをSupabaseのRedirect URLsに追加します。
5. 新規登録・メール確認・ログインを試します。

## 3. 写真の保存
`supabase_schema.sql` は `meal-photos` という非公開Storage bucketとユーザーID単位のポリシーを作ります。画像は `{user_id}/...` のパスに保存されます。現在の初期版では画像のアップロード・記録はできますが、記録一覧からの写真再表示や画像の削除連動は未実装です。

## 4. 写真分析AIを接続する（追加作業）
1. 利用する画像対応AIプロバイダーとモデルを決めます。
2. `supabase/functions/analyze-food/index.ts` の「Provider adapter placeholder」部分を、そのプロバイダーのAPI形式に合わせて実装します。
3. AIキーをローカルのCLIからSupabase Edge Function Secretに設定します（例：`supabase secrets set AI_API_KEY=...`）。秘密鍵をGitHubへコミットしないでください。
4. Supabase CLIでEdge Functionをデプロイします（例：`supabase functions deploy analyze-food`）。
5. 画像から料理・食材・分量を推定し、`dish_name`, `calories_kcal`, `carbs_g`, `protein_g`, `fat_g`, `fiber_g`, `notes` のJSONを返すようにします。
6. AIに、写真で見えない油・調味料の量を断定させないでください。利用者が入力した調味料メモは別枠で表示し、推定値に含まれているか明示して二重計上を避けます。

## 5. 通知
通知設定タブで食事・血糖値・体組成の通知を個別にオン/オフし、時刻を保存できます。初期値は食事08:00、血糖値07:30、体組成07:00です。通知の許可はブラウザーごとに必要です。アプリを閉じた状態でも届けるにはWeb Push配信を別途実装してください。

## 6. これからの改善候補
- AIプロバイダーを実装して写真栄養推定を有効化
- 調味料の標準カロリー表と単位換算（g/小さじ/大さじ）を追加し、ユーザーが量を確認できる計算機能
- 記録一覧で写真・編集・期間検索
- 血糖値・体重・体脂肪率のグラフ
- オフライン保存とWeb Push通知
- プロフィールの身長・目標などの個人設定
