/* 糖尿病改善サポート - Auth0ログイン接続版
 * Auth0のDomainとClient IDはブラウザー公開用の設定値です。Client Secretは絶対に置かないでください。
 * 健康記録のクラウド保存は、Auth0トークンを検証するバックエンド接続後に有効化します。
 */
const auth0Config = {
  domain: "dev-sjxnzbhtja8bcx2v.us.auth0.com",
  clientId: "a4uAboQssJaeVLBuf9eOiXNlOznkAD2t",
  authorizationParams: {
    redirect_uri: window.location.origin + window.location.pathname,
    scope: "openid profile email"
  },
  cacheLocation: "memory"
};
let auth0Client = null;
let auth0Ready = false;
// FirestoreはAuth0トークンをそのまま認証できないため、現段階では接続しません。
const firebaseReady = false;
const auth = null;
const firestore = null;

const $ = (id) => document.getElementById(id);
let currentUser = null;
let meals = [], glucoseRecords = [], bodyRecords = [];
let analysisResult = null;
let reminderTimer = null;
const REMINDER_KEY = "diabetes-support-reminders-v1";

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0,16);
}
["mealAt","glucoseAt","bodyAt"].forEach(id => { $(id).value = localDateTimeValue(); });
function setMessage(id, text, isError=false) { $(id).textContent = text; $(id).style.color = isError ? "#a3332b" : ""; }
function showApp() {
  $("appContent").classList.toggle("hidden", !currentUser);
  $("authPanel").classList.toggle("hidden", !!currentUser);
  $("logoutBtn").classList.toggle("hidden", !currentUser);
  $("userLabel").textContent = currentUser ? (currentUser.email || "ログイン中") : "未ログイン";
  $("setupNotice").classList.toggle("hidden", firebaseReady);
}
function setActiveTab(name) {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("hidden", p.id !== `tab-${name}`));
}
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => setActiveTab(b.dataset.tab)));

