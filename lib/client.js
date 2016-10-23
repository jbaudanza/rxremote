'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _rxjs = require('rxjs');

var _rxjs2 = _interopRequireDefault(_rxjs);

var _nodeUuid = require('node-uuid');

var _nodeUuid2 = _interopRequireDefault(_nodeUuid);

var _batches = require('./batches');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var sessionId = _nodeUuid2.default.v4();

var WebSocketClient = void 0;
if ((typeof window === 'undefined' ? 'undefined' : _typeof(window)) === 'object') {
  WebSocketClient = window.WebSocket;
} else {
  WebSocketClient = require('ws');

  // This was copied from https://github.com/websockets/ws/pull/805/files.
  // If this PR ever gets accepted, we can remove this.
  WebSocketClient.prototype.removeEventListener = function (method, listener) {
    var listeners = this.listeners(method);
    for (var i = 0; i < listeners.length; i++) {
      if (listeners[i]._listener === listener) {
        this.removeListener(method, listeners[i]);
      }
    }
  };

  WebSocketClient.prototype.hasEventListener = function (method, listener) {
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
  if ('onLine' in navigator) return navigator.onLine;else return true;
}

function isOffline() {
  return !isOnline();
}

function openSocket(endpoint, privateState, failures) {
  // Don't open two WebSockets at once.
  if (privateState.socket) return;

  if (privateState.reconnectTimerId) {
    clearTimeout(privateState.reconnectTimerId);
    privateState.reconnectTimerId = null;
  }

  privateState.socket = new WebSocketClient(endpoint);
  var cleanup = [];

  var messageStream = _rxjs2.default.Observable.fromEvent(privateState.socket, 'message').map(function (e) {
    return JSON.parse(e.data);
  });

  cleanup.push(messageStream.subscribe(privateState.incomingMessages));

  function send(object) {
    privateState.socket.send(JSON.stringify(object));
  }

  function sendSubscribe(subscriptionInfo) {
    send({
      type: 'subscribe',
      name: subscriptionInfo.name,
      offset: subscriptionInfo.offset,
      subscriptionId: subscriptionInfo.subscriptionId
    });
  }

  function sendUnsubscribe(subscriptionId) {
    send({
      type: 'unsubscribe',
      subscriptionId: subscriptionId
    });
  }

  privateState.socket.addEventListener('open', function () {
    send({
      type: 'hello', sessionId: sessionId
    });

    Object.keys(privateState.subscriptionState).forEach(function (subscriptionId) {
      sendSubscribe(privateState.subscriptionState[subscriptionId]);
    });

    cleanup.push(privateState.subscribes.subscribe(sendSubscribe));
    cleanup.push(privateState.unsubscribes.subscribe(sendUnsubscribe));

    failures = 0;
    privateState.connectedSubject.next(true);
    privateState.reconnectingAtSubject.next(null);
  });

  privateState.socket.addEventListener('close', function (event) {
    privateState.socket = null;
    privateState.connectedSubject.next(false);

    // This will max out around 4 minutes
    var delay = Math.pow(2, Math.min(failures, 8)) * 1000;
    privateState.reconnectTimerId = setTimeout(function () {
      return openSocket(endpoint, privateState, failures + 1);
    }, delay);
    privateState.reconnectingAtSubject.next(Date.now() + delay);

    cleanup.forEach(function (sub) {
      return sub.unsubscribe();
    });
  });
}

var Client = function () {
  function Client(endpoint) {
    _classCallCheck(this, Client);

    var privateState = {
      incomingMessages: new _rxjs2.default.Subject(),
      connectedSubject: new _rxjs2.default.BehaviorSubject(false),
      reconnectingAtSubject: new _rxjs2.default.BehaviorSubject(null),
      subscriptionState: {},
      subscribes: new _rxjs2.default.Subject(),
      unsubscribes: new _rxjs2.default.Subject(),
      subscriptionCounter: 0,
      reconnectTimerId: null,
      socket: null
    };

    this.privateState = privateState;
    this.connected = privateState.connectedSubject.asObservable();
    this.reconnectingAt = privateState.reconnectingAtSubject.asObservable();
    this.sessionId = sessionId;

    this.reconnect = function () {
      openSocket(endpoint, privateState, 0);
    };

    if ((typeof window === 'undefined' ? 'undefined' : _typeof(window)) === 'object') {
      window.addEventListener("online", this.reconnect.bind(this));
    }

    this.reconnect();

    privateState.subscribes.subscribe(function (subscriptionInfo) {
      privateState.subscriptionState[subscriptionInfo.subscriptionId] = subscriptionInfo;
    });

    privateState.unsubscribes.subscribe(function (subscriptionId) {
      delete privateState.subscriptionState[subscriptionId];
    });

    privateState.incomingMessages.subscribe(onMessage);

    function onMessage(message) {
      if (message.subscriptionId in privateState.subscriptionState) {
        var state = privateState.subscriptionState[message.subscriptionId];
        switch (message.type) {
          case 'error':
            state.observer.error(message.error);
            break;
          case 'complete':
            state.observer.complete();
            break;
          case 'events':
            state.offset += message.batch.length;
            state.observer.next(message.batch);
            break;
        }
      }
    }
  }

  _createClass(Client, [{
    key: 'observable',
    value: function observable(name) {
      var privateState = this.privateState;

      var batches = _rxjs2.default.Observable.create(function (observer) {
        var subscriptionId = privateState.subscriptionCounter;
        privateState.subscriptionCounter++;

        privateState.subscribes.next({
          observer: observer,
          name: name,
          subscriptionId: subscriptionId,
          offset: 0
        });

        return function () {
          privateState.unsubscribes.next(subscriptionId);
        };
      });

      return (0, _batches.unwrapBatches)(batches);
    }
  }]);

  return Client;
}();

exports.default = Client;