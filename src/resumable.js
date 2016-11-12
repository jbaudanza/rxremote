import Rx from 'rxjs';


export function resumableWithOffset(observable) {
  return resumable(
    (offset) => observable.skip(offset),
    (value, offset) => offset + 1,
    0
  );
}

export function resumable(resumeFn, cursorFn, initialCursor) {
  return resumeFromCursor.bind(undefined, resumeFn, cursorFn, initialCursor);
}

export function resumeFromCursor(resumeFn, cursorFn, initialCursor, resumeCursor) {
  const obs = Rx.Observable.create(function(observer) {
    let cursor;
    if (typeof resumeCursor === 'undefined') {
      cursor = initialCursor;
    } else {
      cursor = resumeCursor;
    }

    const observable = resumeFn(cursor);

    function next(value) {
      cursor = cursorFn(value, cursor);
      observer.next({value, cursor});
    }

    observable.subscribe({
      next: next,
      error: observer.error.bind(observer),
      complete: observer.complete.bind(observer)
    });
  });

  return obs;
}
