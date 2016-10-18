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
import Server as ObservablesServer from 'rxremote/server';

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