async function initAuth0() {
  try {
    // Auth0公式CDNのSDKが読み込まれるまで確認します。
    if (!window.auth0 || typeof window.auth0.createAuth0Client !== "function") {
      throw new Error("Auth0 SDKが読み込まれていません。通信制限やCDNの読み込み状態を確認してください。");
    }
    auth0Client = await window.auth0.createAuth0Client(auth0Config);
    const params = new URLSearchParams(window.location.search);
    if (params.has("code") && params.has("state")) {
      await auth0Client.handleRedirectCallback();
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    currentUser = await auth0Client.getUser() || null;
    auth0Ready = true;
    $("loginBtn").disabled = false;
    $("signupBtn").disabled = false;
    if (currentUser) {
      showApp();
      await loadRecords();
      startReminderLoop();
    } else {
      showApp();
    }
  } catch (error) {
    console.error("Auth0初期化エラー", error);
    showApp();
    $("loginBtn").disabled = false;
    $("signupBtn").disabled = false;
    const detail = error && error.message ? `（${error.message}）` : "";
    setMessage("authMessage", `Auth0の初期化に失敗しました。ページを再読み込みしてください。${detail}`, true);
  }
}
async function authAction(mode) {
  if (!auth0Client) { setMessage("authMessage", "ログイン機能を準備中です。少し待ってから再度お試しください。", true); return; }
  try {
    setMessage("authMessage", "Auth0の安全なログイン画面へ移動します…");
    // DB接続を明示し、signupボタンではAuth0の登録画面を直接表示します。
    const authorizationParams = {
      connection: "Username-Password-Authentication",
      ...(mode === "signup" ? { screen_hint: "signup" } : { screen_hint: "login" })
    };
    await auth0Client.loginWithRedirect({ authorizationParams });
  } catch (error) {
    console.error(error);
    setMessage("authMessage", "ログイン画面を開けませんでした。Auth0のAllowed Callback URLsなどを確認してください。", true);
  }
}
$("loginBtn").addEventListener("click", () => authAction("login"));
$("signupBtn").addEventListener("click", () => authAction("signup"));
$("logoutBtn").addEventListener("click", async () => {
  if (!auth0Client) return;
  await auth0Client.logout({ logoutParams: { returnTo: window.location.origin + window.location.pathname } });
});

function userCollection(name) {
  throw new Error("記録保存サーバーは次の工程で接続します。");
}
async function getRows(collectionName, orderField) { return []; }
async function loadRecords() {
  // Auth0ログインのみを先に確認。データ保存APIは次工程で接続します。
  meals = []; glucoseRecords = []; bodyRecords = []; renderAll();
}
async function insertRecord(collectionName, payload, messageId) {
  setMessage(messageId, "ログイン接続は完了しています。記録のクラウド保存は次の工程で接続します。", true);
  return false;
}

$("mealPhoto").addEventListener("change", () => {
  const file = $("mealPhoto").files[0];
  if (!file) { $("photoPreviewWrap").classList.add("hidden"); return; }
  if (!file.type.startsWith("image/")) { setMessage("mealMessage","画像ファイルを選択してください。",true); return; }
  $("photoPreview").src = URL.createObjectURL(file); $("photoPreviewWrap").classList.remove("hidden"); analysisResult = null;
});
$("analyzeBtn").addEventListener("click", async () => {
  if (!$("mealPhoto").files[0]) { setMessage("mealMessage","先に食事の写真を選択してください。",true); return; }
  setMessage("mealMessage", "写真の栄養推定AIはまだ接続されていません。現在は料理名・調味料メモを入力して記録できます。", true);
});
function renderAnalysis(d) {
  const box = $("nutritionResult"); box.classList.remove("hidden");
  box.innerHTML = `<h3>写真からの栄養推定（確認・修正してください）</h3><p><strong>${escapeHtml(d.dish_name || "料理名未特定")}</strong></p>
  <p>推定カロリー：<strong>${num(d.calories_kcal)} kcal</strong> ／ 炭水化物：${num(d.carbs_g)} g ／ たんぱく質：${num(d.protein_g)} g ／ 脂質：${num(d.fat_g)} g ／ 食物繊維：${num(d.fiber_g)} g</p>
  <p>推定の根拠・注意：${escapeHtml(d.notes || "写真からの推定値です。")}</p>
  <label>カロリー修正（kcal）<input id="editCalories" type="number" min="0" max="20000" step="1" value="${num(d.calories_kcal)}"></label>
  <label>炭水化物修正（g）<input id="editCarbs" type="number" min="0" max="3000" step="0.1" value="${num(d.carbs_g)}"></label>
  <label>たんぱく質修正（g）<input id="editProtein" type="number" min="0" max="3000" step="0.1" value="${num(d.protein_g)}"></label>
  <label>脂質修正（g）<input id="editFat" type="number" min="0" max="3000" step="0.1" value="${num(d.fat_g)}"></label>`;
}
function num(v) { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; }
function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

$("mealForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentUser) { setMessage("mealMessage", "先にログインしてください。", true); return; }
  // 無料Sparkプラン版では写真ファイルをクラウドにアップロードしません。
  // 写真は画面上で確認できますが、記録を保存した後に写真自体は保存されません。
  const photoPath = null;
  const result = analysisResult || {};
  const payload = {
    eaten_at:new Date($("mealAt").value).toISOString(), meal_type:$("mealType").value,
    description:$("mealDescription").value.trim(), seasoning_note:$("seasoningNote").value.trim(), photo_path:photoPath,
    dish_name:result.dish_name || null,
    calories_kcal:$("editCalories") ? num($("editCalories").value) : num(result.calories_kcal),
    carbs_g:$("editCarbs") ? num($("editCarbs").value) : num(result.carbs_g),
    protein_g:$("editProtein") ? num($("editProtein").value) : num(result.protein_g),
    fat_g:$("editFat") ? num($("editFat").value) : num(result.fat_g), fiber_g:num(result.fiber_g),
    estimate_notes:result.notes || null, is_ai_estimate:!!analysisResult
  };
  if (await insertRecord("meals",payload,"mealMessage")) {
    $("mealForm").reset(); $("mealAt").value=localDateTimeValue(); $("photoPreviewWrap").classList.add("hidden"); $("nutritionResult").classList.add("hidden"); analysisResult=null;
  }
});

