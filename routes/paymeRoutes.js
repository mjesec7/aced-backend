// routes/paymeRoutes.js

const express = require('express');
const basicAuth = require('express-basic-auth');
const router = express.Router();
const mongoose = require('mongoose');
const Transaction = require('../models/transaction');
const User = require('../models/user');
const { applyPromoCode, initiatePaymePayment } = require('../controllers/paymentController');
const verifyToken = require('../middlewares/authMiddleware');

// Load environment variables via process.env
const {
  PAYME_MERCHANT_ID,
  PAYME_MERCHANT_KEY
} = process.env;

// ✅ Apply promo code and unlock access
router.post('/promo', verifyToken, applyPromoCode);

// ✅ Initiate payment through Payme
router.post('/payme', verifyToken, initiatePaymePayment);

// --------------
// 🔐 Basic Auth for Payme RPC endpoints only
// --------------
// Payme requires HTTP Basic Auth for every RPC call. 
// Username = your merchant ID, password = your merchant key.
// We apply this only to the /sandbox route
const paymeAuth = basicAuth({
  users: { [PAYME_MERCHANT_ID]: PAYME_MERCHANT_KEY || '' },
  challenge: true
});

// --------------
// Constants & Helpers
// --------------
const VALID_AMOUNTS = [260000, 455000]; // tiyin – only these amounts allowed in sandbox
// (You can adjust to your sandbox test amounts.)

function buildError(id, code, ru, en, uz, dataField = null) {
  // Return a JSON-RPC error object
  const error = {
    jsonrpc: '2.0',
    id: id,
    error: {
      code,
      message: {
        ru,
        en,
        uz
      }
    }
  };
  if (dataField) {
    error.error.data = dataField;
  }
  return error;
}

function buildResult(id, resultObj) {
  return {
    jsonrpc: '2.0',
    id,
    result: resultObj
  };
}

