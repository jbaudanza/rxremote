'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.unwrapBatches = unwrapBatches;
exports.rewrapBatches = rewrapBatches;
exports.batchScan = batchScan;

var _rxjs = require('rxjs');

var _rxjs2 = _interopRequireDefault(_rxjs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function unwrapBatches(batched) {
  var obs = batched.flatMap(function (x) {
    return _rxjs2.default.Observable.from(x);
  });

  batched = batched.filter(function (l) {
    return l.length > 0;
  });

  // Override the prototype version
  batched.batches = obs.batches = function () {
    return batched;
  };

  // Add an version of skip that will keep the batched intact.
  obs.skip = batchSkip;

  return obs;
}

function rewrapBatches(observable) {
  if (typeof observable.batches === 'function') {
    return observable.batches();
  } else {
    return observable.map(function (x) {
      return [x];
    });
  }
}

function batchScan(fn, initial) {
  return rewrapBatches(this).scan(function (state, batch) {
    return batch.reduce(fn, state);
  }, initial);
};

function batchSkip(count) {
  if (count === 0) return this;

  var batches = rewrapBatches(this);

  var filteredBatches = _rxjs2.default.Observable.create(function (observer) {
    var leftToSkip = count;

    var sub = batches.map(function (batch) {
      if (leftToSkip === 0) {
        return batch;
      }
      if (batch.length <= leftToSkip) {
        leftToSkip -= batch.length;
        return [];
      } else {
        var result = batch.slice(leftToSkip);
        leftToSkip = 0;
        return result;
      }
    }).filter(function (l) {
      return l.length > 0;
    }).subscribe(observer);
    return sub.unsubscribe.bind(sub);
  });

  return unwrapBatches(filteredBatches);
}