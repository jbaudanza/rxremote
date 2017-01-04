import assert from 'assert';
import http from 'http';

import Rx from 'rxjs';

import {ObservablesServer, ObservablesClient} from '../';
import {resumableWithOffset} from '../resumable';


const WebSocketClient = require('ws');

// This was copied from https://github.com/websockets/ws/pull/805/files.
// If this PR ever gets accepted, we can remove this.
WebSocketClient.prototype.removeEventListener = function(method, listener) {
  var listeners = this.listeners(method);
  for (var i = 0; i < listeners.length; i++) {
    if (listeners[i]._listener === listener) {
      this.removeListener(method, listeners[i]);
    }
  }
};

WebSocketClient.prototype.hasEventListener = function(method, listener) {
  var listeners = this.listeners(method);
  for (var i = 0; i < listeners.length; i++) {
    if (listeners[i]._listener === listener) {
      return true;
    }
  }
  return false;
};


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
    const observablesServer = new ObservablesServer(httpServer);
    const addr = httpServer.address();
    const endpoint = `ws://${addr.address}:${addr.port}`;
    const observablesClient = new ObservablesClient(endpoint, WebSocketClient);
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

  it('should pass parameters from the client to the server', () => {
    return createClientServerPair().then(function([server, client]) {
      server.add('test-observable', (cursor, params, socket) => (
        Rx.Observable.of(params.foo)
      ));

      return client.observable('test-observable', {foo: 'bar'})
          .take(1)
          .toPromise().then(function(result) {
            assert.equal(result, 'bar');
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

  it('should pass the socket and sessionId into the resumable function', () => {
    return createClientServerPair().then(function([server, client]) {
      server.add('test-observable',
        (cursor, params, socket, sessionId) => Rx.Observable.of(
          socket.upgradeReq.connection.remoteAddress
        )
      );

      return client.observable('test-observable')
        .take(1)
        .toPromise()
        .then((result) => {
          assert.equal(result, '127.0.0.1');
        });
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
