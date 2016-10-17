import Rx from 'rxjs';

Rx.Observable.createFromBatches = function(batched) {
  const obs = batched.flatMap((x) => Rx.Observable.from(x));

  batched = batched.filter((l) => l.length > 0);

  // Override the prototype version
  batched.batches = obs.batches = function() { return batched; };

  return obs;
}

Rx.Observable.prototype.batches = function() {
  return this.map(x => [x]);
};

Rx.Observable.prototype.batchScan = function(fn, initial) {
  return this.batches().scan((state, batch) => batch.reduce(fn, state), initial);
};

Rx.Observable.prototype.batchSkip = function(count) {
  if (count === 0)
    return this;

  const batches = this.batches();
  return Rx.Observable.create(function(observer) {
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
}
