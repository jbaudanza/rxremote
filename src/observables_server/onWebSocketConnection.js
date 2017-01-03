// This is moved out of the main function because the try-catch will stop
// the V8 optimizer from working.
function parseJSON(data) {
  try {
    return JSON.parse(data);
  } catch(e) {
    console.error(e);
    return null;
  }
}

function defaultCursorFn(value, lastCursor) {
  if (typeof lastCursor === 'undefined') {
    return 1;
  } else {
    return lastCursor + 1;
  }
}


function isObservable(obj) {
  return typeof obj === 'object' && typeof obj.subscribe === 'function';
}

function addressForSocket(socket) {
  return (
    socket.upgradeReq.headers['x-forwarded-for'] ||
    socket.upgradeReq.connection.remoteAddress
  ).split(',').shift(); // TODO: This shift() is breaking the V8 compilation
}

export default function onWebSocketConnection(socket, observables, connectionId, logSubject, eventSubject) {
  const remoteAddr = addressForSocket(socket);

  function log(message) {
    logSubject.next(`[${remoteAddr}] ${message}`);
  }

  // For some reason, calling log() breaks the v8 optimizer, so we call the
  // logSubject directly.
  logSubject.next(`[${remoteAddr}] WebSocket connection opened`);

  let sessionId = null;

  function send(object) {
    if (socket.readyState === 1) { // OPEN
      socket.send(JSON.stringify(object));
    } else {
      log(`Tried to send to WebSocket in readyState: ${socket.readyState}`)
    }
  }

  function createObserver(subscriptionId) {
    return {
      next(value) {
        send({type: 'next', value, subscriptionId});
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

  let subscriptions = {};

  // This gets called when the socket is closed.
  function cleanup() {
    log("Closing WebSocket");

    for (let key in subscriptions) {
      if (subscriptions.hasOwnProperty(key)) {
        subscriptions[key].unsubscribe();
      }
    }

    subscriptions = {};

    insertEvent('connection-closed');
  };

  socket.on('message', function(data) {
    let message;

    message = parseJSON(data);
    if (message == null) {
      log("Error parsing JSON");
      return;
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
        insertEvent('connection-open');
        log("open session " + message.sessionId);
        break;

      case 'subscribe':
        if (typeof message.subscriptionId !== 'number') {
          log("expected subscriptionId string");
          break;
        }

        if (message.subscriptionId in subscriptions) {
          log("subscriptionId sent twice: " + message.subscriptionId);
          break;
        }

        const result = observables[message.name];

        log('subscribing to ' + message.name);

        if (result) {
          let observable;

          if (typeof result === 'function') {
            const ret = result(message.cursor, socket, sessionId);
            if (isObservable(ret)) {
              observable = ret;
            } else {
              console.error(`Expected function to return an Rx.Observable instance ${message.name}, got: ${observable}`);
              send({
                type: 'error',
                subscriptionId: message.subscriptionId,
                error: {
                  code: '500',
                  message: 'Internal Server Error'
                }
              });
              break;
            }
          } else if (typeof result === 'object' && typeof result.subscribe === 'function') {
            observable = result;
          } else {
            console.error(`Expected Rx.Observable instance for key ${message.name}, got: ${result}`);
            send({
              type: 'error',
              subscriptionId: message.subscriptionId,
              error: {
                code: '500',
                message: 'Internal Server Error'
              }
            });
            break;
          }

          const subscription = observable.subscribe(
            createObserver(message.subscriptionId)
          );

          subscription.name = message.name;
          subscriptions[message.subscriptionId] = subscription;

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
