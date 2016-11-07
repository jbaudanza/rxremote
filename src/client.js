import Rx from 'rxjs';
import uuid from 'node-uuid';

const sessionId = uuid.v4();


let WebSocketClient;
if (typeof window === 'object') {
  WebSocketClient = window.WebSocket;
} else {
  WebSocketClient = require('ws');

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
}


function isOnline() {
  if ('onLine' in navigator)
    return navigator.onLine;
  else
    return true;
}

function isOffline() {
  return !isOnline();
}


function openSocket(endpoint, privateState, failures) {
  // Don't open two WebSockets at once.
  if (privateState.socket)
    return;

  if (privateState.reconnectTimerId) {
    clearTimeout(privateState.reconnectTimerId);
    privateState.reconnectTimerId = null;
  }


  privateState.socket = new WebSocketClient(endpoint);
  const cleanup = [];

  const messageStream = Rx.Observable.fromEvent(privateState.socket, 'message')
      .map(e => JSON.parse(e.data));

  cleanup.push(
    messageStream.subscribe(privateState.incomingMessages)
  );

  function send(object) {
    if (privateState.socket) {
      privateState.socket.send(JSON.stringify(object));
    }
  }

  function sendSubscribe(subscriptionInfo) {
    send({
      type: 'subscribe',
      name: subscriptionInfo.name,
      cursor: subscriptionInfo.cursor,
      subscriptionId: subscriptionInfo.subscriptionId
    });
  }

  function sendUnsubscribe(subscriptionId) {
    send({
      type: 'unsubscribe',
      subscriptionId: subscriptionId
    });
  }

  privateState.socket.addEventListener('open', function() {
    send({
      type: 'hello', sessionId: sessionId
    });

    Object.keys(privateState.subscriptionState).forEach(function(subscriptionId) {
      sendSubscribe(privateState.subscriptionState[subscriptionId]);
    });

    cleanup.push(privateState.subscribes.subscribe(sendSubscribe));
    cleanup.push(privateState.unsubscribes.subscribe(sendUnsubscribe));

    failures = 0;
    privateState.connectedSubject.next(true);
    privateState.reconnectingAtSubject.next(null);
  });

  privateState.socket.addEventListener('close', function(event) {
    privateState.socket = null;
    privateState.connectedSubject.next(false);

    Object.keys(privateState.subscriptionState).forEach(function(subId) {
      if (!privateState.subscriptionState[subId].resumable) {
        privateState.subscriptionState[subId].observer.error(event);
        delete privateState.subscriptionState[subId];
      }
    });

    // This will max out around 4 minutes
    const delay = Math.pow(2, Math.min(failures, 8)) * 1000;
    privateState.reconnectTimerId = setTimeout(
      () => openSocket(endpoint, privateState, failures+1), delay
    );
    privateState.reconnectingAtSubject.next(Date.now() + delay);

    cleanup.forEach((sub) => sub.unsubscribe());
  });
}


export default class Client {
  constructor(endpoint) {
    const privateState = {
      incomingMessages: new Rx.Subject(),
      connectedSubject: new Rx.BehaviorSubject(false),
      reconnectingAtSubject: new Rx.BehaviorSubject(null),
      subscriptionState: {},
      subscribes: new Rx.Subject(),
      unsubscribes: new Rx.Subject(),
      subscriptionCounter: 0,
      reconnectTimerId: null,
      socket: null
    }

    this.privateState = privateState;
    this.connected = privateState.connectedSubject.asObservable();
    this.reconnectingAt = privateState.reconnectingAtSubject.asObservable();
    this.sessionId = sessionId;

    this.reconnect = function() {
      openSocket(endpoint, privateState, 0);
    }

    if (typeof window === 'object') {
      window.addEventListener("online", this.reconnect.bind(this));
    }

    this.reconnect();

    privateState.subscribes.subscribe(function(subscriptionInfo) {
      privateState.subscriptionState[subscriptionInfo.subscriptionId] = subscriptionInfo;
    });

    privateState.unsubscribes.subscribe(function(subscriptionId) {
      delete privateState.subscriptionState[subscriptionId];
    });

    privateState.incomingMessages.subscribe(onMessage);


    function onMessage(message) {
      if (message.subscriptionId in privateState.subscriptionState) {
        const state = privateState.subscriptionState[message.subscriptionId];
        switch (message.type) {
          case 'error':
            state.observer.error(message.error);
            break;
          case 'complete':
            state.observer.complete();
            break;
          case 'next':
            state.resumable = message.resumable;

            if (message.resumable) {
              state.cursor = message.value.cursor;
              state.observer.next(message.value.value);
            } else {
              state.observer.next(message.value);
            }

            break;
        }
      }
    }
  }

  observable(name) {
    const privateState = this.privateState;

    return Rx.Observable.create(function(observer) {
      const subscriptionId = privateState.subscriptionCounter;
      privateState.subscriptionCounter++;

      privateState.subscribes.next({
        observer: observer,
        name: name,
        // Observerables start as resumable, unless the server tells us
        // otherwise
        resumable: true,
        subscriptionId: subscriptionId
      });

      return function() {
        privateState.unsubscribes.next(subscriptionId);
      }
    });
  }
}
