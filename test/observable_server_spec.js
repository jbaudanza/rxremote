import assert from 'assert';
import http from 'http';

import Rx from 'rxjs';

import {Server, Client} from '../';


function createHttpServer() {
  const httpServer = http.createServer();
  return new Promise(function(resolve, reject) {
    httpServer.listen({host: '0.0.0.0', port: 0}, () => resolve(httpServer));
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createClientServerPair() {
  return createHttpServer().then(function(httpServer) {
    const observablesServer = new Server(httpServer);
    const addr = httpServer.address();
    const endpoint = `ws://${addr.address}:${addr.port}`;
    const observablesClient = new Client(endpoint);
    //observablesServer.log.subscribe(x => console.log(x))

    return [observablesServer, observablesClient];
  });
}


describe('ObservableServer', () => {
  it('should serve a normal observable', () => {
    return createClientServerPair().then(function([server, client]) {
      server.add('test-observable', Rx.Observable.from([1,2,3,4]));

      return client.observable('test-observable')
          .reduce((l, i) => l.concat(i), [])
          .forEach(function(l) {
            assert.deepEqual(l, [1,2,3,4]);
          });
    });
  });

  it('should propogate errors to the client', () => {
    return createClientServerPair().then(function([server, client]) {
      server.add('test-observable', Rx.Observable.throw('Test error'));

      return client.observable('test-observable')
        .toPromise()
        .then(
          function(result) { throw new Error('Promise was unexpectedly fulfilled. Result: ' + result) },
          function(err) { assert.equal(err, "Test error"); }
        )
    });
  });

  it('should emit a disconnect error for non-resumable observables', () => {
    return createClientServerPair().then(function([server, client]) {
      const subject = new Rx.ReplaySubject(4);
      subject.next(1);
      subject.next(2);
      subject.next(3);

      server.add('test-observable', subject);

      const observable = client.observable('test-observable')

      const results = [];
      observable.subscribe(x => results.push(x), err => errors.push(err));

      const errors = [];

      return observable
        .take(3)
        .toPromise()
        .then(function() {
          assert.deepEqual(results, [1,2,3]);
          assert.deepEqual(errors, []);

          // Cause a disconnection
          assert.equal(server.wss.clients.length, 1);
          server.wss.clients[0].close();

          // Wait enough time that we can be sure the reconnect didn't cause
          // any undesired side effects.
          return wait(1500);
        }).then(function() {
          assert.deepEqual(results, [1,2,3]);

          // Errors should be one close event
          assert.equal(errors.length,  1);
          assert.equal(errors[0].type, 'close');
        })
    });
  });

  // TODO: This takes a second because of the reconnect timer. We could
  // probably mock this to speed things up
  it('should handle reconnections', () => {
    return createClientServerPair().then(function([server, client]) {
      const subject = new Rx.ReplaySubject(64);
      subject.next(1);
      subject.next(2);
      subject.next(3);

      server.add('test-observable', resumableWithOffset(subject));

      const observable = client.observable('test-observable')

      const results = [];
      observable.subscribe(x => results.push(x));

      return observable
        .take(3)
        .toPromise()
        .then(function() {
          assert.deepEqual(results, [1,2,3]);

          // Cause a disconnection
          assert.equal(server.wss.clients.length, 1);
          server.wss.clients[0].close();

          subject.next(4);
          subject.next(5);
          subject.next(6);

          return observable.take(3).toPromise();
        }).then(function() {
          assert.deepEqual(results, [1,2,3,4,5,6]);
        });

    });
  });
});

// TODO: These need to go somewhere
function resumableWithOffset(observable) {
  return resumable(
    (offset) => observable.skip(offset),
    (value, offset) => offset + 1,
    0
  );
}

function resumable(resumeFn, cursorFn, initialCursor) {
  return resumeFromCursor.bind(undefined, resumeFn, cursorFn, initialCursor);
}

function resumeFromCursor(resumeFn, cursorFn, initialCursor, resumeCursor) {
  return Rx.Observable.create(function(observer) {
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
}
