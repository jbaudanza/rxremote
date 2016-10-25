import v8 from 'v8-natives'
import assert from 'assert';
import Rx from 'rxjs';
import EventEmitter from 'events';

import onWebSocketConnection from '../lib/server/onWebSocketConnection';

describe('server', () => {
  it('should optimize the connection handler', () => {
    // This will fail if tests are run without --allow-natives-syntax
    assert(v8.isNative())

    // This quacks close enough to a WebSocket
    const socket = new EventEmitter();
    socket.readyState = 1;
    socket.upgradeReq = {
      headers: {},
      connection: {
        remoteAdddress: '127.0.0.1'
      }
    };

    const observables = {
      foo() { return Rx.Observable.of(1,2,3); }
    };
    const subject = new Rx.Subject();

    function doCall() {
      // We just want this to run, we don't care what it actually does in this
      // specific test.
      onWebSocketConnection(
          socket,
          observables,
          0, // connectionId
          subject, // logSubject
          subject // eventSubject
      );
    }

    // TODO: This doesn't test the optimization of any of the anonymous functions
    // that are inside of onWebSocketConnection. We should probably pull those
    // out into their own functions and test them individually.

    // For more info on how this works, checkout:
    // https://github.com/petkaantonov/bluebird/wiki/Optimization-killers
    doCall();
    v8.optimizeFunctionOnNextCall(onWebSocketConnection);
    doCall();

    assert.equal(1, v8.getOptimizationStatus(onWebSocketConnection));
  });
});