// --------------
// RPC Endpoint
// --------------
// The client will POST JSON-RPC bodies to /api/payments/sandbox
router.post('/sandbox', paymeAuth, async (req, res) => {
  const { jsonrpc, id, method, params } = req.body;
  // Ensure JSON-RPC version and ID present
  if (!id || jsonrpc !== '2.0') {
    return res.status(400).json(
      buildError(id || null, -32600, 'Недействительный запрос', 'Invalid Request', 'Notogri sorov')
    );
  }

  try {
    const login = params.account?.login;
    const amount = Number(params.amount);
    const paymeId = String(params.id); // Unique ID for each RPC

    // -----------------------------
    // 1) CheckPerformTransaction
    // -----------------------------
    if (method === 'CheckPerformTransaction') {
      // 1.a) Validate login exists
      if (!login) {
        return res.json(
          buildError(id, -31050, 'Счет не найден', 'Account not found', 'Hisob topilmadi', 'account')
        );
      }

      // 1.b) Fetch user by login
      const user = await User.findOne({ login: login.trim() });
      if (!user) {
        return res.json(
          buildError(id, -31050, 'Счет не найден', 'Account not found', 'Hisob topilmadi', 'account')
        );
      }

      // 1.c) Check amount validity
      if (!VALID_AMOUNTS.includes(amount)) {
        return res.json(
          buildError(id, -31001, 'Неверная сумма', 'Invalid amount', 'Notogri summa', 'amount')
        );
      }

      // 1.d) Check if user is blocked (you can store a `blocked` flag on user if needed)
      if (user.isBlocked) {
        return res.json(
          buildError(id, -31052, 'Счет заблокирован', 'Account is blocked', 'Hisob bloklangan', 'account')
        );
      }

      // 1.e) Check for an existing "processing" transaction for this user
      const existingProcessing = await Transaction.findOne({
        accountLogin: login,
        state: 1 // 1 = created, not yet performed or canceled
      });
      if (existingProcessing) {
        return res.json(
          buildError(id, -31051, 'Платеж в обработке', 'Payment is processing', 'Tolov qayta ishlanmoqda', 'account')
        );
      }

      // 1.f) All checks passed – allow creation
      return res.json(buildResult(id, { allow: true }));
    }

    // -----------------------------
    // 2) CreateTransaction
    // -----------------------------
    if (method === 'CreateTransaction') {
      // 2.a) Validate login and amount
      if (!login) {
        return res.json(
          buildError(id, -31050, 'Счет не найден', 'Account not found', 'Hisob topilmadi', 'account')
        );
      }
      const user = await User.findOne({ login: login.trim() });
      if (!user) {
        return res.json(
          buildError(id, -31050, 'Счет не найден', 'Account not found', 'Hisob topilmadi', 'account')
        );
      }
      if (!VALID_AMOUNTS.includes(amount)) {
        return res.json(
          buildError(id, -31001, 'Неверная сумма', 'Invalid amount', 'Notogri summa', 'amount')
        );
      }
      if (user.isBlocked) {
        return res.json(
          buildError(id, -31008, 'Невозможно выполнить операцию', 'Cannot perform operation', 'Amalni bajarib bolmaydi')
        );
      }

      // 2.b) Check if transaction already exists (idempotent)
      let existingTx = await Transaction.findOne({ paymeId });
      if (existingTx) {
        // Return stored result
        return res.json(
          buildResult(id, {
            create_time: existingTx.createTime.getTime(),
            transaction: existingTx.transaction,
            state: existingTx.state
          })
        );
      }

      // 2.c) Create new Transaction
      const newTxnNumber = (Math.floor(Math.random() * 900000) + 100000).toString(); 
      // (Alternatively, use a counter or mongoose-generated _id.)

      const now = new Date();
      const tx = new Transaction({
        paymeId,
        transaction: newTxnNumber,
        accountLogin: login,
        amount,
        state: 1, // 1 = created
        createTime: now,
        performTime: null,
        cancelTime: null,
        reason: null
      });
      await tx.save();

      // 2.d) Optionally mark user as "processing" in your User model
      // user.isProcessing = true;
      // await user.save();

      return res.json(
        buildResult(id, {
          create_time: now.getTime(),
          transaction: newTxnNumber,
          state: 1
        })
      );
    }

    // -----------------------------
    // 3) PerformTransaction
    // -----------------------------
    if (method === 'PerformTransaction') {
      const tx = await Transaction.findOne({ paymeId });
      if (!tx) {
        return res.json(
          buildError(id, -31003, 'Транзакция не найдена', 'Transaction not found', 'Tranzaksiya topilmadi')
        );
      }

      // Only perform if state = 1
      if (tx.state === 1) {
        tx.state = 2; // performed
        tx.performTime = new Date();
        await tx.save();

        // Update user payment status (e.g. mark subscription as paid)
        const user = await User.findOne({ login: tx.accountLogin });
        if (user) {
          user.paymentStatus = 'paid';
          user.subscriptionPlan = user.subscriptionPlan || 'sandbox-plan';
          await user.save();
        }
      }

      return res.json(
        buildResult(id, {
          transaction: tx.transaction,
          perform_time: tx.performTime.getTime(),
          state: tx.state
        })
      );
    }

    // -----------------------------
    // 4) CancelTransaction
    // -----------------------------
    if (method === 'CancelTransaction') {
      const tx = await Transaction.findOne({ paymeId });
      if (!tx) {
        return res.json(
          buildError(id, -31003, 'Транзакция не найдена', 'Transaction not found', 'Tranzaksiya topilmadi')
        );
      }

      // Only cancel if state = 1
      if (tx.state === 1) {
        tx.state = -1; // canceled
        tx.cancelTime = new Date();
        tx.reason = Number(params.reason) || 10; // default reason code 10 (timeout)
        await tx.save();

        // Optionally mark user as blocked or revert access
        const user = await User.findOne({ login: tx.accountLogin });
        if (user) {
          user.paymentStatus = 'canceled';
          user.isBlocked = true;
          await user.save();
        }
      }

      return res.json(
        buildResult(id, {
          transaction: tx.transaction,
          cancel_time: tx.cancelTime.getTime(),
          state: tx.state
        })
      );
    }

    // -----------------------------
    // 5) CheckTransaction
    // -----------------------------
    if (method === 'CheckTransaction') {
      const tx = await Transaction.findOne({ paymeId });
      if (!tx) {
        return res.json(
          buildError(id, -31003, 'Транзакция не найдена', 'Transaction not found', 'Tranzaksiya topilmadi')
        );
      }
      return res.json(
        buildResult(id, {
          create_time: tx.createTime.getTime(),
          perform_time: tx.performTime ? tx.performTime.getTime() : 0,
          cancel_time: tx.cancelTime ? tx.cancelTime.getTime() : 0,
          transaction: tx.transaction,
          state: tx.state,
          reason: tx.reason
        })
      );
    }

    // -----------------------------
    // 6) GetStatement
    // -----------------------------
    if (method === 'GetStatement') {
      // params.from and params.to are timestamps (ms since epoch)
      const from = Number(params.from);
      const to = Number(params.to);

      // Query all transactions in range
      const txList = await Transaction.find({
        createTime: { $gte: new Date(from) },
        createTime: { $lte: new Date(to) }
      });

      const statement = txList.map((tx) => ({
        id: tx.paymeId,
        transaction: tx.transaction,
        time: tx.createTime.getTime(),
        amount: tx.amount,
        account: { login: tx.accountLogin },
        create_time: tx.createTime.getTime(),
        perform_time: tx.performTime ? tx.performTime.getTime() : 0,
        cancel_time: tx.cancelTime ? tx.cancelTime.getTime() : 0,
        state: tx.state,
        reason: tx.reason
      }));

      return res.json(
        buildResult(id, { transactions: statement })
      );
    }

    // -----------------------------
    // 7) SetFiscalData
    // -----------------------------
    if (method === 'SetFiscalData') {
      // Payme sends fiscal_data after either a successful perform or cancel
      const fiscalData = params.fiscal_data || {};
      const tx = await Transaction.findOne({ paymeId });
      if (!tx) {
        return res.json(
          buildError(id, -32001, 'Чек с таким id не найден', 'Receipt not found', 'Cheque topilmadi')
        );
      }

      // Determine whether this SetFiscalData is for a PERFORM or CANCEL
      if (params.type === 'PERFORM') {
        tx.fiscalPerform = fiscalData;
      } else if (params.type === 'CANCEL') {
        tx.fiscalCancel = fiscalData;
      }
      await tx.save();

      // Respond by echoing back the fiscal data (Payme expects you to confirm both)
      const responseFiscal = {
        fiscal: {
          perform_data: tx.fiscalPerform || {},
          cancel_data: tx.fiscalCancel || {}
        }
      };
      return res.json(buildResult(id, responseFiscal));
    }

    // If we reach here, method is not recognized
    return res.json(
      buildError(id, -32601, 'Метод не найден', 'Method not found', 'Metod topilmadi', method)
    );
  } catch (e) {
    console.error('❌ Payme sandbox error:', e);
    return res.status(500).json(
      buildError(id, -32400, 'Внутренняя ошибка', 'Internal error', 'Ichki xatolik')
    );
  }
});

module.exports = router;