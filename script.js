import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";

const configured = firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("ここに");
let auth = null, db = null, functions = null, processRates = {};
if(configured){
  const fbApp = initializeApp(firebaseConfig);
  auth = getAuth(fbApp);
  db = getFirestore(fbApp);
  functions = getFunctions(fbApp);
}

const workPresets = {
  "軽作業":[["商品の袋詰め",10],["シール貼り",10],["商品チェック",15],["箱詰め",20],["清掃",15]],
  "イラスト":[["ラフ作成",10],["線画",15],["色塗り",20],["背景作成",20],["イラスト完成",50]],
  "デザイン":[["バナー制作",20],["SNS画像制作",30],["チラシ制作",50],["名刺デザイン",40],["デザイン完成",50]],
  "PC作業":[["データ入力",15],["Excel作業",20],["Word文書作成",20],["資料作成",30]],
  "その他":[["練習",10],["作品制作",30],["課題完成",40]]
};
function skillTitle(level){
  if(level>=20)return "👑 マスター";
  if(level>=10)return "💎 上級";
  if(level>=7)return "🏆 中級";
  if(level>=5)return "⭐ 初級";
  if(level>=3)return "🌱 ビギナー";
  return "🔰 練習生";
}
const defaultSoftware = [
  {name:"Photoshop", icon:"🎨"},
  {name:"Illustrator", icon:"🖌️"},
  {name:"CLIP STUDIO PAINT", icon:"✏️"},
  {name:"Canva", icon:"🖼️"},
  {name:"Figma", icon:"🧩"},
  {name:"Excel", icon:"📊"},
  {name:"Word", icon:"📝"},
  {name:"HTML/CSS", icon:"💻"},
  {name:"JavaScript", icon:"⚙️"},
  {name:"なし", icon:"➖"}
];

function newData(){
  return {
    selected: defaultSoftware.map(x=>x.name),
    skills: {},
    history: [],
    levelHistory: [],
    goals: [],
    goalBonus: {}
  };
}
let data = newData();
function normalize(){
  if(!data.selected) data.selected=defaultSoftware.map(x=>x.name);
  if(!data.skills) data.skills={};
  if(!data.history) data.history=[];
  if(!data.levelHistory) data.levelHistory=[];
  if(!data.goals) data.goals=[];
  if(!data.goalBonus) data.goalBonus={};
}

