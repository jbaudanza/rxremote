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
          assert.deepEqual(result, [1,2,3,4,5,6]);
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
          assert.deepEqual(result, [[1,2,3], [4,5,6]]);
        });
  });
});

describe("batches.skip", () => {
  it('should skip individual elements but keep the batches intact', () => {
    const batched = Rx.Observable.of([1,2,3], [4,5,6])
    const unbatched = batches.unwrapBatches(batched);

    return unbatched
        .skip(2)
        .batches()
        .reduce(reduceToList, [])
        .forEach(function(result) {
          assert.deepEqual(result, [[3], [4,5,6]]);
        });
  });
});

describe('batches.map', () => {
  it('should map the elements in a batch but keep the batches intact', () => {
    const batched = Rx.Observable.of([1,2,3], [4,5,6])
    const unbatched = batches.unwrapBatches(batched);

    return unbatched
        .map(x => x + 1)
        .batches()
        .reduce(reduceToList, [])
        .forEach(function(result) {
          assert.deepEqual(result, [[2,3,4], [5,6,7]]);
        });
  });

  it('should pass the correct args to the project function', () => {
    const batched = Rx.Observable.of([1,2,3], [4,5,6])
    const unbatched = batches.unwrapBatches(batched);

    const context = {hello: 'world'};

    let nextExpectedIndex = 0;
    let nextExpectedValue = 1;

    function project(value, index, observable) {
      assert.equal(this.hello, 'world');
      assert.equal(nextExpectedIndex++, index);
      assert.equal(nextExpectedValue++, value);
      assert.equal(observable, unbatched);
    }

    return unbatched.map(project, context).toPromise();
  });
});