$("glucoseForm").addEventListener("submit", async e => {
  e.preventDefault(); const value=Number($("glucoseValue").value);
  if (!Number.isFinite(value) || value<=0) { setMessage("glucoseMessage","1以上の血糖値を入力してください。",true); return; }
  await insertRecord("glucose_records", { measured_at:new Date($("glucoseAt").value).toISOString(), glucose_mg_dl:value,
    timing:$("glucoseTiming").value, related_meal:$("glucoseMeal").value, note:$("glucoseNote").value.trim() }, "glucoseMessage");
});
function updateBmi() { const h=Number($("height").value)/100,w=Number($("weight").value); $("bmiResult").textContent=h>0&&w>0?`BMI：約${(w/(h*h)).toFixed(1)}（参考値）`:"BMI：身長と体重を入力すると計算します。"; }
$("height").addEventListener("input",updateBmi); $("weight").addEventListener("input",updateBmi);
$("bodyForm").addEventListener("submit", async e => {
  e.preventDefault();
  const payload={ measured_at:new Date($("bodyAt").value).toISOString(), height_cm:optionalNum("height"), weight_kg:Number($("weight").value),
    body_fat_pct:optionalNum("bodyFat"), muscle_kg:optionalNum("muscle"), water_pct:optionalNum("water"), visceral_fat_level:optionalNum("visceral"), note:$("bodyNote").value.trim() };
  if (await insertRecord("body_records",payload,"bodyMessage")) { $("bodyForm").reset(); $("bodyAt").value=localDateTimeValue(); updateBmi(); }
});
function optionalNum(id) { const v=$(id).value.trim(); return v===""?null:Number(v); }
async function deleteRecord(collectionName,id) {
  alert("記録保存サーバーを接続した後に削除機能を有効化します。");
}
function renderAll() {
  const today=new Date().toLocaleDateString("sv-SE");
  const todayMeals=meals.filter(m=>String(m.eaten_at||"").slice(0,10)===today);
  $("mealCount").textContent=`${todayMeals.length}件`;
  $("calorieTotal").innerHTML=`${Math.round(todayMeals.reduce((s,m)=>s+num(m.calories_kcal),0))} <small>kcal</small>`;
  $("latestGlucose").textContent=glucoseRecords[0]?glucoseRecords[0].glucose_mg_dl:"未記録";
  $("latestWeight").textContent=bodyRecords[0]?bodyRecords[0].weight_kg:"未記録";
  const items=[
    ...meals.map(r=>({kind:"食事",date:r.eaten_at,title:`${r.meal_type}：${r.dish_name||r.description||"食事"}`,detail:`${num(r.calories_kcal)} kcal · 炭水化物 ${num(r.carbs_g)} g${r.seasoning_note?" · 調味料："+r.seasoning_note:""}`,id:r.id,collection:"meals"})),
    ...glucoseRecords.map(r=>({kind:"血糖値",date:r.measured_at,title:`血糖値：${r.glucose_mg_dl} mg/dL`,detail:`${r.timing||""} · ${r.related_meal||""} ${r.note||""}`,id:r.id,collection:"glucose_records"})),
    ...bodyRecords.map(r=>({kind:"体組成",date:r.measured_at,title:`体重：${r.weight_kg} kg`,detail:`体脂肪率 ${r.body_fat_pct??"未記録"}% · 筋肉量 ${r.muscle_kg??"未記録"} kg ${r.note||""}`,id:r.id,collection:"body_records"}))
  ].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,60);
  const list=$("historyList"); list.innerHTML="";
  if(!items.length){list.innerHTML='<p class="muted">記録はまだありません。</p>';return;}
  for(const item of items){
    const el=document.createElement("article");el.className="history-item"; const main=document.createElement("div");main.className="item-main";
    const h=document.createElement("h3");h.textContent=`${item.kind} · ${item.title}`;
    const p=document.createElement("p");p.textContent=`${new Date(item.date).toLocaleString("ja-JP")}　${item.detail}`;
    main.append(h,p); const del=document.createElement("button");del.className="delete-btn";del.textContent="削除";del.addEventListener("click",()=>deleteRecord(item.collection,item.id));el.append(main,del);list.append(el);
  }
}
$("refreshBtn").addEventListener("click",loadRecords);