/* ===== ユーザーごとのクラウド保存 ===== */
let currentUser = null;
let saveTimer = null;
let saving = Promise.resolve();
function userDoc(){ return doc(db, "users", currentUser.uid); }
function setSaveStatus(text){ const el=document.getElementById("saveStatus"); if(el) el.textContent=text; }
function save(){
  if(!currentUser) return;
  setSaveStatus("保存中…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 600);
}
function flushSave(){
  if(!currentUser) return saving;
  clearTimeout(saveTimer);
  const ref = userDoc();
  const payload = { data: JSON.parse(JSON.stringify(data)), updatedAt: serverTimestamp() };
  saving = setDoc(ref, payload)
    .then(()=>setSaveStatus("保存済み ✓"))
    .catch(err=>{ console.error(err); setSaveStatus("保存に失敗しました。通信を確認してください"); });
  return saving;
}
function ensureSkills(){
  data.selected.forEach(name=>{if(!data.skills[name]) data.skills[name]={exp:0,uses:0,minutes:0}})
}
function levelInfo(exp){
  let level=1, need=100;
  while(exp>=need){exp-=need; level++; need=Math.round(need*1.35)}
  return {level,current:exp,need};
}
function totalExp(){return Object.values(data.skills).reduce((a,b)=>a+b.exp,0)}

function renderSoftware(){
  const list=document.getElementById("softwareList");
  list.innerHTML=data.selected.map(name=>{
    const s=data.skills[name]||{exp:0};
    const l=levelInfo(s.exp);
    const item=defaultSoftware.find(x=>x.name===name);
    return `<div class="software selected" data-name="${escapeHtml(name)}">
      <div class="name">${item?.icon||"🛠️"} ${escapeHtml(name)}</div>
      <div class="lv">Lv.${l.level}　${s.exp} EXP</div>
    </div>`;
  }).join("");
  document.getElementById("software").innerHTML=data.selected.map(x=>`<option>${escapeHtml(x)}</option>`).join("");
}
function updateWorkPresets(){
  const category=document.getElementById("category").value;
  const select=document.getElementById("workPreset");
  const list=workPresets[category]||[];
  select.innerHTML='<option value="">-- 作業内容を選択 --</option>'+list.map(x=>`<option value="${escapeHtml(x[0])}" data-exp="${x[1]}">${escapeHtml(x[0])}（${x[1]}EXP）</option>`).join("");
}
document.getElementById("category").addEventListener("change",updateWorkPresets);
document.getElementById("workPreset").addEventListener("change",()=>{
  const v=document.getElementById("workPreset").value;
  if(v) document.getElementById("workName").value=v;
  updateSelectedRate();
});
function renderSkills(){
  const el=document.getElementById("skillList");
  ensureSkills();
  el.innerHTML=data.selected.map(name=>{
    const s=data.skills[name], l=levelInfo(s.exp), pct=Math.min(100,l.current/l.need*100);
    return `<div class="skill">
      <div class="skill-top"><span class="skill-name">${escapeHtml(name)}　Lv.${l.level}<span class="title-badge">${skillTitle(l.level)}</span></span><span class="skill-exp">${l.current} / ${l.need} EXP</span></div>
      <div class="mini-bar"><span style="width:${pct}%"></span></div>
      <small>使用 ${s.uses}回・作業時間 ${s.minutes}分</small>
    </div>`;
  }).join("");
}
function renderAchievements(){
  const total=totalExp();
  const workCount=data.history.length;
  const minutes=data.history.reduce((a,x)=>a+(x.minutes||0),0);
  const achievements=[
    ["🌱 はじめの一歩","最初の作業を記録",workCount>=1],
    ["⭐ 10回達成","作業を10回記録",workCount>=10],
    ["🔥 50回達成","作業を50回記録",workCount>=50],
    ["💎 100回達成","作業を100回記録",workCount>=100],
    ["✨ 100 EXP","合計100 EXPを獲得",total>=100],
    ["🏆 500 EXP","合計500 EXPを獲得",total>=500],
    ["👑 1000 EXP","合計1000 EXPを獲得",total>=1000],
    ["⏱️ 10時間","累計10時間作業",minutes>=600]
  ];
  document.getElementById("achievementList").innerHTML=achievements.map(a=>
    `<div class="achievement ${a[2]?"":"locked"}"><strong>${a[0]}</strong><small>${a[1]} ${a[2]?"✓":"🔒"}</small></div>`
  ).join("");
}
function drawGrowthChart(){
  const c=document.getElementById("growthChart"),ctx=c.getContext("2d");
  const dpr=window.devicePixelRatio||1,w=c.clientWidth||600,h=180;
  c.width=w*dpr;c.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  const records=data.history.slice(-20);
  if(!records.length){ctx.font="14px sans-serif";ctx.fillText("作業を記録すると成長グラフが表示されます。",10,30);return;}
  let sum=0;const vals=records.map(x=>sum+=x.exp+(x.bonus||0)),max=Math.max(...vals,100);
  ctx.strokeStyle="#d8d5cc";ctx.lineWidth=1;
  for(let i=0;i<4;i++){const y=20+i*(h-45)/3;ctx.beginPath();ctx.moveTo(35,y);ctx.lineTo(w-10,y);ctx.stroke();}
  ctx.strokeStyle="#4f6f52";ctx.lineWidth=3;ctx.beginPath();
  vals.forEach((v,i)=>{const x=35+i*(w-50)/Math.max(1,vals.length-1),y=20+(h-45)*(1-v/max);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
  ctx.stroke();
  ctx.fillStyle="#39423d";ctx.font="12px sans-serif";ctx.fillText(`直近${records.length}件の累計EXP`,10,170);
}
function renderLevelHistory(){
  const el=document.getElementById("levelHistory");
  el.innerHTML=data.levelHistory.slice().reverse().map(x=>
    `<div class="level-history-item"><div><strong>🎉 ${escapeHtml(x.software)} Lv.${x.level}</strong><br><small>${escapeHtml(x.title)}・${x.date}</small></div><span>LEVEL UP!</span></div>`
  ).join("") || "<p>まだレベルアップしていません。</p>";
}
function showLevelUp(items){
  if(!items.length)return;
  const text=items.map(x=>`${escapeHtml(x.software)} が Lv.${x.level}「${escapeHtml(x.title)}」になりました！`).join("<br>");
  document.getElementById("levelupText").innerHTML=text;
  document.getElementById("levelupModal").classList.remove("hidden");
}
document.getElementById("closeLevelup").addEventListener("click",()=>document.getElementById("levelupModal").classList.add("hidden"));
function periodLabel(p){return p==="daily"?"毎日":p==="weekly"?"週間":"月間"}
function periodKey(p){
  const d=new Date(), y=d.getFullYear(), m=d.getMonth()+1, day=d.getDate();
  if(p==="daily") return `${y}-${m}-${day}`;
  if(p==="monthly") return `${y}-${m}`;
  const first=new Date(y,m-1,day); const week=Math.ceil((((first-new Date(y,0,1))/86400000)+new Date(y,0,1).getDay()+1)/7);
  return `${y}-W${week}`;
}
function goalProgress(goal){
  const key=periodKey(goal.period), count=data.history.filter(x=>x.periodKey===key && x.goalId===goal.id).length;
  return Math.min(count,goal.target);
}
function renderGoalSelect(){
  const sel=document.getElementById("workGoal"); if(!sel) return;
  const cur=sel.value;
  sel.innerHTML='<option value="">目標なし</option>'+data.goals.map(g=>`<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}（${periodLabel(g.period)}）</option>`).join("");
  if(data.goals.some(g=>g.id===cur)) sel.value=cur;
}
const GOAL_BONUS_EXP=50;
function renderGoals(){
  const el=document.getElementById("goalList");
  el.innerHTML=data.goals.map(g=>{
    const count=goalProgress(g), pct=Math.min(100,count/g.target*100);
    return `<div class="goal"><div class="goal-top"><span class="goal-name">🎯 ${escapeHtml(g.name)}</span><span class="goal-count">${count}/${g.target}回</span></div><small>${periodLabel(g.period)}・達成で+${GOAL_BONUS_EXP} EXP</small><div class="goal-bar"><span style="width:${pct}%"></span></div>${count>=g.target?(data.goalBonus[g.id+"|"+periodKey(g.period)]?"🏆 目標達成！ボーナスEXP獲得済み":"🏆 目標達成！"):"あと"+(g.target-count)+"回"}</div>`;
  }).join("")||"<p>まだ目標がありません。</p>";
}
document.getElementById("goalForm").addEventListener("submit",e=>{
  e.preventDefault();
  data.goals.push({id:Date.now().toString(),period:document.getElementById("goalPeriod").value,target:Number(document.getElementById("goalTarget").value),name:document.getElementById("goalName").value.trim()});
  save();e.target.reset();render();
});
function render(){
  ensureSkills();
  const total=totalExp(), l=levelInfo(total), pct=l.current/l.need*100;
  document.getElementById("totalLevel").textContent=`Lv.${l.level}`;
  document.getElementById("totalExp").textContent=`${total} EXP`;
  document.getElementById("totalBar").style.width=`${pct}%`;
  document.getElementById("totalNext").textContent=`次のレベルまで ${l.need-l.current} EXP`;
  const minutes=data.history.reduce((a,x)=>a+(x.minutes||0),0);
  document.getElementById("workCount").textContent=data.history.length;
  document.getElementById("totalMinutes").textContent=minutes>=60?`${Math.floor(minutes/60)}時間${minutes%60}分`:`${minutes}分`;
  document.getElementById("earnedExp").textContent=total;
  document.getElementById("totalWage").textContent=`${data.history.reduce((a,x)=>a+(Number(x.wageYen)||0),0).toLocaleString("ja-JP")}円`;
  document.getElementById("history").innerHTML=data.history.slice().reverse().map(x=>
    `<div class="history-item"><div><b>${escapeHtml(x.name)}</b><br><small>${escapeHtml(x.category)}・${escapeHtml(x.software)}・${x.date}<br>${Number(x.unitPriceYen||0)}円 × ${Number(x.quantity||1)}個 = ${Number(x.wageYen||0).toLocaleString("ja-JP")}円</small></div><span class="exp">+${x.exp+(x.bonus||0)} EXP${x.bonus?`<br><small>🎯 目標ボーナス+${x.bonus}</small>`:""}</span></div>`
  ).join("") || "<p>まだ記録がありません。</p>";
  renderSoftware();renderSkills();renderAchievements();drawGrowthChart();renderLevelHistory();renderGoals();renderGoalSelect();
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

document.getElementById("workForm").addEventListener("submit",e=>{
  e.preventDefault();
  const software=document.getElementById("software").value;
  const beforeLevel=levelInfo((data.skills[software]||{exp:0}).exp).level;
  const category=document.getElementById("category").value;
  const name=document.getElementById("workName").value.trim() || document.getElementById("workPreset").value;
  if(!name){alert("作業内容を選択するか、自由入力してください。");return;}
  const minutes=Number(document.getElementById("minutes").value)||0;
  const quantity=Math.max(1,Number(document.getElementById("quantity").value)||1);
  const unitPriceYen=Math.max(0,Math.floor(Number(document.getElementById("unitPrice").value)||0));
  const difficulty=Number(document.getElementById("difficulty").value);
  const preset=document.getElementById("workPreset").selectedOptions[0];
  const baseExp=preset && preset.value ? Number(preset.dataset.exp||10) : 10;
  const exp=baseExp+difficulty*5+Math.min(30,Math.floor(minutes/30)*5);
  ensureSkills();
  const goalId=document.getElementById("workGoal").value;
  const goal=data.goals.find(g=>g.id===goalId);
  const pKey=goal?periodKey(goal.period):null;
  data.skills[software].exp+=exp;
  data.skills[software].uses++;
  data.skills[software].minutes+=minutes;
  const record={name,category,software,minutes,exp,quantity,unitPriceYen,wageYen:quantity*unitPriceYen,date:new Date().toLocaleString("ja-JP")};
  if(goal){record.goalId=goal.id;record.periodKey=pKey;}
  data.history.push(record);
  // 目標を今回の記録で達成したら、その期間に1回だけボーナスEXP
  let bonusGot=false;
  if(goal){
    const bKey=goal.id+"|"+pKey;
    if(goalProgress(goal)>=goal.target && !data.goalBonus[bKey]){
      data.goalBonus[bKey]=true;
      data.skills[software].exp+=GOAL_BONUS_EXP;
      record.bonus=GOAL_BONUS_EXP;
      bonusGot=true;
    }
  }
  const afterLevel=levelInfo(data.skills[software].exp).level;
  const levelUps=[];
  for(let lv=beforeLevel+1;lv<=afterLevel;lv++){
    const event={software,level:lv,title:skillTitle(lv),date:new Date().toLocaleString("ja-JP")};
    data.levelHistory.push(event); levelUps.push(event);
  }
  save(); e.target.reset(); updateWorkPresets();
render();
  alert(bonusGot?`記録しました！ +${exp} EXP\n🎯 目標達成ボーナス +${GOAL_BONUS_EXP} EXP！`:`記録しました！ +${exp} EXP`);
  showLevelUp(levelUps);
});
document.getElementById("addSoftwareBtn").addEventListener("click",()=>{
  const name=prompt("追加するソフト名を入力してください");
  if(!name)return;
  if(!data.selected.includes(name)){data.selected.push(name);ensureSkills();save();render();}
});
document.getElementById("resetBtn").addEventListener("click",()=>{
  if(confirm("あなたのすべての記録を削除して初期化しますか？")){
    data = newData(); ensureSkills(); updateWorkPresets(); save(); render();
  }
});

window.addEventListener("resize",drawGrowthChart);


/* ===== 認証（新規登録・ログイン・ログアウト） ===== */
const authView = document.getElementById("authView");
const appView = document.getElementById("appView");
const authForm = document.getElementById("authForm");
const authMessage = document.getElementById("authMessage");
const authSubmit = document.getElementById("authSubmit");
const authToggle = document.getElementById("authToggle");
const authTitle = document.getElementById("authTitle");
let mode = "login";

function authError(code){
  const map = {
    "auth/invalid-email":"メールアドレスの形式が正しくありません。",
    "auth/missing-password":"パスワードを入力してください。",
    "auth/weak-password":"パスワードは6文字以上にしてください。",
    "auth/email-already-in-use":"このメールアドレスはすでに登録されています。ログインしてください。",
    "auth/invalid-credential":"メールアドレスまたはパスワードが違います。",
    "auth/user-not-found":"メールアドレスまたはパスワードが違います。",
    "auth/wrong-password":"メールアドレスまたはパスワードが違います。",
    "auth/too-many-requests":"試行回数が多すぎます。しばらく待ってからやり直してください。",
    "auth/network-request-failed":"通信に失敗しました。ネットワークを確認してください。"
  };
  return map[code] || "エラーが発生しました。（"+code+"）";
}
function setMode(m){
  mode = m;
  const signup = m==="signup";
  authTitle.textContent = signup ? "新規登録" : "ログイン";
  authSubmit.textContent = signup ? "登録して始める" : "ログイン";
  authToggle.textContent = signup ? "すでにアカウントをお持ちの方はこちら" : "はじめての方は新規登録";
  document.getElementById("authPassword").autocomplete = signup ? "new-password" : "current-password";
  authMessage.textContent = "";
}
authToggle.addEventListener("click",()=>setMode(mode==="login"?"signup":"login"));

authForm.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!configured) return;
  const email = document.getElementById("authEmail").value.trim();
  const pass = document.getElementById("authPassword").value;
  authMessage.textContent = "処理中…";
  authSubmit.disabled = true;
  try{
    if(mode==="signup") await createUserWithEmailAndPassword(auth,email,pass);
    else await signInWithEmailAndPassword(auth,email,pass);
    authForm.reset();
    authMessage.textContent = "";
  }catch(err){
    authMessage.textContent = authError(err.code);
  }finally{
    authSubmit.disabled = false;
  }
});

document.getElementById("resetPassBtn").addEventListener("click",async ()=>{
  if(!configured) return;
  const email = document.getElementById("authEmail").value.trim();
  if(!email){ authMessage.textContent="パスワード再設定のため、メールアドレスを入力してください。"; return; }
  try{
    await sendPasswordResetEmail(auth,email);
    authMessage.textContent="再設定用のメールを送信しました。";
  }catch(err){ authMessage.textContent = authError(err.code); }
});

document.getElementById("logoutBtn").addEventListener("click",async ()=>{
  await flushSave();
  await signOut(auth);
});

async function loadUserData(user){
  currentUser = user;
  setSaveStatus("読み込み中…");
  let loaded = null;
  try{
    const snap = await getDoc(userDoc());
    if(snap.exists()) loaded = snap.data().data;
  }catch(err){
    console.error(err);
    setSaveStatus("読み込みに失敗しました");
    alert("データの読み込みに失敗しました。通信状況とFirestoreのルール設定を確認してください。");
  }
  if(loaded){
    data = loaded;
  }else{
    data = newData();
    // 旧版（ログインなし）の端末内データがあれば、引き継ぎを確認
    const old = localStorage.getItem("levelUpApp");
    if(old && confirm("この端末に保存されている以前のデータを、このアカウントに引き継ぎますか？")){
      try{ data = JSON.parse(old); localStorage.removeItem("levelUpApp"); }catch(_){ data = newData(); }
    }
    normalize(); ensureSkills();
    await flushSave();
  }
  normalize(); ensureSkills();
  await loadProcessRates();
  document.getElementById("userEmail").textContent = user.email;
  updateWorkPresets();
  render();
  if(!document.getElementById("adminToggle").classList.contains("hidden")) renderAdmin();
  setSaveStatus("保存済み ✓");
}

function rateKey(category,name){return `${category}::${name}`;}
async function loadProcessRates(){
  try{const snap=await getDoc(doc(db,"settings","processRates"));processRates=snap.exists()?(snap.data().rates||{}):{};}
  catch(e){processRates={};console.warn("工程単価の読み込みに失敗しました",e);}
  renderRates(); updateSelectedRate();
}
function updateSelectedRate(){
  const category=document.getElementById("category")?.value;
  const name=document.getElementById("workName")?.value.trim()||document.getElementById("workPreset")?.value;
  const input=document.getElementById("unitPrice"); if(input && category && name) input.value=processRates[rateKey(category,name)]??0;
}
function renderRates(){
  const el=document.getElementById("rateList"); if(!el)return;
  el.innerHTML=Object.entries(processRates).map(([k,v])=>`<div class="admin-row">${escapeHtml(k.replace("::"," / "))}<b>${Number(v).toLocaleString("ja-JP")}円</b></div>`).join("")||"<p>工程単価はまだ設定されていません。</p>";
}
async function renderAdmin(){
  const list=document.getElementById("adminUsers"); list.textContent="利用者情報を読み込み中…";
  try{
    const result=await httpsCallable(functions,"getAdminOverview")();
    list.innerHTML=`<form id="adminAddForm" class="two"><label>管理者にする利用者のメールアドレス<input id="adminEmail" type="email" required></label><button class="main-btn" type="submit">管理者に追加</button></form>`+
      result.data.users.map(u=>`<div class="admin-row"><span>${escapeHtml(u.email||u.uid)}<small>工賃合計 ${Number(u.wageYen||0).toLocaleString("ja-JP")}円</small></span><span>${u.admin?"管理者":"利用者"}${u.email?` <button type="button" class="small-btn" data-email="${escapeHtml(u.email)}" data-enabled="${u.admin?"false":"true"}">${u.admin?"管理者解除":"管理者にする"}</button>`:""}</span></div>`).join("")||"<p>利用者はいません。</p>`;
    list.querySelector("#adminAddForm").addEventListener("submit",async e=>{e.preventDefault(); await setAdminByEmail(document.getElementById("adminEmail").value,true);});
    list.querySelectorAll("button[data-email]").forEach(b=>b.addEventListener("click",()=>setAdminByEmail(b.dataset.email,b.dataset.enabled==="true")));
  }catch(e){list.textContent="管理者情報を取得できませんでした。Cloud Functionsの公開と管理者設定を確認してください。";console.error(e);}
}
async function setAdminByEmail(email,enabled){
  try{await httpsCallable(functions,"setAdminRole")({email,enabled});await renderAdmin();}
  catch(e){alert("管理者の変更に失敗しました。入力したメールアドレスと設定を確認してください。");console.error(e);}
}
document.getElementById("adminToggle").addEventListener("click",()=>{const p=document.getElementById("adminPanel");p.classList.toggle("hidden");if(!p.classList.contains("hidden"))renderAdmin();});
document.getElementById("rateForm").addEventListener("submit",async e=>{
  e.preventDefault();const key=rateKey(document.getElementById("rateCategory").value.trim(),document.getElementById("rateName").value.trim());
  processRates[key]=Math.floor(Number(document.getElementById("rateYen").value));
  try{await setDoc(doc(db,"settings","processRates"),{rates:processRates,updatedAt:serverTimestamp()});renderRates();updateSelectedRate();e.target.reset();}
  catch(err){alert("単価を保存できませんでした。管理者権限を確認してください。");console.error(err);}
});
document.getElementById("category").addEventListener("change",updateSelectedRate);
document.getElementById("workName").addEventListener("input",updateSelectedRate);

if(!configured){
  authMessage.textContent = "firebase-config.js に Firebase の設定を入力してください（README参照）。";
  authSubmit.disabled = true;
}else{
  onAuthStateChanged(auth, async user=>{
    if(user){
      authView.classList.add("hidden");
      appView.classList.remove("hidden");
      try{const adminSnap=await getDoc(doc(db,"admins",user.uid));document.getElementById("adminToggle").classList.toggle("hidden",!adminSnap.exists());}
      catch(_){document.getElementById("adminToggle").classList.add("hidden");}
      await loadUserData(user);
    }else{
      // ログアウト時は画面上のデータを完全に消す（他のユーザーに見えないように）
      currentUser = null;
      data = newData();
      document.getElementById("adminToggle").classList.add("hidden");
      document.getElementById("adminPanel").classList.add("hidden");
      appView.classList.add("hidden");
      authView.classList.remove("hidden");
    }
  });
}
