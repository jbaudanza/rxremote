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
      server.add('test-observable', () => Rx.Observable.from([1,2,3,4]));

      return client.observable('test-observable')
          .reduce((l, i) => l.concat(i), [])
          .forEach(function(l) {
            assert.deepEqual(l, [1,2,3,4]);
          });
    });
  });

  it('should propogate errors to the client', () => {
    return createClientServerPair().then(function([server, client]) {
      server.add('test-observable', () => Rx.Observable.throw('Test error'));

      return client.observable('test-observable')
        .toPromise()
        .then(
          function(result) { throw new Error('Promise was unexpectedly fulfilled. Result: ' + result) },
          function(err) { assert.equal("Test error", err); }
        )
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

      server.add('test-observable', (offset) => subject.skip(offset));

      const observable = client.observable('test-observable')

      const results = [];
      observable.subscribe(x => results.push(x));

      return observable
        .take(3)
        .toPromise()
        .then(function() {
          assert.deepEqual([1,2,3], results);

          // Cause a disconnection
          assert.equal(1, server.wss.clients.length);
          server.wss.clients[0].close();

          subject.next(4);
          subject.next(5);
          subject.next(6);

          return observable.take(3).toPromise();
        }).then(function() {
          assert.deepEqual([1,2,3,4,5,6], results);
        });

    });
  });
});
