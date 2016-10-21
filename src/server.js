import {Server as WebSocketServer} from 'ws';
import Rx from 'rxjs';
import _ from 'lodash';

import {rewrapBatches} from './batches';

function onWebSocketConnection(socket, observables, connectionId, logSubject, eventSubject) {
  const remoteAddr = (
      socket.upgradeReq.headers['x-forwarded-for'] || 
      socket.upgradeReq.connection.remoteAddress
  );

  let sessionId = null;

  function log(message) {
    const str = `[${remoteAddr}] ${message}`;
    logSubject.next(str);
  }

  function send(object) {
    if (socket.readyState === 1) { // OPEN
      socket.send(JSON.stringify(object));
    } else {
      log(`Tried to send to WebSocket in readyState: ${socket.readyState}`)
    }
  }

  function createObserver(subscriptionId) {
    return {
      next(batch) {
        send({type: 'events', batch, subscriptionId});
      },
      error(error) {
        log(error);
        send({type: 'error', error, subscriptionId});
      },
      complete() {
        send({type: 'complete', subscriptionId});
      }
    }
  }

  function insertEvent(event) {
    const meta = {
      connectionId: connectionId,
      sessionId: sessionId,
      ipAddress: remoteAddr
    };

    eventSubject.next([event, meta]);
  }

  log("WebSocket connection opened");

  let subscriptions = {};

  // This gets called when the socket is closed.
  function cleanup() {
    log("Closing WebSocket");

    _.values(subscriptions).forEach(function(sub) {
      sub.unsubscribe();
    })
    subscriptions = {};

    insertEvent({type: 'connection-closed'});
  };

  socket.on('message', function(data) {
    let message;

    try {
      message = JSON.parse(data);
    } catch(e) {
      log("Error parsing JSON");
      console.error(e);
    }

    if (typeof message.type !== 'string') {
      log("Received message without a type")  
      return;
    }

    switch (message.type) {
      case 'hello':
        if (typeof message.sessionId !== 'string') {
          log('expected sessionId');
          break;
        }
        sessionId = message.sessionId;
        insertEvent({type: 'connection-open'});
        log("open session " + message.sessionId);
        break;

      case 'subscribe':
        if (typeof message.offset !== 'number') {
          log("expected offset number");
          break;
        }

        if (typeof message.subscriptionId !== 'number') {
          log("expected subscriptionId string");
          break;
        }

        if (message.subscriptionId in subscriptions) {
          log("subscriptionId sent twice: " + message.subscriptionId);
          break;
        }

        const fn = observables[message.name];

        log('subscribing to ' + message.name);

        if (fn) {
          const observable = fn(message.offset, socket, sessionId);
          if (observable && typeof observable.subscribe === 'function') {
            if (typeof observable.subscribe === 'function') {
              // TODO: If this is an ArrayObservable, just send the array
              // as one batch.
              //if (typeof Array.isArray(observable.array)) {
              //}

              const subscription = rewrapBatches(observable)
                .subscribe(createObserver(message.subscriptionId));

              subscription.name = message.name;

              subscriptions[message.subscriptionId] = subscription;
            }
          } else {
            console.error(`Expected Rx.Observable instance for key ${message.name}, got: ${observable}`);
            send({
              type: 'error',
              subscriptionId: message.subscriptionId,
              error: {
                code: '500',
                message: 'Internal Server Error'
              }
            });
          }
        } else {
          send({
            type: 'error',
            subscriptionId: message.subscriptionId,
            error: {
              code: 404,
              message: 'Not found'
            }
          })
        }

        break;

      case 'unsubscribe':
        if (!(message.subscriptionId in subscriptions)) {
          log("subscriptionId not found: " + message.subscriptionId);
          break;
        }

        if (typeof message.subscriptionId !== 'number') {
          log("expected subscriptionId number");
          break;
        }

        log('unsubscribing from ' + subscriptions[message.subscriptionId].name);
        subscriptions[message.subscriptionId].unsubscribe();
        delete subscriptions[message.subscriptionId];
        break;

      default:
        log(`Received unknown message type ${message.type}`)  
        return;
    }
  });

  socket.on('close', cleanup);
}


export default class Server {
  constructor(httpServer, routeTable={}) {
    this.routeTable = routeTable;

    if (httpServer) {
      this.attachToHttpServer(httpServer);
    }
  }

  attachToHttpServer(httpServer) {
    this.wss = new WebSocketServer({server: httpServer});
    this.attachToWebSocketServer(this.wss);
  }

  attachToWebSocketServer(wss) {
    let connectionCounter = 0;

    const eventSubject = new Rx.Subject();
    const logSubject = new Rx.Subject();

    this.events = eventSubject.asObservable();
    this.log = logSubject.asObservable();

    this.wss = wss;
    this.wss.on('connection', (socket) => {
      connectionCounter++;
      onWebSocketConnection(
          socket, this.routeTable, connectionCounter, logSubject, eventSubject
      );
    });
  }

  add(key, callback) {
    this.routeTable[key] = callback;
  }

  // cleanup() {
  //   _.invoke(this.wss.clients, 'cleanup');
  // }
}
