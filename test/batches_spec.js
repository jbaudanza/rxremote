import assert from 'assert';

import Rx from 'rxjs';
import * as batches from '../batches';


function reduceToList(list, i) {
  return list.concat([i]);
}

describe("batches.unwrapBatches", () => {
  it('should unwrap to its individual elements', () => {
    const batched = Rx.Observable.of([1,2,3], [4,5,6])
    const unbatched = batches.unwrapBatches(batched);

    return unbatched
        .reduce(reduceToList, [])
        .forEach(function(result) {
          assert.deepEqual([1,2,3,4,5,6], result);
        });
  });

  it('should retain the original batched observable', () => {
    const batched = Rx.Observable.of([1,2,3], [4,5,6])
    const unbatched = batches.unwrapBatches(batched);

    return unbatched
        .batches() // <-- 3 of these to test chaining
        .batches()
        .batches()
        .reduce(reduceToList, [])
        .forEach(function(result) {
          assert.deepEqual([[1,2,3], [4,5,6]], result);
        });
  });
});

describe("batches.skip", () => {
  it('should skip individual elements but keep the batches intact', () => {
    const batched = Rx.Observable.of([1,2,3], [4,5,6])
    const unbatched = batches.unwrapBatches(batched);

    unbatched
        .skip(2)
        .batches()
        .reduce(reduceToList, [])
        .forEach(function(result) {
            assert.deepEqual([[3], [4,5,6]], result);
          });
  });
});