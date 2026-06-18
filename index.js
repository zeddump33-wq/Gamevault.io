/**
 * GameVault Cloud Functions
 * Production-ready payment automation, code generation, and email system
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PLANS = {
  '2 Days':    { name: '2 Day Pass',   price: 55,  durationDays: 2,   features: ['Access to all games', '1 device', 'Fast activation'] },
  '3 Days':    { name: '3 Day Pass',   price: 65,  durationDays: 3,   features: ['Access to all games', '3 devices', 'Fast activation'] },
  'Lifetime':  { name: 'Lifetime',     price: 99, durationDays: null, features: ['Lifetime access', 'Any device', 'Unlimited downloads', 'VIP support'] },
};

const ADMIN_EMAILS = ["admin@gamevault.app"]; // Add your admin emails here

// ─── EMAIL TRANSPORTER ────────────────────────────────────────────────────────
function createTransporter() {
  // Uses environment config: firebase functions:config:set mail.user="..." mail.pass="..."
  const config = functions.config();
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: config.mail?.user || process.env.MAIL_USER,
      pass: config.mail?.pass || process.env.MAIL_PASS,
    },
  });
}

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────
function generateSecureCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) {
    if (i === 4 || i === 8) code += "-";
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

function generateTransactionId() {
  return "TXN-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

async function logAdminAction(action, details, adminEmail = "system") {
  await db.collection("admin_logs").add({
    action,
    details,
    performed_by: adminEmail,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    ip: details.ip || null,
  });
}

async function sendActivationEmail(toEmail, code, plan, transactionId) {
  const planInfo = PLANS[plan];
  const transporter = createTransporter();

  const expiryText = planInfo.durationDays
    ? `Valid for ${planInfo.durationDays} days from activation`
    : "Lifetime access — never expires";

  const featureList = planInfo.features.map(f => `<li style="margin:6px 0;">✅ ${f}</li>`).join("");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0d14;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#13172a;border-radius:16px;overflow:hidden;border:1px solid #2a2f4a;">
    <div style="background:linear-gradient(135deg,#6c63ff,#ff6b9d);padding:32px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:28px;letter-spacing:2px;">🎮 GAME VAULT</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Your activation is ready</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#b9c3e0;margin:0 0 24px;">Hi there! Your payment has been confirmed. Here's your activation code:</p>

      <div style="background:#0a0d14;border:2px dashed #6c63ff;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
        <p style="color:#8b8fa8;font-size:12px;margin:0 0 8px;letter-spacing:2px;text-transform:uppercase;">Activation Code</p>
        <p style="color:#fff;font-size:28px;font-weight:900;margin:0;letter-spacing:4px;font-family:monospace;">${code}</p>
      </div>

      <div style="background:#1a1e30;border-radius:10px;padding:20px;margin-bottom:24px;">
        <p style="color:#6c63ff;font-weight:700;margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1px;">
          ${planInfo.name} Plan — ₱${planInfo.price}
        </p>
        <p style="color:#8b8fa8;font-size:13px;margin:0 0 12px;">${expiryText}</p>
        <ul style="color:#b9c3e0;font-size:13px;padding-left:0;list-style:none;margin:0;">${featureList}</ul>
      </div>

      <div style="background:#1a1e30;border-radius:10px;padding:16px;margin-bottom:24px;">
        <p style="color:#8b8fa8;font-size:12px;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px;">How to activate</p>
        <ol style="color:#b9c3e0;font-size:13px;padding-left:18px;margin:0;">
          <li style="margin:4px 0;">Go to gamevault.app/activate</li>
          <li style="margin:4px 0;">Enter your code above</li>
          <li style="margin:4px 0;">Enjoy your ${planInfo.name} access!</li>
        </ol>
      </div>

      <p style="color:#5a6070;font-size:11px;margin:0;border-top:1px solid #2a2f4a;padding-top:16px;">
        Transaction ID: ${transactionId} · Keep this email for your records. 
        Do not share your code with others.
      </p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"GameVault" <${functions.config().mail?.user || process.env.MAIL_USER}>`,
    to: toEmail,
    subject: `🎮 GameVault — Your ${planInfo.name} Activation Code`,
    html,
  });
}

// ─── CALLABLE: INITIATE PAYMENT ───────────────────────────────────────────────
// Called from frontend when user selects a plan and provides email
exports.initiatePayment = functions.https.onCall(async (data, context) => {
  const { email, plan } = data;

  if (!email || !plan || !PLANS[plan]) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid email or plan.");
  }

  // Fraud check: max 3 pending payments per email per hour
  const oneHourAgo = new Date(Date.now() - 3600000);
  const recentSnap = await db.collection("payments")
    .where("email", "==", email)
    .where("status", "==", "pending")
    .where("created_at", ">", oneHourAgo)
    .get();

  if (recentSnap.size >= 3) {
    throw new functions.https.HttpsError("resource-exhausted", "Too many pending payments. Please wait or contact support.");
  }

  const transactionId = generateTransactionId();
  const planInfo = PLANS[plan];

  const paymentRef = db.collection("payments").doc(transactionId);
  await paymentRef.set({
    transaction_id: transactionId,
    email: email.toLowerCase().trim(),
    plan,
    amount: planInfo.price,
    status: "pending",
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    expires_at: new Date(Date.now() + 30 * 60000), // 30-min window to pay
    code_generated: false,
    ip: context.rawRequest?.ip || null,
    verification_attempts: 0,
  });

  await logAdminAction("payment_initiated", {
    transaction_id: transactionId,
    email,
    plan,
    amount: planInfo.price,
  });

  // Return minimal info to frontend — no sensitive data
  return {
    transactionId,
    plan: planInfo.name,
    amount: planInfo.price,
    gcashNumber: functions.config().gcash?.number || "09XX-XXX-XXXX", // Set via: firebase functions:config:set gcash.number="09..."
    gcashName: functions.config().gcash?.name || "GameVault",
    expiresInMinutes: 30,
  };
});

// ─── CALLABLE: VERIFY PAYMENT (Admin-triggered or webhook) ───────────────────
// This is called ONLY by your webhook receiver or by an admin — NEVER by the paying user
exports.verifyAndFulfillPayment = functions.https.onCall(async (data, context) => {
  // Must be called with admin auth token
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated.");
  }

  // Check admin claim
  const callerToken = context.auth.token;
  if (!callerToken.admin) {
    throw new functions.https.HttpsError("permission-denied", "Admin access required.");
  }

  const { transactionId, referenceNumber, confirmedAmount } = data;

  if (!transactionId) {
    throw new functions.https.HttpsError("invalid-argument", "Transaction ID required.");
  }

  return await db.runTransaction(async (t) => {
    const payRef = db.collection("payments").doc(transactionId);
    const paySnap = await t.get(payRef);

    if (!paySnap.exists) {
      throw new functions.https.HttpsError("not-found", "Transaction not found.");
    }

    const payment = paySnap.data();

    if (payment.status === "paid") {
      return { success: true, message: "Already processed.", code: payment.activation_code };
    }
    if (payment.status === "cancelled") {
      throw new functions.https.HttpsError("failed-precondition", "Transaction was cancelled.");
    }

    // Verify amount matches
    if (confirmedAmount && confirmedAmount !== payment.amount) {
      await t.update(payRef, {
        status: "amount_mismatch",
        flagged: true,
        reference_number: referenceNumber,
        verified_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      throw new functions.https.HttpsError("failed-precondition", `Amount mismatch: expected ₱${payment.amount}, got ₱${confirmedAmount}`);
    }

    // Generate unique activation code (ensure uniqueness)
    let code;
    let attempts = 0;
    do {
      code = generateSecureCode();
      const existing = await db.collection("codes").doc(code).get();
      if (!existing.exists) break;
      attempts++;
    } while (attempts < 5);

    if (attempts >= 5) {
      throw new functions.https.HttpsError("internal", "Failed to generate unique code.");
    }

    const planInfo = PLANS[payment.plan];
    const expiresAt = planInfo.durationDays
      ? new Date(Date.now() + planInfo.durationDays * 86400000)
      : null;

    // Create the activation code
    const codeRef = db.collection("codes").doc(code);
    t.set(codeRef, {
      status: "unused",
      plan: payment.plan,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      created_by: "payment_automation",
      transaction_id: transactionId,
      email: payment.email,
      used_by_session: null,
      used_at: null,
      expires_at: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
    });

    // Update payment record
    t.update(payRef, {
      status: "paid",
      activation_code: code,
      reference_number: referenceNumber || null,
      confirmed_amount: confirmedAmount || payment.amount,
      code_generated: true,
      verified_at: admin.firestore.FieldValue.serverTimestamp(),
      verified_by: context.auth.uid,
    });

    // Log it
    await logAdminAction("payment_verified", {
      transaction_id: transactionId,
      email: payment.email,
      plan: payment.plan,
      amount: payment.amount,
      code,
      reference_number: referenceNumber,
    }, callerToken.email || context.auth.uid);

    // Update revenue stats
    const statsRef = db.collection("admin_stats").doc("revenue");
    t.set(statsRef, {
      [`revenue_${payment.plan}`]: admin.firestore.FieldValue.increment(payment.amount),
      total_revenue: admin.firestore.FieldValue.increment(payment.amount),
      total_paid: admin.firestore.FieldValue.increment(1),
      last_updated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { success: true, code, email: payment.email };
  }).then(async (result) => {
    // Send email outside transaction
    if (result.success && result.code) {
      try {
        const paySnap = await db.collection("payments").doc(transactionId).get();
        await sendActivationEmail(result.email, result.code, paySnap.data().plan, transactionId);
        await db.collection("payments").doc(transactionId).update({ email_sent: true, email_sent_at: admin.firestore.FieldValue.serverTimestamp() });
      } catch (emailErr) {
        console.error("Email send failed:", emailErr);
        // Don't fail the whole operation — log it
        await db.collection("admin_logs").add({
          action: "email_failed",
          details: { transaction_id: transactionId, error: emailErr.message },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
    return result;
  });
});

// ─── CALLABLE: ADMIN CODE MANAGEMENT ─────────────────────────────────────────
exports.adminGenerateCode = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError("permission-denied", "Admin access required.");
  }

  const { plan = "basic", expiryDays = null, count = 1 } = data;
  const safeCount = Math.min(50, Math.max(1, count));
  const codes = [];

  for (let i = 0; i < safeCount; i++) {
    let code;
    let attempts = 0;
    do {
      code = generateSecureCode();
      const existing = await db.collection("codes").doc(code).get();
      if (!existing.exists) break;
      attempts++;
    } while (attempts < 5);

    const expiresAt = expiryDays ? new Date(Date.now() + expiryDays * 86400000) : null;

    await db.collection("codes").doc(code).set({
      status: "unused",
      plan,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      created_by: context.auth.token.email || context.auth.uid,
      transaction_id: null,
      email: null,
      used_by_session: null,
      used_at: null,
      expires_at: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
    });

    codes.push(code);
  }

  await logAdminAction("codes_generated_manual", {
    count: safeCount, plan, expiryDays, codes,
  }, context.auth.token.email || context.auth.uid);

  return { success: true, codes };
});

exports.adminToggleCode = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError("permission-denied", "Admin access required.");
  }

  const { codeId } = data;
  const codeRef = db.collection("codes").doc(codeId);
  const snap = await codeRef.get();
  if (!snap.exists) throw new functions.https.HttpsError("not-found", "Code not found.");

  const current = snap.data().status;
  const newStatus = current === "disabled" ? "unused" : "disabled";
  await codeRef.update({ status: newStatus, toggled_by: context.auth.token.email, toggled_at: admin.firestore.FieldValue.serverTimestamp() });

  await logAdminAction("code_toggled", { codeId, from: current, to: newStatus }, context.auth.token.email);
  return { success: true, newStatus };
});

exports.adminDeleteCode = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError("permission-denied", "Admin access required.");
  }

  const { codeId } = data;
  await db.collection("codes").doc(codeId).delete();
  await logAdminAction("code_deleted", { codeId }, context.auth.token.email);
  return { success: true };
});

// ─── CALLABLE: SET ADMIN CLAIM ────────────────────────────────────────────────
// Run once during setup using the Firebase console or a secure script
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
  // Only existing admins or during initial setup (check Firestore for bootstrap flag)
  const bootstrapRef = db.collection("admin_stats").doc("bootstrap");
  const bootstrap = await bootstrapRef.get();

  if (!bootstrap.exists || !bootstrap.data().initialized) {
    // First-time setup
    const { uid, secret } = data;
    const configSecret = functions.config().admin?.setup_secret;
    if (!configSecret || secret !== configSecret) {
      throw new functions.https.HttpsError("permission-denied", "Invalid setup secret.");
    }

    await admin.auth().setCustomUserClaims(uid, { admin: true });
    await bootstrapRef.set({ initialized: true, first_admin_uid: uid, setup_at: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true, message: "Admin claim set." };
  }

  // After bootstrap: only existing admins can promote others
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError("permission-denied", "Admin access required.");
  }

  const { uid } = data;
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  await logAdminAction("admin_promoted", { promoted_uid: uid }, context.auth.token.email);
  return { success: true };
});

// ─── CALLABLE: GET DASHBOARD STATS ───────────────────────────────────────────
exports.getDashboardStats = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError("permission-denied", "Admin access required.");
  }

  const [codesSnap, paymentsSnap, statsSnap] = await Promise.all([
    db.collection("codes").get(),
    db.collection("payments").where("status", "==", "paid").orderBy("verified_at", "desc").limit(30).get(),
    db.collection("admin_stats").doc("revenue").get(),
  ]);

  const now = new Date();
  let used = 0, unused = 0, disabled = 0, expired = 0;

  codesSnap.forEach(d => {
    const c = d.data();
    if (c.status === "disabled") { disabled++; return; }
    if (c.expires_at) {
      const exp = c.expires_at.toDate ? c.expires_at.toDate() : new Date(c.expires_at);
      if (now > exp) { expired++; return; }
    }
    if (c.status === "used") used++;
    else unused++;
  });

  const revenueStats = statsSnap.exists ? statsSnap.data() : {};

  // Monthly revenue (last 6 months)
  const monthlyRevenue = {};
  paymentsSnap.forEach(d => {
    const p = d.data();
    if (p.verified_at) {
      const date = p.verified_at.toDate ? p.verified_at.toDate() : new Date(p.verified_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthlyRevenue[key] = (monthlyRevenue[key] || 0) + (p.amount || 0);
    }
  });

  return {
    codes: { total: codesSnap.size, used, unused, disabled, expired },
    revenue: {
      total: revenueStats.total_revenue || 0,
      byPlan: (() => {
        const plans = {};
        Object.keys(PLANS).forEach(k => { plans[k] = revenueStats[`revenue_${k}`] || 0; });
        return plans;
      })(),
      totalPaid: revenueStats.total_paid || 0,
      monthly: monthlyRevenue,
    },
  };
});

// ─── SCHEDULED: AUTO-EXPIRE CLEANUP (Daily) ───────────────────────────────────
exports.cleanupExpiredCodes = functions.pubsub.schedule("every 24 hours").onRun(async () => {
  const now = admin.firestore.Timestamp.now();
  const expiredSnap = await db.collection("codes")
    .where("status", "==", "unused")
    .where("expires_at", "<", now)
    .get();

  const batch = db.batch();
  expiredSnap.forEach(d => {
    batch.update(d.ref, { status: "expired", expired_at: now });
  });

  if (!expiredSnap.empty) {
    await batch.commit();
    await logAdminAction("auto_expired_cleanup", { count: expiredSnap.size });
    console.log(`Expired ${expiredSnap.size} codes.`);
  }
  return null;
});

// ─── HTTP: WEBHOOK RECEIVER (GCash / Payment Gateway) ────────────────────────
// This endpoint receives webhooks from your payment gateway
// Secure it with a signature secret: firebase functions:config:set webhook.secret="..."
exports.paymentWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  // Verify webhook signature
  const webhookSecret = functions.config().webhook?.secret;
  if (webhookSecret) {
    const signature = req.headers["x-webhook-signature"];
    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(JSON.stringify(req.body))
      .digest("hex");
    if (signature !== expected) {
      console.warn("Invalid webhook signature");
      return res.status(401).send("Invalid signature");
    }
  }

  try {
    const { transaction_id, reference_number, amount, status } = req.body;

    if (!transaction_id || status !== "success") {
      return res.status(200).send("OK - ignored");
    }

    const payRef = db.collection("payments").doc(transaction_id);
    const paySnap = await payRef.get();

    if (!paySnap.exists) {
      return res.status(404).send("Transaction not found");
    }

    const payment = paySnap.data();
    if (payment.status === "paid") {
      return res.status(200).send("Already processed");
    }

    // Auto-fulfill via internal logic (same as admin verify, but webhook-triggered)
    const confirmedAmount = parseFloat(amount);
    if (confirmedAmount !== payment.amount) {
      await payRef.update({ status: "amount_mismatch", flagged: true, webhook_data: req.body });
      await logAdminAction("webhook_amount_mismatch", { transaction_id, expected: payment.amount, received: confirmedAmount });
      return res.status(200).send("OK - flagged");
    }

    // Generate code
    let code;
    let attempts = 0;
    do {
      code = generateSecureCode();
      const existing = await db.collection("codes").doc(code).get();
      if (!existing.exists) break;
      attempts++;
    } while (attempts < 5);

    const planInfo = PLANS[payment.plan];
    const expiresAt = planInfo.durationDays ? new Date(Date.now() + planInfo.durationDays * 86400000) : null;

    await db.runTransaction(async (t) => {
      t.set(db.collection("codes").doc(code), {
        status: "unused",
        plan: payment.plan,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        created_by: "webhook_automation",
        transaction_id,
        email: payment.email,
        used_by_session: null,
        used_at: null,
        expires_at: expiresAt ? admin.firestore.Timestamp.fromDate(expiresAt) : null,
      });

      t.update(payRef, {
        status: "paid",
        activation_code: code,
        reference_number: reference_number || null,
        code_generated: true,
        verified_at: admin.firestore.FieldValue.serverTimestamp(),
        verified_by: "webhook",
        webhook_data: req.body,
      });

      t.set(db.collection("admin_stats").doc("revenue"), {
        [`revenue_${payment.plan}`]: admin.firestore.FieldValue.increment(payment.amount),
        total_revenue: admin.firestore.FieldValue.increment(payment.amount),
        total_paid: admin.firestore.FieldValue.increment(1),
        last_updated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    // Send email
    try {
      await sendActivationEmail(payment.email, code, payment.plan, transaction_id);
      await payRef.update({ email_sent: true });
    } catch (e) {
      console.error("Webhook email error:", e);
    }

    await logAdminAction("webhook_payment_fulfilled", { transaction_id, code, email: payment.email });
    return res.status(200).send("OK");

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).send("Internal error");
  }
});

