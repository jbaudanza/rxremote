RxRemote
========

RXRemote is a module that allows a client to subscribe to RxJs Observables on a
remote server. Clients can be either node or browser instances.

On disconnect, RxRemote will attempt to reconnect and restart observables where they left off.

## Installing with [NPM](https://www.npmjs.com/)

```bash`
$ npm install rxremote
```
## Why RxRemote?

RxRemote provides functionality that is similar to a [WebSocketSubject](https://github.com/ReactiveX/rxjs/blob/master/src/observable/dom/WebSocketSubject.ts). However, RxRemote adds the concept of cursors to your Observables. This allows RxRemote to handle reconnections transparently to the client application.

## Simple example

server:

```js
import http from 'http';
import ObservablesServer from 'rxremote/observables_server';

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
import ObservablesClient from 'rxremote/observables_client';

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

Usually when a disconnection event happens, an error will be emitted on all open
observables and it will be up to the client application to resubscribe.

You can have the `ObservableClient` handle this resubscription transparently
by structuring your observable to emit objects that look like:

```
{
  cursor: 1      // Some value that can be used to resume your observable
  value: 'hello' // The main value object that you are observing
}
```

A `cursor` can be any number, string or JSON-serializable object that your
observable can use to resume where it left off.

For example:

server:

```js
const observablesServer = new ObservablesServer(httpServer, {
  counter(cursor) {
    return Rx.Observable.interval(1000).map(x => ({
      cursor: x,
      value: cursor + x
    }));
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

This is a reference to the internal WebSocketServer.

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

## Related

If you're building an RxJs based application in node, you might find these other modules handy:

  - [rxnotifier](https://github.com/jbaudanza/rxnotifier) - Notification channels backed by redis and/or PostgreSQL
  - [rxeventstore](https://github.com/jbaudanza/rxeventstore) - Persist and query your data using the Event Sourcing pattern
