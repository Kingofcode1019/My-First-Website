import assert from 'node:assert/strict';
import test from 'node:test';
import { globalFeatureConfig } from '../../backend/features';

test('account balance adjustment remains in the system but disabled globally by default', () => {
  assert.equal(globalFeatureConfig.balanceAdjustment.enabled, false);
  assert.equal(globalFeatureConfig.balanceAdjustment.label, 'Account Balance Adjustment');
  assert.ok(globalFeatureConfig.balanceAdjustment.description.length > 0);
});
