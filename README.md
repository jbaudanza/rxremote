RXRemote
========

RXRemote is a module that allows a client to subscribe to RxJs Observables on a
remote server. Clients can be either node or browser instances.

On disconnect, RXRemote will attempt to reconnect and restart observables where they left off.

## Installing with [NPM](https://www.npmjs.com/)

```bash`
$ npm install rxremote
```

## Simple example

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

## Continuing a subscription after reconnection

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

client:
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

## Batching results

COMING SOON: RxRemote contains an internal API for batching results together for efficiency. If there is interest, I
will polish this up and publish this.

## Server API

### `.logs`

This observable emits text strings suitable for sending to a log file

### `.events`

This observable emits an event object when a connection is open or closed. The objects look like:

```
  {
    type:         'string',          // 'connection-closed' or 'connection-open',
    connectionId: 'number',          // a numberic value that is unique to this connection
    sessionId:    'string',          // a uuid that is generated on the client and reused to call connections
    ipAddress:    'string'           // The IP address of the remote connection
  }
```

### `.wss`

This is a reference to the internet WebSocketServer.

## Client API

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

This is a UUID that is generated once per instance of the client VM. It will stay the same for each connection that is established.
This is useful for generating "presence" lists of connected clients.