/* 通知：ブラウザーが開いている間、指定時刻を確認します。 */
function readReminders() {
  try { return JSON.parse(localStorage.getItem(REMINDER_KEY)) || {mealOn:true,mealTime:"08:00",glucoseOn:true,glucoseTime:"07:30",bodyOn:false,bodyTime:"07:00"}; }
  catch { return {mealOn:true,mealTime:"08:00",glucoseOn:true,glucoseTime:"07:30",bodyOn:false,bodyTime:"07:00"}; }
}
function fillReminders() { const r=readReminders(); $("mealReminderOn").checked=r.mealOn; $("mealReminderTime").value=r.mealTime; $("glucoseReminderOn").checked=r.glucoseOn; $("glucoseReminderTime").value=r.glucoseTime; $("bodyReminderOn").checked=r.bodyOn; $("bodyReminderTime").value=r.bodyTime; }
function saveReminders() { const r={mealOn:$("mealReminderOn").checked,mealTime:$("mealReminderTime").value,glucoseOn:$("glucoseReminderOn").checked,glucoseTime:$("glucoseReminderTime").value,bodyOn:$("bodyReminderOn").checked,bodyTime:$("bodyReminderTime").value}; localStorage.setItem(REMINDER_KEY,JSON.stringify(r)); startReminderLoop(); }
$("reminderForm").addEventListener("submit",e=>{e.preventDefault();saveReminders();setMessage("reminderMessage","通知時刻をこのブラウザーに保存しました。");});
$("enableNotifications").addEventListener("click",async()=>{if(!("Notification" in window)){setMessage("reminderMessage","このブラウザーは通知に対応していません。",true);return;}const p=await Notification.requestPermission();setMessage("reminderMessage",p==="granted"?"通知が許可されました。":"通知が許可されていません。ブラウザー設定を確認してください。",p!=="granted");});
$("testNotification").addEventListener("click",()=>{if(!("Notification" in window)||Notification.permission!=="granted"){setMessage("reminderMessage","先に「通知を許可する」を押してください。",true);return;}new Notification("糖尿病改善サポート",{body:"これはテスト通知です。記録を忘れずに！"});setMessage("reminderMessage","テスト通知を送信しました。");});
function startReminderLoop() {
  if(reminderTimer)clearInterval(reminderTimer);if(!currentUser)return;
  const check=()=>{if(!("Notification" in window)||Notification.permission!=="granted")return;const r=readReminders(),now=new Date(),hhmm=now.toTimeString().slice(0,5),day=now.toLocaleDateString("sv-SE");
    const types=[["meal",r.mealOn,r.mealTime,"食事記録","今日の食事を記録しましょう。"],["glucose",r.glucoseOn,r.glucoseTime,"血糖値記録","測定している場合は血糖値を記録しましょう。"],["body",r.bodyOn,r.bodyTime,"体重・体組成","体重・体組成を測定したら記録しましょう。"]];
    types.forEach(([key,on,time,title,body])=>{const stamp=`${day}-${key}-${time}`;if(on&&time===hhmm&&localStorage.getItem(`reminder-fired-${stamp}`)!=="1"){new Notification(title,{body});localStorage.setItem(`reminder-fired-${stamp}`,"1");}});
  };check();reminderTimer=setInterval(check,30000);
}
fillReminders();
if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(console.warn);


// ページ読み込み後にAuth0クライアントを初期化します。
initAuth0();
