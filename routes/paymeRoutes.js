// routes/paymeRoutes.js
const express = require('express');
const router = express.Router();

// ✅ Allowed sandbox plan prices
const VALID_AMOUNTS = [260000, 455000]; // tiyin

// ✅ Predefined sandbox accounts for all test cases
const accounts = {
  'waiting_user':     { state: 'waiting', due: null },      // accepts both valid amounts
  'processing_user':  { state: 'processing', due: 260000 }, // should trigger processing error
  'blocked_user':     { state: 'blocked', due: 260000 },    // should trigger blocked error
  'wrongamount_user': { state: 'waiting', due: 999999 },    // will trigger invalid amount error
};

const transactions = new Map();
let transactionCounter = 1000;

// ✅ Helper: build JSON-RPC error
const buildError = (code, ru, en, uz, data) => {
  const err = { code, message: { ru, en, uz } };
  if (data) err.data = data;
  return err;
};

// ✅ Main Payme route for sandbox
router.post('/sandbox', (req, res) => {
  const { id, method, params, jsonrpc } = req.body;
  const rpc = { jsonrpc: jsonrpc || '2.0', id };

  try {
    const login = params.account?.login || params.account?.Login;
    const amount = params.amount;

    if (!login) {
      rpc.error = buildError(-31050, 'Счет не найден', 'Account not found', 'Hisob topilmadi', 'account');
      return res.json(rpc);
    }

    const account = accounts[login];
    if (!account) {
      rpc.error = buildError(-31050, 'Счет не найден', 'Account not found', 'Hisob topilmadi', 'account');
      return res.json(rpc);
    }

    switch (method) {
      case 'CheckPerformTransaction': {
        if (!VALID_AMOUNTS.includes(amount)) {
          rpc.error = buildError(-31001, 'Неверная сумма', 'Invalid amount', 'Noto‘g‘ri summa', 'amount');
        } else if (account.state === 'blocked') {
          rpc.error = buildError(-31052, 'Счет заблокирован', 'Account is blocked', 'Hisob bloklangan', 'account');
        } else if (account.state === 'processing') {
          rpc.error = buildError(-31051, 'Платеж в обработке', 'Payment is processing', 'To‘lov qayta ishlanmoqda', 'account');
        } else if (account.due && amount !== account.due) {
          rpc.error = buildError(-31001, 'Неверная сумма', 'Invalid amount', 'Noto‘g‘ri summa', 'amount');
        } else {
          rpc.result = { allow: true };
        }
        break;
      }

      case 'CreateTransaction': {
        const paycomId = params.id;
        const tx = transactions.get(paycomId);

        if (!VALID_AMOUNTS.includes(amount)) {
          rpc.error = buildError(-31001, 'Неверная сумма', 'Invalid amount', 'Noto‘g‘ri summa', 'amount');
        } else if (account.state === 'blocked' || account.state === 'processing') {
          rpc.error = buildError(-31008, 'Невозможно выполнить операцию', 'Cannot perform operation', 'Amalni bajarib bo‘lmaydi');
        } else if (account.due && amount !== account.due) {
          rpc.error = buildError(-31001, 'Неверная сумма', 'Invalid amount', 'Noto‘g‘ri summa', 'amount');
        } else if (tx) {
          rpc.result = {
            create_time: tx.create_time,
            transaction: tx.transaction,
            state: tx.state
          };
        } else {
          const newTx = {
            paycom_time: params.time,
            create_time: Date.now(),
            perform_time: 0,
            cancel_time: 0,
            transaction: (++transactionCounter).toString(),
            state: 1,
            reason: null,
            account: login,
            amount: amount
          };
          transactions.set(paycomId, newTx);
          account.state = 'processing';
          rpc.result = {
            create_time: newTx.create_time,
            transaction: newTx.transaction,
            state: newTx.state
          };
        }
        break;
      }

      case 'PerformTransaction': {
        const tx = transactions.get(params.id);
        if (!tx) {
          rpc.error = buildError(-31003, 'Транзакция не найдена', 'Transaction not found', 'Tranzaksiya topilmadi');
        } else {
          if (tx.state === 1) {
            tx.state = 2;
            tx.perform_time = Date.now();
            accounts[tx.account].state = 'blocked';
          }
          rpc.result = {
            transaction: tx.transaction,
            perform_time: tx.perform_time,
            state: tx.state
          };
        }
        break;
      }

      case 'CancelTransaction': {
        const tx = transactions.get(params.id);
        if (!tx) {
          rpc.error = buildError(-31003, 'Транзакция не найдена', 'Transaction not found', 'Tranzaksiya topilmadi');
        } else {
          if (tx.state === 1) {
            tx.state = -1;
            tx.cancel_time = Date.now();
            tx.reason = params.reason || 10;
            accounts[tx.account].state = 'blocked';
          }
          rpc.result = {
            transaction: tx.transaction,
            cancel_time: tx.cancel_time,
            state: tx.state
          };
        }
        break;
      }

      case 'CheckTransaction': {
        const tx = transactions.get(params.id);
        if (!tx) {
          rpc.error = buildError(-31003, 'Транзакция не найдена', 'Transaction not found', 'Tranzaksiya topilmadi');
        } else {
          rpc.result = {
            create_time: tx.create_time,
            perform_time: tx.perform_time,
            cancel_time: tx.cancel_time,
            transaction: tx.transaction,
            state: tx.state,
            reason: tx.reason
          };
        }
        break;
      }

      case 'GetStatement': {
        const from = Number(params.from);
        const to = Number(params.to);
        const list = [];
        transactions.forEach((tx, id) => {
          if (tx.paycom_time >= from && tx.paycom_time <= to) {
            list.push({
              id,
              transaction: tx.transaction,
              time: tx.paycom_time,
              amount: tx.amount,
              account: { login: tx.account },
              create_time: tx.create_time,
              perform_time: tx.perform_time,
              cancel_time: tx.cancel_time,
              state: tx.state,
              reason: tx.reason
            });
          }
        });
        rpc.result = { transactions: list };
        break;
      }

      default:
        rpc.error = buildError(-32601, 'Метод не найден', 'Method not found', 'Metod topilmadi', method);
    }
  } catch (e) {
    console.error('❌ Payme sandbox error:', e);
    rpc.error = buildError(-32400, 'Внутренняя ошибка', 'Internal error', 'Ichki xatolik');
  }

  res.json(rpc);
});

module.exports = router;