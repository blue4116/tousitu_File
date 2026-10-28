/* 糖尿病改善サポート
 * Supabase URL / anon key はプロジェクト設定後に入力してください。
 * service_role key や AI API の秘密鍵をこのファイルに書かないでください。
 */
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
const supabaseReady = window.supabase && SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");
const db = supabaseReady ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const $ = (id) => document.getElementById(id);
let currentUser = null;
let meals = [], glucoseRecords = [], bodyRecords = [];
let analysisResult = null;
let reminderTimer = null;
const REMINDER_KEY = "diabetes-support-reminders-v1";
const localDemoKey = "diabetes-support-demo-records-v1";

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0,16);
}
["mealAt","glucoseAt","bodyAt"].forEach(id => { $(id).value = localDateTimeValue(); });

function setMessage(id, text, isError=false) {
  $(id).textContent = text;
  $(id).style.color = isError ? "#a3332b" : "";
}
function showApp() {
  $("appContent").classList.toggle("hidden", !currentUser);
  $("authPanel").classList.toggle("hidden", !!currentUser);
  $("logoutBtn").classList.toggle("hidden", !currentUser);
  $("userLabel").textContent = currentUser ? currentUser.email : "未ログイン";
  $("setupNotice").classList.toggle("hidden", supabaseReady);
}
function setActiveTab(name) {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("hidden", p.id !== `tab-${name}`));
}
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => setActiveTab(b.dataset.tab)));

async function authAction(mode) {
  if (!db) { setMessage("authMessage", "Supabase設定がまだです。READMEの手順でURLと公開キーを設定してください。", true); return; }
  const email = $("email").value.trim(), password = $("password").value;
  if (!email || password.length < 6) { setMessage("authMessage", "メールアドレスと6文字以上のパスワードを入力してください。", true); return; }
  setMessage("authMessage", "処理中です…");
  const result = mode === "signup"
    ? await db.auth.signUp({email, password})
    : await db.auth.signInWithPassword({email, password});
  if (result.error) { setMessage("authMessage", result.error.message, true); return; }
  if (mode === "signup" && !result.data.session) {
    setMessage("authMessage", "登録しました。受信メールの確認リンクを開いてからログインしてください。");
  } else {
    currentUser = result.data.user;
    await loadRecords();
    showApp();
    setMessage("authMessage", "ログインしました。");
    startReminderLoop();
  }
}
$("authForm").addEventListener("submit", e => { e.preventDefault(); authAction("login"); });
$("signupBtn").addEventListener("click", () => authAction("signup"));
$("logoutBtn").addEventListener("click", async () => {
  if (db) await db.auth.signOut();
  currentUser = null; meals=[]; glucoseRecords=[]; bodyRecords=[]; showApp(); renderAll();
});

if (db) {
  db.auth.getSession().then(async ({data}) => {
    if (data.session) {
      currentUser = data.session.user;
      await loadRecords();
      showApp();
      startReminderLoop();
    } else showApp();
  });
  db.auth.onAuthStateChange(async (_event, session) => {
    if (session && !currentUser) {
      currentUser = session.user; await loadRecords(); showApp(); startReminderLoop();
    }
  });
} else showApp();

async function getRows(table) {
  const {data,error} = await db.from(table).select("*").order("created_at", {ascending:false}).limit(300);
  if (error) throw error;
  return data || [];
}
async function loadRecords() {
  if (!db || !currentUser) return;
  try {
    [meals, glucoseRecords, bodyRecords] = await Promise.all([
      getRows("meals"), getRows("glucose_records"), getRows("body_records")
    ]);
    renderAll();
  } catch (e) {
    console.error(e);
    alert("記録を読み込めませんでした。SupabaseのSQLとRLS設定を確認してください。");
  }
}
async function insertRecord(table, payload, messageId) {
  if (!db || !currentUser) { setMessage(messageId, "保存するにはログインしてください。", true); return false; }
  const {error} = await db.from(table).insert({...payload, user_id:currentUser.id});
  if (error) { console.error(error); setMessage(messageId, "保存できませんでした。データベース設定を確認してください: " + error.message, true); return false; }
  await loadRecords();
  setMessage(messageId, "保存しました。");
  return true;
}

