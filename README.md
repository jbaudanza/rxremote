RXRemote
========

RXRemote is a module that allows a client to subscribe to RxJs Observables on a
remote server. Clients can be either node or browser instances.

On disconnect, RXRemote will attempt to reconnect and restart observables where it left off.

An optional API is included for sending observable events in batches for efficiency.

Simple example
--------------

server:

```js
import http from 'http';
import ObservablesServer from 'rxremote/server';

const httpServer = http.createServer();
httpServer.listen(5000);

const observablesServer = new ObservablesServer(httpServer, {
  counter() {
    return Rx.Observable.of(1,2,3);
  }
});
```

client:

```js
import ObservablesClient from 'rxremote/client';

const client = new ObservablesClient('ws://localhost:5000');
const source = client.observable('counter')

const subscription = source.subscribe(
    function (x) {
        console.log('Next: ' + x);
    },
    function (err) {
        console.log('Error: ' + err);
    },
    function () {
        console.log('Completed');
    });

// => Next: 1
// => Next: 2
// => Next: 3
// => Completed

```

Continuing a subscription after reconnection
--------------------------------------------

server:
```js
const observablesServer = new ObservablesServer(httpServer, {
  /*
    When a reconnection occurs, an `offset` parameter will be passed to the
    handler which indicates how many events have been previously consumed by
    the client. Depending on the nature of the Observable, you might handle this
    in different ways.
  */
  counter(offset) {
    return Rx.Observable.interval(1000).map(x => offset + x);
  }
});
```


```js
const client = new ObservablesClient('ws://localhost:5000');
const source = client.observable('counter')

const subscription = source.subscribe(
    function (x) {
        console.log('Next: ' + x);
    },
    function (err) {
        console.log('Error: ' + err);
    },
    function () {
        console.log('Completed');
    });

// => Next: 1
// => Next: 2
// => Next: 3

// -- Network event causes a reconnection

// => Next: 4
// => Next: 5
// => Next: 6

```

Batching results
----------------



Server API
----------

### `.logs`

### `.events`

### `.wss`

Client API
----------

### `.observable(name)`

Returns an observable that will marshall subscriptions to the remote server.

### `.reconnect()`

If the client in a disconnected state, this will attempt to reconnect. This
does nothing if the client already in a connected or connecting state.

### `.connected`

This is an observable that emits a `true` boolean value when the client is
connected and a `false` boolean value when the client is disconnected.

### `.reconnectingAt`

If this client is in a disconnected state, this observable will emit a timestamp
that represents when the client will try to make a new connection.

### `.sessionId`

TODO: Write me
