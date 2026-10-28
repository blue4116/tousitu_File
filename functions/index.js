const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

async function requireAdmin(uid) {
  const snap = await db.doc(`admins/${uid}`).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "管理者だけが実行できます。");
}

exports.getAdminOverview = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "ログインしてください。");
  await requireAdmin(request.auth.uid);
  const [usersResult, adminSnap] = await Promise.all([
    getAuth().listUsers(1000),
    db.collection("admins").get()
  ]);
  const adminIds = new Set(adminSnap.docs.map(d => d.id));
  const users = await Promise.all(usersResult.users.map(async user => {
    const dataSnap = await db.doc(`users/${user.uid}`).get();
    const history = dataSnap.exists ? (dataSnap.data().data?.history || []) : [];
    const wageYen = history.reduce((sum, row) => sum + (Number(row.wageYen) || 0), 0);
    return { uid: user.uid, email: user.email || "", admin: adminIds.has(user.uid), wageYen };
  }));
  return { users };
});

exports.setAdminRole = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "ログインしてください。");
  await requireAdmin(request.auth.uid);
  const email = String(request.data?.email || "").trim().toLowerCase();
  const enabled = request.data?.enabled === true;
  if (!email) throw new HttpsError("invalid-argument", "メールアドレスを入力してください。");
  let target;
  try { target = await getAuth().getUserByEmail(email); }
  catch (_) { throw new HttpsError("not-found", "そのメールアドレスの利用者が見つかりません。"); }
  const roleRef = db.doc(`admins/${target.uid}`);
  if (enabled) {
    await roleRef.set({ grantedAt: new Date(), grantedBy: request.auth.uid });
  } else {
    const admins = await db.collection("admins").get();
    if (admins.size <= 1) throw new HttpsError("failed-precondition", "最後の管理者は解除できません。");
    await roleRef.delete();
  }
  return { ok: true };
});