$("mealPhoto").addEventListener("change", () => {
  const file = $("mealPhoto").files[0];
  if (!file) { $("photoPreviewWrap").classList.add("hidden"); return; }
  if (!file.type.startsWith("image/")) { setMessage("mealMessage","画像ファイルを選択してください。",true); return; }
  $("photoPreview").src = URL.createObjectURL(file);
  $("photoPreviewWrap").classList.remove("hidden");
  analysisResult = null;
});
$("analyzeBtn").addEventListener("click", async () => {
  const file = $("mealPhoto").files[0];
  if (!file) { setMessage("mealMessage","先に食事の写真を選択してください。",true); return; }
  if (!db || !currentUser) { setMessage("mealMessage","写真の栄養推定を使うには、Supabase設定とログインが必要です。",true); return; }
  const btn = $("analyzeBtn"); btn.disabled = true; btn.textContent = "分析中…";
  try {
    // Edge Functionは秘密鍵をサーバー側に保持。クライアントへAIキーを置かない。
    const {data: {session}} = await db.auth.getSession();
    const form = new FormData();
    form.append("photo", file);
    form.append("description", $("mealDescription").value);
    form.append("seasoning_note", $("seasoningNote").value);
    const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-food`, {
      method:"POST",
      headers:{Authorization:`Bearer ${session.access_token}`, apikey:SUPABASE_ANON_KEY},
      body:form
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "写真分析に失敗しました。");
    analysisResult = data;
    renderAnalysis(data);
    setMessage("mealMessage","推定が完了しました。料理名・量・調味料を確認してから保存してください。");
  } catch (e) {
    setMessage("mealMessage",e.message + " READMEのAI設定手順を確認してください。",true);
  } finally { btn.disabled = false; btn.textContent = "写真を分析"; }
});
function renderAnalysis(d) {
  const box = $("nutritionResult"); box.classList.remove("hidden");
  box.innerHTML = `<h3>写真からの栄養推定（確認・修正してください）</h3>
    <p><strong>${escapeHtml(d.dish_name || "料理名未特定")}</strong></p>
    <p>推定カロリー：<strong>${num(d.calories_kcal)} kcal</strong> ／ 炭水化物：${num(d.carbs_g)} g ／ たんぱく質：${num(d.protein_g)} g ／ 脂質：${num(d.fat_g)} g ／ 食物繊維：${num(d.fiber_g)} g</p>
    <p>推定の根拠・注意：${escapeHtml(d.notes || "写真からの推定値です。")}</p>
    <label>カロリー修正（kcal）<input id="editCalories" type="number" min="0" max="20000" step="1" value="${num(d.calories_kcal)}"></label>
    <label>炭水化物修正（g）<input id="editCarbs" type="number" min="0" max="3000" step="0.1" value="${num(d.carbs_g)}"></label>
    <label>たんぱく質修正（g）<input id="editProtein" type="number" min="0" max="3000" step="0.1" value="${num(d.protein_g)}"></label>
    <label>脂質修正（g）<input id="editFat" type="number" min="0" max="3000" step="0.1" value="${num(d.fat_g)}"></label>
    <p class="muted">調味料メモの追加分がAI結果に含まれているか、分析結果の注意書きを確認してください。二重計上を避けてください。</p>`;
}
function num(v) { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; }
function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

$("mealForm").addEventListener("submit", async e => {
  e.preventDefault();
  const file = $("mealPhoto").files[0];
  let photoPath = null;
  if (file && db && currentUser) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    photoPath = `${currentUser.id}/${Date.now()}-${safeName}`;
    const {error} = await db.storage.from("meal-photos").upload(photoPath,file,{upsert:false,contentType:file.type});
    if (error) { setMessage("mealMessage","写真を保存できませんでした。Storageの設定を確認してください: "+error.message,true); return; }
  }
  const result = analysisResult || {};
  const calories = $("editCalories") ? num($("editCalories").value) : num(result.calories_kcal);
  const carbs = $("editCarbs") ? num($("editCarbs").value) : num(result.carbs_g);
  const protein = $("editProtein") ? num($("editProtein").value) : num(result.protein_g);
  const fat = $("editFat") ? num($("editFat").value) : num(result.fat_g);
  const payload = {
    eaten_at:new Date($("mealAt").value).toISOString(),
    meal_type:$("mealType").value,
    description:$("mealDescription").value.trim(),
    seasoning_note:$("seasoningNote").value.trim(),
    photo_path:photoPath,
    dish_name:result.dish_name || null,
    calories_kcal:calories,
    carbs_g:carbs, protein_g:protein, fat_g:fat, fiber_g:num(result.fiber_g),
    estimate_notes:result.notes || null,
    is_ai_estimate:!!analysisResult
  };
  if (await insertRecord("meals",payload,"mealMessage")) {
    $("mealForm").reset(); $("mealAt").value=localDateTimeValue(); $("photoPreviewWrap").classList.add("hidden"); $("nutritionResult").classList.add("hidden"); analysisResult=null;
  }
});

$("glucoseForm").addEventListener("submit", async e => {
  e.preventDefault();
  const value = Number($("glucoseValue").value);
  if (!Number.isFinite(value) || value <= 0) { setMessage("glucoseMessage","1以上の血糖値を入力してください。",true); return; }
  await insertRecord("glucose_records",{
    measured_at:new Date($("glucoseAt").value).toISOString(), glucose_mg_dl:value,
    timing:$("glucoseTiming").value, related_meal:$("glucoseMeal").value, note:$("glucoseNote").value.trim()
  },"glucoseMessage");
});
function updateBmi() {
  const h=Number($("height").value)/100,w=Number($("weight").value);
  $("bmiResult").textContent = h>0 && w>0 ? `BMI：約${(w/(h*h)).toFixed(1)}（参考値）` : "BMI：身長と体重を入力すると計算します。";
}
$("height").addEventListener("input",updateBmi); $("weight").addEventListener("input",updateBmi);
$("bodyForm").addEventListener("submit", async e => {
  e.preventDefault();
  const payload={
    measured_at:new Date($("bodyAt").value).toISOString(),
    height_cm:optionalNum("height"), weight_kg:Number($("weight").value),
    body_fat_pct:optionalNum("bodyFat"), muscle_kg:optionalNum("muscle"),
    water_pct:optionalNum("water"), visceral_fat_level:optionalNum("visceral"),
    note:$("bodyNote").value.trim()
  };
  if (await insertRecord("body_records",payload,"bodyMessage")) {
    $("bodyForm").reset(); $("bodyAt").value=localDateTimeValue(); updateBmi();
  }
});
function optionalNum(id) { const v=$(id).value.trim(); return v===""?null:Number(v); }

async function deleteRecord(table,id) {
  if (!confirm("この記録を削除しますか？")) return;
  const {error}=await db.from(table).delete().eq("id",id);
  if (error) { alert("削除できませんでした: "+error.message); return; }
  await loadRecords();
}
function renderAll() {
  const today = new Date().toLocaleDateString("sv-SE");
  const todayMeals=meals.filter(m => String(m.eaten_at).slice(0,10)===today);
  $("mealCount").textContent=`${todayMeals.length}件`;
  $("calorieTotal").innerHTML=`${Math.round(todayMeals.reduce((s,m)=>s+num(m.calories_kcal),0))} <small>kcal</small>`;
  $("latestGlucose").textContent=glucoseRecords[0]?glucoseRecords[0].glucose_mg_dl:"未記録";
  $("latestWeight").textContent=bodyRecords[0]?bodyRecords[0].weight_kg:"未記録";
  const items=[
    ...meals.map(r=>({kind:"食事",date:r.eaten_at,title:`${r.meal_type}：${r.dish_name||r.description||"食事"}`,detail:`${num(r.calories_kcal)} kcal · 炭水化物 ${num(r.carbs_g)} g${r.seasoning_note?" · 調味料："+r.seasoning_note:""}`,id:r.id,table:"meals"})),
    ...glucoseRecords.map(r=>({kind:"血糖値",date:r.measured_at,title:`血糖値：${r.glucose_mg_dl} mg/dL`,detail:`${r.timing||""} · ${r.related_meal||""} ${r.note||""}`,id:r.id,table:"glucose_records"})),
    ...bodyRecords.map(r=>({kind:"体組成",date:r.measured_at,title:`体重：${r.weight_kg} kg`,detail:`体脂肪率 ${r.body_fat_pct??"未記録"}% · 筋肉量 ${r.muscle_kg??"未記録"} kg ${r.note||""}`,id:r.id,table:"body_records"}))
  ].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,60);
  const list=$("historyList"); list.innerHTML="";
  if(!items.length){list.innerHTML='<p class="muted">記録はまだありません。</p>';return;}
  for(const item of items){
    const el=document.createElement("article");el.className="history-item";
    const main=document.createElement("div");main.className="item-main";
    const h=document.createElement("h3");h.textContent=`${item.kind} · ${item.title}`;
    const p=document.createElement("p");p.textContent=`${new Date(item.date).toLocaleString("ja-JP")}　${item.detail}`;
    main.append(h,p);
    const del=document.createElement("button");del.className="delete-btn";del.textContent="削除";del.addEventListener("click",()=>deleteRecord(item.table,item.id));
    el.append(main,del);list.append(el);
  }
}
$("refreshBtn").addEventListener("click",loadRecords);

/* 通知：ブラウザーが開いている間、分単位で指定時刻を確認。
   閉じている間も届けるWeb Pushは別途サーバー/Push設定が必要です。 */
function readReminders() {
  try { return JSON.parse(localStorage.getItem(REMINDER_KEY)) || {
    mealOn:true,mealTime:"08:00",glucoseOn:true,glucoseTime:"07:30",bodyOn:false,bodyTime:"07:00"
  }; } catch { return {mealOn:true,mealTime:"08:00",glucoseOn:true,glucoseTime:"07:30",bodyOn:false,bodyTime:"07:00"}; }
}
function fillReminders() {
  const r=readReminders();
  $("mealReminderOn").checked=r.mealOn; $("mealReminderTime").value=r.mealTime;
  $("glucoseReminderOn").checked=r.glucoseOn; $("glucoseReminderTime").value=r.glucoseTime;
  $("bodyReminderOn").checked=r.bodyOn; $("bodyReminderTime").value=r.bodyTime;
}
function saveReminders() {
  const r={mealOn:$("mealReminderOn").checked,mealTime:$("mealReminderTime").value,
    glucoseOn:$("glucoseReminderOn").checked,glucoseTime:$("glucoseReminderTime").value,
    bodyOn:$("bodyReminderOn").checked,bodyTime:$("bodyReminderTime").value};
  localStorage.setItem(REMINDER_KEY,JSON.stringify(r)); startReminderLoop();
}
$("reminderForm").addEventListener("submit",e=>{e.preventDefault();saveReminders();setMessage("reminderMessage","通知時刻をこのブラウザーに保存しました。");});
$("enableNotifications").addEventListener("click",async()=>{
  if(!("Notification" in window)){setMessage("reminderMessage","このブラウザーは通知に対応していません。",true);return;}
  const permission=await Notification.requestPermission();
  setMessage("reminderMessage",permission==="granted"?"通知が許可されました。":"通知が許可されていません。ブラウザー設定を確認してください。",permission!=="granted");
});
$("testNotification").addEventListener("click",()=>{
  if(!("Notification" in window)||Notification.permission!=="granted"){setMessage("reminderMessage","先に「通知を許可する」を押してください。",true);return;}
  new Notification("糖尿病改善サポート",{body:"これはテスト通知です。記録を忘れずに！"});
  setMessage("reminderMessage","テスト通知を送信しました。");
});
function startReminderLoop() {
  if(reminderTimer) clearInterval(reminderTimer);
  if(!currentUser) return;
  const check=()=>{
    if(!("Notification" in window)||Notification.permission!=="granted") return;
    const r=readReminders(),now=new Date(),hhmm=now.toTimeString().slice(0,5),day=now.toLocaleDateString("sv-SE");
    const types=[["meal",r.mealOn,r.mealTime,"食事記録","今日の食事を記録しましょう。"],["glucose",r.glucoseOn,r.glucoseTime,"血糖値記録","測定している場合は血糖値を記録しましょう。"],["body",r.bodyOn,r.bodyTime,"体重・体組成","体重・体組成を測定したら記録しましょう。"]];
    types.forEach(([key,on,time,title,body])=>{
      const stamp=`${day}-${key}-${time}`;
      if(on&&time===hhmm&&localStorage.getItem(`reminder-fired-${stamp}`)!=="1"){
        new Notification(title,{body});localStorage.setItem(`reminder-fired-${stamp}`,"1");
      }
    });
  };
  check(); reminderTimer=setInterval(check,30000);
}
fillReminders();
if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(console.warn);
