import Rx from 'rxjs';


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


export default function onWebSocketConnection(socket, observables, connectionId, logSubject, eventSubject) {
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

  function createObserver(subscriptionId, resumable) {
    return {
      next(value) {
        send({type: 'next', value, resumable, subscriptionId});
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

    for (let key in subscriptions) {
      if (subscriptions.hasOwnProperty(key)) {
        subscriptions[key].unsubscribe();
      }
    }

    subscriptions = {};

    insertEvent({type: 'connection-closed'});
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
        insertEvent({type: 'connection-open'});
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
          let resumable;

          // If function, then this is resumable
          if (typeof result === 'function') {
            const ret = result(message.cursor, socket, sessionId);
            if (isObservable(ret)) {
              observable = ret;
              resumable = true;
            } else {
              console.error(`Expected Rx.Observable instance for resumable ${message.name}, got: ${observable}`);
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
            resumable = false;
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
            createObserver(message.subscriptionId, resumable)
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
