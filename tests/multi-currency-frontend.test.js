// tests/multi-currency-frontend.test.js — Frontend multi-currency pattern tests
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Multi-Currency Frontend Patterns', () => {
  const txnView = fs.readFileSync(path.join(__dirname, '../public/js/views/transactions.js'), 'utf8');
  const utils = fs.readFileSync(path.join(__dirname, '../public/js/utils.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');

  describe('Transaction form — currency support', () => {
    it('has currency select field in form', () => {
      assert.ok(txnView.includes("name: 'currency'"), 'form should have currency input');
    });

    it('has exchange_rate field in form', () => {
      assert.ok(txnView.includes("name: 'exchange_rate'"), 'form should have exchange_rate input');
    });

    it('currency field is conditionally shown (multi-currency only)', () => {
      assert.ok(txnView.includes('currency-field'), 'currency field should have conditional class');
      assert.ok(txnView.includes('hasMulCurr'), 'should check if user has multiple currencies');
    });

    it('exchange rate field is conditionally shown (cross-currency only)', () => {
      assert.ok(txnView.includes('exchange-rate-field'), 'exchange rate field should have conditional class');
      assert.ok(txnView.includes('isCrossCurrency'), 'should detect cross-currency transactions');
    });

    it('account selector shows currency code', () => {
      assert.ok(txnView.includes('a.currency'), 'account options should include currency');
    });

    it('handleSubmit sends currency and exchange_rate', () => {
      assert.ok(txnView.includes('body.currency'), 'submit should include currency');
      assert.ok(txnView.includes('body.exchange_rate'), 'submit should include exchange_rate');
    });
  });

  describe('Transaction list — currency display', () => {
    it('formats amounts with transaction currency', () => {
      assert.ok(txnView.includes('fmt(t.amount, t.currency)'), 'should format with transaction currency');
    });

    it('shows original amount for converted transactions', () => {
      assert.ok(txnView.includes('original_amount'), 'should reference original_amount');
      assert.ok(txnView.includes('original_currency'), 'should reference original_currency');
      assert.ok(txnView.includes('exchange_rate_used'), 'should reference exchange_rate_used');
    });

    it('has CSS style for original amount display', () => {
      assert.ok(styles.includes('txn-original-amount'), 'should have txn-original-amount style');
    });
  });

  describe('Filter bar — currency filter', () => {
    it('has currency filter in filter bar', () => {
      assert.ok(txnView.includes('All Currencies'), 'filter bar should have currency filter');
    });

    it('currency filter updates state', () => {
      assert.ok(txnView.includes('filters.currency'), 'should set currency filter state');
    });
  });

  describe('Currency formatting — per-currency locale', () => {
    it('fmt uses currency-specific locale mapping', () => {
      assert.ok(utils.includes('CURRENCY_LOCALE'), 'should have currency locale mapping');
    });

    it('maps JPY to ja-JP locale', () => {
      assert.ok(utils.includes("JPY: 'ja-JP'"), 'JPY should map to ja-JP');
    });

    it('maps USD to en-US locale', () => {
      assert.ok(utils.includes("USD: 'en-US'"), 'USD should map to en-US');
    });

    it('maps INR to en-IN locale', () => {
      assert.ok(utils.includes("INR: 'en-IN'"), 'INR should map to en-IN');
    });

    it('maps EUR to de-DE locale', () => {
      assert.ok(utils.includes("EUR: 'de-DE'"), 'EUR should map to de-DE');
    });

    it('falls back to en-US for unmapped currencies', () => {
      assert.ok(utils.includes("|| 'en-US'"), 'should fall back to en-US');
    });
  });
});
