import Rx from 'rxjs';


export function unwrapBatches(batched) {
  const obs = batched.flatMap((x) => Rx.Observable.from(x));

  batched = batched.filter((l) => l.length > 0);

  // Override the prototype version
  batched.batches = obs.batches = function() { return batched; };

  // Add an version of skip that will keep the batched intact.
  obs.skip = batchSkip;

  obs.map = batchMap;

  return obs;
}

export function rewrapBatches(observable) {
  if (typeof observable.batches === 'function') {
    return observable.batches();
  } else {
    return observable.map(x => [x]);
  }
}

export function batchScan(fn, initial) {
  return rewrapBatches(this).scan((state, batch) => batch.reduce(fn, state), initial);
};

function batchSkip(count) {
  if (count === 0)
    return this;

  const batches = rewrapBatches(this);

  const filteredBatches = Rx.Observable.create(function(observer) {
    let leftToSkip=count;

    const sub = batches
        .map(function(batch) {
          if (leftToSkip === 0) {
            return batch;
          }
          if (batch.length <= leftToSkip) {
            leftToSkip -= batch.length;
            return [];
          } else {
            const result = batch.slice(leftToSkip);
            leftToSkip = 0;
            return result;
          }
        })
        .filter((l) => l.length > 0)
        .subscribe(observer);
    return sub.unsubscribe.bind(sub);
  });

  return unwrapBatches(filteredBatches);
}


export function batchMap(project, thisArg) {
  const outerObservable = this;

  const mappedBatches = Rx.Observable.create(function(observer) {
    let baseIndex = 0;

    const sub = outerObservable.batches().map(function(batch) {
      const result = batch.map(function(currentValue, index) {
        return project.call(thisArg, currentValue, baseIndex + index, outerObservable);
      });

      baseIndex += batch.length;

      return result;
    }).subscribe(observer);

    return function() { sub.unsubscribe(); }
  });

  return unwrapBatches(mappedBatches);
}
